import type { Plugin } from '@opencode-ai/plugin';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get_mcp_config } from './config.js';

const current_dir = dirname(fileURLToPath(import.meta.url));

export const svelte_plugin: Plugin = async (ctx) => {
	return {
		async config(input) {
			input.agent ??= {};
			input.mcp ??= {};
			input.instructions ??= [];
			// @ts-expect-error -- types are wrong in the opencode package...will fix there and remove this
			input.skills ??= {};
			// @ts-expect-error -- types are wrong in the opencode package...will fix there and remove this
			input.skills.paths ??= [];
			// by default we use svelte as the name for the svelte MCP server
			let svelte_mcp_name = 'svelte';
			// we loop over every mcp server to see if any of them is already the svelte MCP server
			for (const name in input.mcp) {
				const mcp = input.mcp[name];
				if (
					(mcp?.type === 'remote' && mcp.url.includes('https://mcp.svelte.dev/mcp')) ||
					(mcp?.type === 'local' &&
						mcp.command.some((cmd: string) => cmd.includes('@sveltejs/mcp')))
				) {
					// if we found the svelte MCP server, we store its name and break
					svelte_mcp_name = name;
					break;
				}
			}
			const mcp_config = get_mcp_config(ctx);

			if (mcp_config.instructions?.enabled !== false) {
				const instructions_dir = join(current_dir, 'instructions');
				const instructions_paths = await readdir(instructions_dir);
				input.instructions.push(...instructions_paths.map((file) => join(instructions_dir, file)));
			}

			if (mcp_config.skills?.enabled !== false) {
				const skills_dir = join(current_dir, 'skills');
				// @ts-expect-error -- skills is a new opencode feature
				input.skills.paths.push(skills_dir);
			}

			// if the user doesn't have the MCP server already we add one based on config
			if (!input.mcp[svelte_mcp_name] && mcp_config.mcp?.enabled !== false) {
				if (mcp_config.mcp?.type === 'remote') {
					input.mcp[svelte_mcp_name] = {
						type: 'remote',
						url: 'https://mcp.svelte.dev/mcp',
					};
				} else {
					input.mcp[svelte_mcp_name] = {
						type: 'local',
						command: ['npx', '-y', '@sveltejs/mcp'],
					};
				}
			}
			if (mcp_config.subagent?.enabled !== false) {
				// we add the editor subagent that will be used when editing Svelte files to prevent wasting context on the main agent
				input.agent['svelte-file-editor'] = {
					color: '#ff3e00',
					mode: 'subagent',
					prompt: `You are a Svelte 5 expert responsible for writing, editing, and validating Svelte components and modules. You have access to the Svelte MCP server which provides documentation and code analysis tools. Always use the tools from the svelte MCP server to fetch documentation with \`get_documentation\` and validating the code with \`svelte_autofixer\`. If the autofixer returns any issue or suggestions try to solve them.

If the MCP tools are not available you can use the \`svelte-code-editor\` skill to learn how to use the \`@sveltejs/mcp\` cli to access the same tools.

If the skill is not available you can run \`npx @sveltejs/mcp@latest -y --help\` to learn how to use it.

## Available MCP Tools

### 1. list-sections

Lists all available Svelte 5 and SvelteKit documentation sections with titles and paths. Use this first to discover what documentation is available.

### 2. get-documentation

Retrieves full documentation for specified sections. Accepts a single section name or an array of section names. Use after \`list-sections\` to fetch relevant docs for the task at hand.

**Example sections:** \`$state\`, \`$derived\`, \`$effect\`, \`$props\`, \`$bindable\`, \`snippets\`, \`routing\`, \`load functions\`

### 3. svelte-autofixer

Analyzes Svelte code and returns suggestions to fix issues. Pass the component code directly to this tool. It will detect common mistakes like:

- Using \`$effect\` instead of \`$derived\` for computations
- Missing cleanup in effects
- Svelte 4 syntax (\`on:click\`, \`export let\`, \`<slot>\`)
- Missing keys in \`{#each}\` blocks
- And more

## Workflow

When invoked to work on a Svelte file:

### 1. Gather Context (if needed)

If you're uncertain about Svelte 5 syntax or patterns, use the MCP tools:

1. Call \`list-sections\` to see available documentation
2. Call \`get-documentation\` with relevant section names

### 2. Read the Target File

Read the file to understand the current implementation.

### 3. Make Changes

Apply edits following Svelte 5 best practices:

### 4. Validate Changes

After editing, ALWAYS call \`svelte-autofixer\` with the updated code to check for issues.

### 5. Fix Any Issues

If the autofixer reports problems, fix them and re-validate until no issues remain.

## Output Format

After completing your work, provide:

1. Summary of changes made
2. Any issues found and fixed by the autofixer
3. Recommendations for further improvements (if any)
`,
					description:
						'Specialized Svelte 5 code editor. MUST BE USED PROACTIVELY when creating, editing, or reviewing any .svelte file or .svelte.ts/.svelte.js module and MUST use the tools from the MCP server or the `svelte-code-writer` skill if they are available. Fetches relevant documentation and validates code using the Svelte MCP server tools.',
					permission: {
						bash: 'ask',
						edit: 'allow',
						webfetch: 'ask',
					},
					tools: {
						[`${svelte_mcp_name}_*`]: true,
					},
				};
			}
		},
	};
};
