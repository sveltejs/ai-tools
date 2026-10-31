import { toJsonSchema } from '@valibot/to-json-schema';
import { config_schema } from '../config.js';
import fs from 'node:fs';
import path from 'node:path';

const json_schema = /** @type {any} */ (toJsonSchema(config_schema));

// Allow the `$schema` property so editors can pick up the schema from the config file itself.
json_schema.properties = {
	$schema: { type: 'string', description: 'The JSON schema of this file.' },
	...json_schema.properties,
};

fs.writeFileSync(path.resolve('./schema.json'), JSON.stringify(json_schema, null, '\t'));
