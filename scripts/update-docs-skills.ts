import fs from 'node:fs/promises';
import path from 'node:path';

interface SkillFrontmatter {
	name: string;
	description: string;
}

function get_backtick_fence(content: string): string {
	const backtick_pattern = /`{3,}/g;
	let max_backticks = 3;

	let match;
	while ((match = backtick_pattern.exec(content)) !== null) {
		max_backticks = Math.max(max_backticks, match[0].length);
	}

	return '`'.repeat(max_backticks + 1);
}

function parse_frontmatter(
	content: string,
): { frontmatter: SkillFrontmatter; body: string } | null {
	const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
	if (!match) return null;

	const frontmatter_str = match[1];
	const body = match[2];

	if (!frontmatter_str || body === undefined) return null;

	const frontmatter: Record<string, string> = {};

	for (const line of frontmatter_str.split('\n')) {
		const [key, ...value_parts] = line.split(':');
		if (key && value_parts.length > 0) {
			frontmatter[key.trim()] = value_parts.join(':').trim();
		}
	}

	return {
		frontmatter: frontmatter as unknown as SkillFrontmatter,
		body: body.trim(),
	};
}

let content = '';

const skills_dir = './plugins/svelte/skills';
const skill_dirs = (await fs.readdir(skills_dir)).filter((name) => !name.startsWith('.'));

for (const skill_name of skill_dirs) {
	const skill_path = path.join(skills_dir, skill_name, 'SKILL.md');

	try {
		const skill_content = await fs.readFile(skill_path, 'utf-8');
		const parsed = parse_frontmatter(skill_content);

		if (!parsed) {
			console.warn(`Warning: Could not parse frontmatter for ${skill_name}`);
			continue;
		}

		const { frontmatter, body } = parsed;
		const fence = get_backtick_fence(body);

		content += `## \`${frontmatter.name}\`

${frontmatter.description}

<a href="https://github.com/sveltejs/ai-tools/releases?q=${frontmatter.name}" target="_blank" rel="noopener noreferrer">Open Releases page</a>

<details>
	<summary>View skill content</summary>

<!-- prettier-ignore-start -->
${fence}markdown
${body}
${fence}
<!-- prettier-ignore-end -->

</details>

`;
	} catch {
		console.warn(`Warning: Could not read skill at ${skill_path}`);
	}
}

const generated_dir = './documentation/docs/60-skills/.generated';
await fs.mkdir(generated_dir, { recursive: true });
await fs.writeFile(path.join(generated_dir, 'skills.md'), content.trim() + '\n');
