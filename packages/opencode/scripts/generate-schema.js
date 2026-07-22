import { toJsonSchema } from '@valibot/to-json-schema';
import { config_schema } from '../config.js';
import fs from 'node:fs';
import path from 'node:path';

// Read agent names from tools/agents/*.md files
/** @param {string} agents_dir */
function get_agent_names(agents_dir) {
	if (!fs.existsSync(agents_dir)) return [];
	return fs
		.readdirSync(agents_dir, { withFileTypes: true })
		.filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
		.map((entry) => entry.name.replace(/\.md$/, ''));
}

/** @param {string} skills_dir */
function get_skill_names(skills_dir) {
	if (!fs.existsSync(skills_dir)) return [];
	return fs
		.readdirSync(skills_dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

const skills_dir = path.resolve('./skills');
const skill_names = get_skill_names(skills_dir);
const schema = config_schema;
const json_schema = toJsonSchema(schema);

// Post-process: inject skill name suggestions into the items schema.
// This is the JSON Schema equivalent of `"a" | "b" | (string & {})` —
// editors will autocomplete the known names but any string is still valid.
if (skill_names.length > 0) {
	const enabled = /** @type {any} */ (json_schema).properties?.skills?.properties?.enabled;
	if (enabled?.anyOf) {
		const array_branch = enabled.anyOf.find(
			/** @type {(schema: Record<string, unknown>) => boolean} */ (
				(schema) => schema.type === 'array'
			),
		);
		if (array_branch) {
			array_branch.items = {
				anyOf: [{ enum: skill_names }, { type: 'string' }],
			};
		}
	}
}

// Post-process: inject known agent names for intellisense
// This is the JSON Schema equivalent of `"a" | "b" | (string & {})` —
// editors will autocomplete the known names but any string is still valid.
const agents_dir = path.resolve('../../tools/agents');
const agent_names = get_agent_names(agents_dir);

if (agent_names.length > 0) {
	const agents = /** @type {any} */ (json_schema).properties?.subagent?.properties?.agents;
	if (agents) {
		agents.propertyNames = {
			anyOf: [{ enum: agent_names }, { type: 'string' }],
		};
	}
}

fs.writeFileSync(path.resolve('./schema.json'), JSON.stringify(json_schema, null, '\t'));
