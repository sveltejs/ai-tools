import fs from 'node:fs/promises';
import path from 'node:path';

const OPENCODE_PKG_DIR = './packages/opencode';
const TOOLS_DIR = './tools';
const DOCS_AGENTS_DIR = './documentation/docs/20-instructions/.generated';

/**
 * Sync skills from tools/ to opencode package (direct copy)
 */
async function sync_skills() {
	const source = path.join(TOOLS_DIR, 'skills');
	const dest = path.join(OPENCODE_PKG_DIR, 'skills');

	await fs.rm(dest, { recursive: true, force: true });
	await fs.cp(source, dest, { recursive: true });

	console.log('Synced skills to opencode package');
}

/**
 * Sync AGENTS.md from tools/ to opencode package and documentation site
 */
async function sync_agents_md() {
	const source = path.join(TOOLS_DIR, 'instructions', 'AGENTS.md');
	const opencode_dest = path.join(OPENCODE_PKG_DIR, 'instructions', 'opencode-agents.md');
	const docs_dest = path.join(DOCS_AGENTS_DIR, 'agents.md');

	await fs.mkdir(path.dirname(opencode_dest), { recursive: true });
	await fs.mkdir(DOCS_AGENTS_DIR, { recursive: true });

	const content = await fs.readFile(source, 'utf-8');

	await fs.writeFile(opencode_dest, content);
	await fs.writeFile(docs_dest, content);

	console.log('Synced AGENTS.md to opencode package and documentation');
}

await sync_skills();
await sync_agents_md();

console.log('OpenCode plugin sync complete');
