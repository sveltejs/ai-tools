import fs from 'node:fs/promises';
import path from 'node:path';

// Standalone-only skills. Add a skill's directory name here to omit it from every plugin.
const excluded_skills = ['svelte-mcp-feedback'];

export async function sync_skills(source: string, dest: string) {
	await fs.rm(dest, { recursive: true, force: true });
	await fs.cp(source, dest, {
		recursive: true,
		filter: (source_path) => {
			const skill_name = path.relative(source, source_path).split(path.sep)[0];
			return !excluded_skills.includes(skill_name ?? '');
		},
	});

	console.log(`Synced skills to ${dest}`);
}
