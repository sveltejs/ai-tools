import fs from 'node:fs/promises';
import path from 'node:path';

const CURSOR_PLUGIN_DIR = './svelte-cursor';
const CLAUDE_PLUGIN_DIR = './plugins/svelte';
const AGENTS_MD_PATH = './instructions/AGENTS.md';

/**
 * Sync skills from Claude plugin to Cursor plugin (direct copy)
 */
async function sync_skills() {
	const source = path.join(CLAUDE_PLUGIN_DIR, 'skills');
	const dest = path.join(CURSOR_PLUGIN_DIR, 'skills');

	await fs.rm(dest, { recursive: true, force: true });
	await fs.cp(source, dest, { recursive: true });

	console.log('Synced skills to Cursor plugin');
}

/**
 * Sync agent definition from Claude plugin to Cursor plugin,
 * stripping Claude-specific frontmatter fields (permissionMode)
 */
async function sync_agents() {
	const source = path.join(CLAUDE_PLUGIN_DIR, 'agents');
	const dest = path.join(CURSOR_PLUGIN_DIR, 'agents');

	await fs.rm(dest, { recursive: true, force: true });
	await fs.mkdir(dest, { recursive: true });

	const files = await fs.readdir(source);

	for (const file of files) {
		if (!file.endsWith('.md')) continue;

		const content = await fs.readFile(path.join(source, file), 'utf-8');

		// Strip Claude-specific frontmatter fields
		const transformed = content.replace(
			/^(---\n)([\s\S]*?)(---\n)/m,
			(_match, open, frontmatter, close) => {
				const filtered_lines = (frontmatter as string)
					.split('\n')
					.filter((line: string) => !line.startsWith('permissionMode:'))
					.join('\n');
				return `${open}${filtered_lines}${close}`;
			},
		);

		await fs.writeFile(path.join(dest, file), transformed);
	}

	console.log('Synced agents to Cursor plugin');
}

/**
 * Sync AGENTS.md instructions as a Cursor rule (.mdc file with frontmatter)
 */
async function sync_rules() {
	const dest = path.join(CURSOR_PLUGIN_DIR, 'rules');

	await fs.rm(dest, { recursive: true, force: true });
	await fs.mkdir(dest, { recursive: true });

	const agents_content = await fs.readFile(AGENTS_MD_PATH, 'utf-8');

	const rule_content = `---
description: Instructions for using the Svelte MCP server tools for documentation lookup, code analysis, and validation
alwaysApply: true
---

${agents_content.trim()}
`;

	await fs.writeFile(path.join(dest, 'svelte-mcp-tools.mdc'), rule_content);

	console.log('Synced rules to Cursor plugin');
}

await sync_skills();
await sync_agents();
await sync_rules();

console.log('Cursor plugin sync complete');
