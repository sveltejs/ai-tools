import fs from 'node:fs/promises';
import path from 'node:path';

let content = '';

const prompts_generators = fs.glob('./packages/mcp-server/src/mcp/handlers/prompts/*.ts');

const filename_regex = /packages\/mcp-server\/src\/mcp\/handlers\/prompts\/(?<prompt>.+)\.ts/;

for await (const file of prompts_generators) {
	const title = file.match(filename_regex)?.groups?.prompt;
	if (title === 'index') continue;
	const module = await import(path.resolve('./', file));
	content += `## ${title}

${module.docs_description}

<details>
	<summary>Copy the prompt</summary>

<!-- prettier-ignore-start -->
\`\`\`\`markdown
${await module.generate_for_docs()}
\`\`\`\`
<!-- prettier-ignore-end -->

</details>

`;
}

const generated_dir = './documentation/docs/30-mcp/.generated';
await fs.mkdir(generated_dir, { recursive: true });
await fs.writeFile(path.join(generated_dir, 'prompts.md'), content.trim() + '\n');
