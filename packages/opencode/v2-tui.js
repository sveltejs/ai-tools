import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as v from 'valibot';
import { config_schema } from './config.js';

/** @typedef {v.InferInput<typeof config_schema>} McpConfig */
/** @typedef {'project' | 'global'} Scope */
/** @typedef {Partial<McpConfig>} Config */
/** @typedef {import('@opencode-ai/plugin/tui').Plugin.Context} V2TuiContext */

const skill_names = ['svelte-code-writer', 'svelte-core-bestpractices'];
const agent_name = 'svelte-file-editor';

/**
 * @param {V2TuiContext} context
 * @param {Scope} scope
 */
function config_path(context, scope) {
	if (scope === 'project') {
		const directory = context.location?.directory;
		if (!directory) throw new Error('Project path is not available yet.');
		return join(directory, '.opencode', 'svelte.json');
	}
	return join(
		process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), '.config', 'opencode'),
		'svelte.json',
	);
}

/** @param {string} path */
async function read_config(path) {
	if (!existsSync(path)) return {};
	/** @type {unknown} */
	const parsed = JSON.parse(await readFile(path, 'utf8'));
	const result = v.safeParse(config_schema, parsed);
	if (!result.success)
		throw new Error('The existing file does not match the Svelte plugin schema.');
	return /** @type {Config} */ (parsed);
}

/**
 * @param {string} path
 * @param {Config} config
 */
async function save_config(path, config) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, '\t')}\n`, 'utf8');
}

/**
 * @param {unknown} value
 * @param {string} [fallback]
 */
function display(value, fallback = 'default') {
	return value === undefined ? fallback : String(value);
}

/** @param {V2TuiContext} context */
export function v2_tui_setup(context) {
	async function open_scope() {
		if (!context.location?.directory) {
			context.ui.toast.show({
				variant: 'warning',
				message: 'Paths are still syncing. Try again in a moment.',
			});
			return;
		}
		const scope = await context.ui.dialog.select({
			title: 'Configure Svelte plugin',
			options: [
				{
					title: 'Project',
					value: 'project',
					description: 'Write .opencode/svelte.json for this project',
				},
				{
					title: 'Global',
					value: 'global',
					description: 'Write svelte.json in the OpenCode config directory',
				},
			],
		});
		if (scope === 'project' || scope === 'global') await open_config(scope);
	}

	/** @param {Scope} scope */
	async function open_config(scope) {
		const path = config_path(context, scope);
		/** @type {Config} */
		let config;
		try {
			config = await read_config(path);
		} catch (error) {
			context.ui.toast.show({
				variant: 'error',
				title: 'Cannot edit Svelte configuration',
				message: error instanceof Error ? error.message : 'Failed to read configuration',
			});
			return;
		}
		const original_config = structuredClone(config);
		/** @type {string | undefined} */
		let current_option;

		async function persist(show_toast = true) {
			try {
				await save_config(path, config);
				if (show_toast) {
					context.ui.toast.show({
						variant: 'success',
						message: `Saved ${scope} Svelte configuration`,
					});
				}
			} catch {
				context.ui.toast.show({
					variant: 'error',
					message: 'Failed to save Svelte configuration',
				});
			}
		}

		/**
		 * @param {'temperature' | 'top_p' | 'maxSteps'} key
		 * @param {string} label
		 */
		async function prompt_agent_number(key, label) {
			const agent = config.subagent?.agents?.[agent_name];
			const value = await context.ui.dialog.prompt({
				title: `${agent_name}: ${label}`,
				placeholder: 'Leave empty to use the default',
				value: agent?.[key] === undefined ? '' : String(agent[key]),
			});
			if (value === undefined) return;
			const number = value.trim() === '' ? undefined : Number(value);
			if (number !== undefined && !Number.isFinite(number)) {
				context.ui.toast.show({ variant: 'warning', message: `${label} must be a number` });
				return;
			}
			config.subagent ??= {};
			config.subagent.agents ??= {};
			config.subagent.agents[agent_name] = { ...agent, [key]: number };
			await persist();
		}

		async function open_agent() {
			/** @type {string | undefined} */
			let current;
			while (true) {
				const agent = config.subagent?.agents?.[agent_name];
				const option = await context.ui.dialog.select({
					title: `Configure ${agent_name}`,
					...(current === undefined ? {} : { current }),
					options: [
						{ title: 'Model', value: 'model', description: display(agent?.model) },
						{
							title: 'Temperature',
							value: 'temperature',
							description: display(agent?.temperature),
						},
						{ title: 'Top P', value: 'top_p', description: display(agent?.top_p) },
						{
							title: 'Maximum steps',
							value: 'maxSteps',
							description: display(agent?.maxSteps),
						},
						{ title: 'Back', value: 'back' },
					],
				});
				if (option === undefined || option === 'back') return;
				current = option;
				if (option === 'temperature' || option === 'top_p' || option === 'maxSteps') {
					await prompt_agent_number(
						option,
						option === 'top_p' ? 'Top P' : option === 'maxSteps' ? 'Maximum steps' : 'Temperature',
					);
					continue;
				}
				const model = await context.ui.dialog.prompt({
					title: `${agent_name}: model`,
					placeholder: 'provider/model, or empty for default',
					value: agent?.model ?? '',
				});
				if (model === undefined) continue;
				config.subagent ??= {};
				config.subagent.agents ??= {};
				config.subagent.agents[agent_name] = {
					...agent,
					model: model.trim() || undefined,
				};
				await persist();
			}
		}

		while (true) {
			const skills = config.skills?.enabled;
			const selected_skills = new Set(
				Array.isArray(skills) ? skills : skills === false ? [] : skill_names,
			);
			const all_skills_selected = skill_names.every((name) => selected_skills.has(name));
			/** @param {boolean | undefined} value */
			function checked(value) {
				return value !== false ? '[x]' : '[ ]';
			}
			/** @param {'remote' | 'local'} value */
			function radio(value) {
				return (config.mcp?.type ?? 'local') === value ? '(*)' : '( )';
			}
			const option = await context.ui.dialog.select({
				title: `Svelte plugin (${scope})`,
				...(current_option === undefined ? {} : { current: current_option }),
				options: [
					{
						title: `${checked(config.mcp?.enabled)} MCP server`,
						value: 'mcp-enabled',
						category: 'MCP',
					},
					{
						title: `${radio('remote')} Remote`,
						value: 'mcp-remote',
						category: 'MCP transport',
					},
					{
						title: `${radio('local')} Local`,
						value: 'mcp-local',
						category: 'MCP transport',
					},
					{
						title: `${checked(config.subagent?.enabled)} Subagent`,
						value: 'subagent-enabled',
						category: 'Subagent',
					},
					{ title: 'Subagent settings', value: 'agent' },
					{
						title: `${checked(config.instructions?.enabled)} Instructions`,
						value: 'instructions',
						category: 'Instructions',
					},
					{
						title: `${all_skills_selected ? '[x]' : '[ ]'} Select all`,
						value: 'skills-all',
						category: 'Skills',
					},
					...skill_names.map((name) => ({
						title: `${selected_skills.has(name) ? '[x]' : '[ ]'} ${name}`,
						value: `skill:${name}`,
						category: 'Skills',
					})),
					{
						title: `${config.autoupdate !== false ? '[x]' : '[ ]'} Auto update`,
						value: 'autoupdate',
						category: 'Updates',
						description: 'Reinstall the plugin on the next start when a new version is out',
					},
					{
						title: 'Revert changes',
						value: 'revert',
						category: 'Actions',
						description: 'Restore values from when this dialog opened',
					},
					{ title: 'Change scope', value: 'scope', category: 'Actions' },
					{ title: 'Close', value: 'close', category: 'Actions' },
				],
			});
			if (option === undefined || option === 'close') return;
			current_option = option;
			if (option === 'scope') return open_scope();
			if (option === 'agent') {
				await open_agent();
				continue;
			}
			if (option === 'revert') {
				config = structuredClone(original_config);
				await persist();
				continue;
			}
			if (option === 'mcp-enabled') {
				config.mcp = { ...config.mcp, enabled: config.mcp?.enabled === false };
			}
			if (option === 'mcp-remote') config.mcp = { ...config.mcp, type: 'remote' };
			if (option === 'mcp-local') config.mcp = { ...config.mcp, type: 'local' };
			if (option === 'subagent-enabled') {
				config.subagent = { ...config.subagent, enabled: config.subagent?.enabled === false };
			}
			if (option === 'instructions') {
				config.instructions = {
					...config.instructions,
					enabled: config.instructions?.enabled === false,
				};
			}
			if (option === 'skills-all') {
				config.skills = { enabled: all_skills_selected ? [] : [...skill_names] };
			}
			if (option === 'autoupdate') config.autoupdate = config.autoupdate === false;
			if (option.startsWith('skill:')) {
				const name = option.slice('skill:'.length);
				if (selected_skills.has(name)) selected_skills.delete(name);
				else selected_skills.add(name);
				config.skills = { enabled: [...selected_skills] };
			}
			await persist(false);
		}
	}

	context.ui.slot({
		append: 'app',
		render() {
			context.keymap.layer(() => ({
				mode: 'global',
				commands: [
					{
						id: 'svelte.configure.open',
						title: 'Configure Svelte plugin',
						group: 'Plugin',
						palette: true,
						slash: { name: 'svelte-plugin' },
						run: open_scope,
					},
				],
			}));
			return null;
		},
	});
}
