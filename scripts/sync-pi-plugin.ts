import fs from 'node:fs/promises';
import path from 'node:path';
import { sync_skills } from './sync-skills.ts';

const PI_PKG_DIR = './packages/pi';
const TOOLS_DIR = './tools';

/**
 * Sync AGENTS.md from tools/ to pi package
 */
async function sync_agents_md() {
	const source = path.join(TOOLS_DIR, 'instructions', 'AGENTS.md');
	const dest = path.join(PI_PKG_DIR, 'instructions', 'pi-agents.md');

	await fs.mkdir(path.dirname(dest), { recursive: true });
	await fs.copyFile(source, dest);

	console.log('Synced AGENTS.md to Pi package');
}

await sync_skills(path.join(TOOLS_DIR, 'skills'), path.join(PI_PKG_DIR, 'skills'));
await sync_agents_md();

console.log('pi plugin sync complete');
