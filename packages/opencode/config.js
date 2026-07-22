import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import * as v from 'valibot';

/** @typedef {import('@opencode-ai/plugin').PluginInput} PluginInput */

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
		type: /** @type {'remote' | 'local'} */ ('remote'),
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
			"Configuration for the MCP. You can chose if it should be enabled or not and the transport to use 'remote' (default) and 'local'.",
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
});

/** @typedef {v.InferInput<typeof config_schema>} McpConfig */

const GLOBAL_CONFIG_DIR = join(homedir(), '.config', 'opencode');
const GLOBAL_CONFIG_PATH = join(GLOBAL_CONFIG_DIR, 'svelte.json');

/** @typedef {{ data: Record<string, unknown> | null, parse_error?: string }} ConfigLoadResult */

function get_config_paths() {
	// Global: ~/.config/opencode/svelte.json
	/** @type {string | null} */
	let global_path = null;
	if (existsSync(GLOBAL_CONFIG_PATH)) {
		global_path = GLOBAL_CONFIG_PATH;
	}

	// Custom config directory: $OPENCODE_CONFIG_DIR/svelte.json
	/** @type {string | null} */
	let config_dir_path = null;
	const opencode_config_dir = process.env.OPENCODE_CONFIG_DIR;
	if (opencode_config_dir) {
		const config_json = join(opencode_config_dir, 'svelte.json');
		if (existsSync(config_json)) {
			config_dir_path = config_json;
		}
	}

	// Project-local: ./.opencode/svelte.json (cwd)
	/** @type {string | null} */
	let project_path = null;
	const project_config = join(process.cwd(), '.opencode', 'svelte.json');
	if (existsSync(project_config)) {
		project_path = project_config;
	}

	// Lowest priority first, highest priority last (project overrides global)
	return [global_path, config_dir_path, project_path];
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
	};
}

/** @param {PluginInput} ctx */
export function get_mcp_config(ctx) {
	const config_paths = get_config_paths();
	/** @type {Partial<McpConfig>} */
	let merged = {};

	// Iterate from lowest to highest priority, merging as we go
	for (const path of config_paths) {
		if (path && existsSync(path)) {
			const result = load_config_file(path);
			if (result.parse_error) {
				setTimeout(() => {
					ctx.client.tui.showToast({
						body: {
							title: 'Svelte: Invalid opencode plugin config',
							message: `${result.parse_error} (${path})\nSkipping this config file`,
							variant: 'warning',
							duration: 7000,
						},
					});
				}, 7000);
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
				};
			} else {
				setTimeout(() => {
					ctx.client.tui.showToast({
						body: {
							title: 'Svelte: Invalid opencode plugin config',
							message: `Invalid config schema (${path})\nSkipping this config file`,
							variant: 'warning',
							duration: 7000,
						},
					});
				}, 7000);
			}
		}
	}

	return merge_with_defaults(merged);
}
