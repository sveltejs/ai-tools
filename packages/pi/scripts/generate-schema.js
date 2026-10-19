import { toJsonSchema } from '@valibot/to-json-schema';
import { config_schema } from '../config.js';
import fs from 'node:fs';
import path from 'node:path';

/** @param {string} skills_dir */
function get_skill_names(skills_dir) {
	if (!fs.existsSync(skills_dir)) return [];
	return fs
		.readdirSync(skills_dir, { withFileTypes: true })
		.filter((entry) => entry.isDirectory())
		.map((entry) => entry.name);
}

const json_schema = /** @type {any} */ (toJsonSchema(config_schema));

// Allow the `$schema` property so editors can pick up the schema from the config file itself.
json_schema.properties = {
	$schema: { type: 'string', description: 'The JSON schema of this file.' },
	...json_schema.properties,
};

// Post-process: inject skill name suggestions into the items schema.
// This is the JSON Schema equivalent of `"a" | "b" | (string & {})` —
// editors will autocomplete the known names but any string is still valid.
const skill_names = get_skill_names(path.resolve('./skills'));
if (skill_names.length > 0) {
	const enabled = json_schema.properties?.skills?.properties?.enabled;
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

fs.writeFileSync(path.resolve('./schema.json'), JSON.stringify(json_schema, null, '\t'));
