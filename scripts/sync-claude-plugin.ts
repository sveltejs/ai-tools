import fs from 'node:fs/promises';
import path from 'node:path';
import { sync_skills } from './sync-skills.ts';

const CLAUDE_PLUGIN_DIR = './plugins/claude/svelte';
const TOOLS_DIR = './tools';

/**
 * Sync agent definitions from tools/ to Claude plugin,
 * adding Claude-specific frontmatter fields (permissionMode: acceptEdits)
 */
async function sync_agents() {
	const source = path.join(TOOLS_DIR, 'agents');
	const dest = path.join(CLAUDE_PLUGIN_DIR, 'agents');

	await fs.rm(dest, { recursive: true, force: true });
	await fs.mkdir(dest, { recursive: true });

	const files = await fs.readdir(source);

	for (const file of files) {
		if (!file.endsWith('.md')) continue;

		const content = await fs.readFile(path.join(source, file), 'utf-8');

		// Add Claude-specific frontmatter fields
		const transformed = content.replace(
			/^(---\n)([\s\S]*?)(---\n)/m,
			(_match, open, frontmatter, close) => {
				return `${open}${(frontmatter as string).trimEnd()}\npermissionMode: acceptEdits\n${close}`;
			},
		);

		await fs.writeFile(path.join(dest, file), transformed);
	}

	console.log('Synced agents to Claude plugin');
}

await sync_skills(path.join(TOOLS_DIR, 'skills'), path.join(CLAUDE_PLUGIN_DIR, 'skills'));
await sync_agents();

console.log('Claude plugin sync complete');
