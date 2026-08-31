import { existsSync, readFileSync, unwatchFile, watchFile } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as v from 'valibot';

// Schema for individual agent configuration
const agent_config_schema = v.object({
	model: v.pipe(
		v.optional(v.string()),
		v.description('Model identifier for the agent (e.g., "anthropic/claude-sonnet-4-20250514")'),
	),
	temperature: v.pipe(
		v.optional(v.number()),
		v.description('Temperature setting for the agent (e.g., 0.7)'),
	),
	top_p: v.pipe(
		v.optional(v.number()),
		v.description(
			'Control response diversity with the top_p option. Alternative to temperature for controlling randomness.',
		),
	),
	maxSteps: v.pipe(
		v.optional(v.number()),
		v.description('Maximum number of steps the agent can take (e.g., 10)'),
	),
});

const default_config = {
	mcp: {
		type: /** @type {'remote' | 'local'} */ ('local'),
		enabled: true,
	},
	subagent: {
		enabled: true,
		agents: /** @type {Record<string, v.InferInput<typeof agent_config_schema>>} */ ({}),
	},
	instructions: {
		enabled: true,
	},
	skills: {
		enabled: /** @type {boolean | string[]} */ (true),
	},
	autoupdate: true,
};

export const config_schema = v.object({
	mcp: v.pipe(
		v.optional(
			v.object({
				type: v.optional(v.picklist(['remote', 'local'])),
				enabled: v.optional(v.boolean()),
			}),
		),
		v.description(
			"Configuration for the MCP. You can choose whether it is enabled and which transport to use: 'local' (default) or 'remote'.",
		),
	),
	subagent: v.pipe(
		v.optional(
			v.object({
				enabled: v.optional(v.boolean()),
				agents: v.optional(v.record(v.string(), agent_config_schema)),
			}),
		),
		v.description('Configuration for the subagent. You can choose if it should be enabled or not.'),
	),
	instructions: v.pipe(
		v.optional(
			v.object({
				enabled: v.optional(v.boolean()),
			}),
		),
		v.description(
			'Configuration for the automatic AGENTS.md injection. You can choose if it should be enabled or not.',
		),
	),
	skills: v.pipe(
		v.optional(
			v.object({
				enabled: v.pipe(
					v.optional(v.union([v.boolean(), v.array(v.string())])),
					v.description(
						'It can be either a boolean or an array containing the skills that you want to enable',
					),
				),
			}),
		),
		v.description(
			'Configuration for the skills. You can choose if it they should be enabled or not, or specify an array of skill names to enable only specific skills.',
		),
	),
	autoupdate: v.pipe(
		v.optional(v.boolean()),
		v.description(
			'When a new version of an unpinned or latest-tagged plugin is available, remove it from the opencode cache on exit so that the latest version is installed the next time opencode starts. Enabled by default; set it to false to only get a warning.',
		),
	),
});

/** @typedef {v.InferInput<typeof config_schema>} McpConfig */

const GLOBAL_CONFIG_PATH = join(homedir(), '.config', 'opencode', 'svelte.json');

/** @typedef {{ data: Record<string, unknown> | null, parse_error?: string }} ConfigLoadResult */
/** @typedef {{ title: string, message: string }} ConfigWarning */

/** @param {string} directory */
function get_config_candidates(directory) {
	const opencode_config_dir = process.env.OPENCODE_CONFIG_DIR;
	// Lowest priority is first, so project config overrides global config.
	return [
		GLOBAL_CONFIG_PATH,
		opencode_config_dir ? join(opencode_config_dir, 'svelte.json') : null,
		join(directory, '.opencode', 'svelte.json'),
	];
}

/** @param {string} directory */
function get_config_paths(directory) {
	return get_config_candidates(directory).map((path) => (path && existsSync(path) ? path : null));
}

/**
 * We watch for the config paths in the case of Opencode 2 because the plugin is only
 * instantiated once per folder and then kept alive but the one long running opencode server
 * this allows us to also hot reload in case the user changes the configuration with
 * the opencode tui plugin.
 * @param {string} directory
 * @param {() => void} on_change
 */
export function watch_mcp_config(directory, on_change) {
	const paths = [...new Set(get_config_candidates(directory).filter((path) => path !== null))];
	for (const path of paths) watchFile(path, { interval: 500, persistent: false }, on_change);
	return () => {
		for (const path of paths) unwatchFile(path, on_change);
	};
}

/**
 * @param {string} config_path
 * @returns {ConfigLoadResult}
 */
function load_config_file(config_path) {
	/** @type {string} */
	let file_content;
	try {
		file_content = readFileSync(config_path, 'utf-8');
	} catch {
		// File doesn't exist or can't be read
		return { data: null };
	}

	try {
		const parsed = JSON.parse(file_content);
		if (parsed === undefined || parsed === null) {
			return { data: null, parse_error: 'Config file is empty or invalid' };
		}
		return { data: parsed };
	} catch (error) {
		return {
			data: null,
			parse_error: error instanceof Error ? error.message : 'Failed to parse config',
		};
	}
}

/**
 * @param {Partial<McpConfig>} user_config
 * @returns {McpConfig}
 */
function merge_with_defaults(user_config) {
	return {
		mcp: {
			...default_config.mcp,
			...user_config.mcp,
		},
		subagent: {
			enabled: default_config.subagent.enabled,
			...user_config.subagent,
			agents: {
				...default_config.subagent.agents,
				...user_config.subagent?.agents,
			},
		},
		instructions: {
			...default_config.instructions,
			...user_config.instructions,
		},
		skills: {
			...default_config.skills,
			...user_config.skills,
		},
		autoupdate: user_config.autoupdate ?? default_config.autoupdate,
	};
}

/**
 * @param {{ directory?: string, on_warning?: (warning: ConfigWarning) => void }} [options]
 */
export function get_mcp_config(options = {}) {
	const directory = options.directory ?? process.cwd();
	const config_paths = get_config_paths(directory);
	const on_warning = options.on_warning ?? (() => {});
	/** @type {Partial<McpConfig>} */
	let merged = {};

	// Iterate from lowest to highest priority, merging as we go
	for (const path of config_paths) {
		if (path && existsSync(path)) {
			const result = load_config_file(path);
			if (result.parse_error) {
				on_warning({
					title: 'Svelte: Invalid opencode plugin config',
					message: `${result.parse_error} (${path})\nSkipping this config file`,
				});
				continue;
			}
			const parsed = v.safeParse(config_schema, result.data);
			if (parsed.success) {
				merged = {
					mcp: { ...merged.mcp, ...parsed.output.mcp },
					subagent: {
						...merged.subagent,
						...parsed.output.subagent,
						agents: { ...merged.subagent?.agents, ...parsed.output.subagent?.agents },
					},
					instructions: { ...merged.instructions, ...parsed.output.instructions },
					skills: { ...merged.skills, ...parsed.output.skills },
					autoupdate: parsed.output.autoupdate ?? merged.autoupdate,
				};
			} else {
				on_warning({
					title: 'Svelte: Invalid opencode plugin config',
					message: `Invalid config schema (${path})\nSkipping this config file`,
				});
			}
		}
	}

	return merge_with_defaults(merged);
}
