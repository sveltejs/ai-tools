import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const package_json_string = await readFile(resolve('./package.json'), 'utf-8');
const package_json = JSON.parse(package_json_string);

const server_json_path = resolve('./server.json');
const server_json_string = await readFile(server_json_path, 'utf-8');
const server_json = JSON.parse(server_json_string);

server_json.version = package_json.version;
server_json.packages[0].version = package_json.version;

await writeFile(server_json_path, JSON.stringify(server_json, null, '\t') + '\n', 'utf-8');

// The skill and the subagent tell the model to shell out to this package. Keep those
// invocations pinned to the version being released, so a fresh publish is not executed
// on every user's machine the moment it lands. `sync-plugins` copies these files into
// the Claude/Cursor plugins and the opencode package, so stamping the source is enough.
const REPO_ROOT = resolve(import.meta.dirname, '../../..');

const VERSIONED_DOCS = [
	'tools/skills/svelte-code-writer/SKILL.md',
	'tools/agents/svelte-file-editor.md',
];

// Only rewrites `npx @sveltejs/mcp[@version]`, never a bare mention in prose.
const NPX_INVOCATION = /(npx\s+)@sveltejs\/mcp(?:@[^\s`'"]+)?/g;

for (const doc of VERSIONED_DOCS) {
	const doc_path = resolve(REPO_ROOT, doc);
	const content = await readFile(doc_path, 'utf-8');
	const stamped = content.replace(NPX_INVOCATION, `$1@sveltejs/mcp@${package_json.version}`);

	if (stamped === content) continue;

	await writeFile(doc_path, stamped, 'utf-8');
	console.log(`Pinned @sveltejs/mcp@${package_json.version} in ${doc}`);
}
