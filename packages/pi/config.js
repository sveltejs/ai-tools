import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent';
import * as v from 'valibot';

const exposure_schema = v.picklist(['direct', 'codemode', 'deferred', 'hidden']);

export const config_schema = v.object({
	mcp: v.pipe(
		v.optional(
			v.object({
				type: v.optional(v.picklist(['remote', 'local'])),
				enabled: v.optional(v.boolean()),
				exposure: v.optional(exposure_schema),
			}),
		),
		v.description(
			"Configuration for the MCP. You can choose whether it is enabled, which transport to use ('local', which is default, or 'remote'), and how the tools are exposed to the model ('direct' by default).",
		),
	),
	instructions: v.pipe(
		v.optional(
			v.object({
				enabled: v.optional(v.boolean()),
			}),
		),
		v.description(
			'Configuration for the automatic instructions injection in the system prompt. You can choose if it should be enabled or not.',
		),
	),
});

/** @typedef {v.InferOutput<typeof config_schema>} SvelteConfig */
/** @typedef {v.InferOutput<typeof exposure_schema>} Exposure */

/**
 * @typedef {{
 * 	mcp: { type: 'remote' | 'local', enabled: boolean, exposure: Exposure },
 * 	instructions: { enabled: boolean },
 * }} ResolvedConfig
 */

/** @typedef {{ title: string, message: string }} ConfigWarning */

/** @returns {ResolvedConfig} */
function default_config() {
	return {
		mcp: { type: 'local', enabled: true, exposure: 'direct' },
		instructions: { enabled: true },
	};
}

export function get_global_config_path() {
	return join(getAgentDir(), 'svelte.json');
}

/** @param {string} cwd */
export function get_project_config_path(cwd) {
	return join(cwd, CONFIG_DIR_NAME, 'svelte.json');
}

/**
 * @param {string} path
 * @param {(warning: ConfigWarning) => void} on_warning
 * @returns {SvelteConfig | null}
 */
function load_config_file(path, on_warning) {
	if (!existsSync(path)) return null;
	/** @type {unknown} */
	let data;
	try {
		data = JSON.parse(readFileSync(path, 'utf-8'));
	} catch (error) {
		on_warning({
			title: 'Svelte: invalid Pi config',
			message: `${error instanceof Error ? error.message : 'Failed to parse config'} (${path}). Skipping this config file.`,
		});
		return null;
	}
	const parsed = v.safeParse(config_schema, data);
	if (!parsed.success) {
		on_warning({
			title: 'Svelte: invalid Pi config',
			message: `Invalid config schema (${path}). Skipping this config file.`,
		});
		return null;
	}
	return parsed.output;
}

/**
 * Reads and merges the Svelte configuration. The global config lives in `~/.pi/agent/svelte.json`
 * and the project config in `.pi/svelte.json`. The project config is only read for trusted projects
 * and overrides the global one.
 *
 * @param {{ cwd: string, trusted: boolean, on_warning?: (warning: ConfigWarning) => void }} options
 * @returns {ResolvedConfig}
 */
export function get_config({ cwd, trusted, on_warning = () => {} }) {
	const paths = [get_global_config_path()];
	if (trusted) paths.push(get_project_config_path(cwd));

	const config = default_config();
	// Iterate from lowest to highest priority, merging as we go
	for (const path of paths) {
		const user_config = load_config_file(path, on_warning);
		if (!user_config) continue;
		Object.assign(config.mcp, strip_undefined(user_config.mcp));
		Object.assign(config.instructions, strip_undefined(user_config.instructions));
	}
	return config;
}

/**
 * @template {Record<string, unknown>} T
 * @param {T | undefined} object
 * @returns {Partial<T>}
 */
function strip_undefined(object) {
	if (!object) return {};
	return /** @type {Partial<T>} */ (
		Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined))
	);
}
