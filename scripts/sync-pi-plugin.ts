import fs from 'node:fs/promises';
import path from 'node:path';

const PI_PKG_DIR = './packages/pi';
const TOOLS_DIR = './tools';

/**
 * Sync skills from tools/ to pi package (direct copy)
 */
async function sync_skills() {
	const source = path.join(TOOLS_DIR, 'skills');
	const dest = path.join(PI_PKG_DIR, 'skills');

	await fs.rm(dest, { recursive: true, force: true });
	await fs.cp(source, dest, { recursive: true });

	console.log('Synced skills to pi package');
}

/**
 * Sync AGENTS.md from tools/ to pi package
 */
async function sync_agents_md() {
	const source = path.join(TOOLS_DIR, 'instructions', 'AGENTS.md');
	const dest = path.join(PI_PKG_DIR, 'instructions', 'pi-agents.md');

	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.copyFile(source, dest);

	console.log('Synced AGENTS.md to pi package');
}

await sync_skills();
await sync_agents_md();

console.log('pi plugin sync complete');
