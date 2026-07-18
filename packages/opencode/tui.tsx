/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from '@opencode-ai/plugin/tui';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import * as v from 'valibot';
import { config_schema, type McpConfig } from './config.ts';

const plugin_id = 'svelte.configure';
const skill_names = ['svelte-code-writer', 'svelte-core-bestpractices'] as const;
const agent_name = 'svelte-file-editor';

type Scope = 'project' | 'global';
type Config = Partial<McpConfig>;

function project_root(api: Parameters<TuiPlugin>[0]) {
	const worktree = api.state.path.worktree;
	return worktree && worktree !== '/' ? worktree : api.state.path.directory;
}

function config_path(api: Parameters<TuiPlugin>[0], scope: Scope) {
	if (scope === 'project') return join(project_root(api), '.opencode', 'svelte.json');
	return join(
		process.env.OPENCODE_CONFIG_DIR ?? join(homedir(), '.config', 'opencode'),
		'svelte.json',
	);
}

async function read_config(path: string): Promise<Config> {
	if (!existsSync(path)) return {};
	const parsed: unknown = JSON.parse(await readFile(path, 'utf8'));
	const result = v.safeParse(config_schema, parsed);
	if (!result.success)
		throw new Error('The existing file does not match the Svelte plugin schema.');
	// Keep schema annotations and future fields that this version does not edit.
	return parsed as Config;
}

async function save_config(path: string, config: Config) {
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, `${JSON.stringify(config, null, '\t')}\n`, 'utf8');
}

function display(value: unknown, fallback = 'default') {
	return value === undefined ? fallback : String(value);
}

const tui: TuiPlugin = async (api) => {
	function open_scope() {
		if (!api.state.path.directory) {
			api.ui.toast({
				variant: 'warning',
				message: 'Paths are still syncing. Try again in a moment.',
			});
			return;
		}

		api.ui.dialog.replace(() => (
			<api.ui.DialogSelect<Scope>
				title="Configure Svelte plugin"
				options={[
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
				]}
				onSelect={(option) => void open_config(option.value)}
			/>
		));
	}

	async function open_config(scope: Scope) {
		const path = config_path(api, scope);
		let config: Config;
		try {
			config = await read_config(path);
		} catch (error) {
			api.ui.toast({
				variant: 'error',
				title: 'Cannot edit Svelte configuration',
				message: error instanceof Error ? error.message : 'Failed to read configuration',
			});
			return;
		}
		const original_config = structuredClone(config);
		let current_option: string | undefined;

		async function persist(show_toast = true) {
			try {
				await save_config(path, config);
				if (show_toast)
					api.ui.toast({ variant: 'success', message: `Saved ${scope} Svelte configuration` });
			} catch {
				api.ui.toast({ variant: 'error', message: 'Failed to save Svelte configuration' });
			}
		}

		function prompt_agent_number(key: 'temperature' | 'top_p' | 'maxSteps', label: string) {
			const agent = config.subagent?.agents?.[agent_name];
			api.ui.dialog.replace(() => (
				<api.ui.DialogPrompt
					title={`${agent_name}: ${label}`}
					placeholder="Leave empty to use the default"
					value={agent?.[key] === undefined ? '' : String(agent[key])}
					onCancel={open_agent}
					onConfirm={async (value) => {
						const number = value.trim() === '' ? undefined : Number(value);
						if (number !== undefined && !Number.isFinite(number)) {
							api.ui.toast({ variant: 'warning', message: `${label} must be a number` });
							return;
						}
						config.subagent ??= {};
						config.subagent.agents ??= {};
						config.subagent.agents[agent_name] = { ...agent, [key]: number };
						await persist();
						open_agent();
					}}
				/>
			));
		}

		function open_agent() {
			const agent = config.subagent?.agents?.[agent_name];
			api.ui.dialog.replace(() => (
				<api.ui.DialogSelect<string>
					title={`Configure ${agent_name}`}
					options={[
						{ title: 'Model', value: 'model', description: display(agent?.model) },
						{
							title: 'Temperature',
							value: 'temperature',
							description: display(agent?.temperature),
						},
						{ title: 'Top P', value: 'top_p', description: display(agent?.top_p) },
						{ title: 'Maximum steps', value: 'maxSteps', description: display(agent?.maxSteps) },
						{ title: 'Back', value: 'back' },
					]}
					onSelect={(option) => {
						if (option.value === 'back') return open_menu();
						if (option.value !== 'model')
							return prompt_agent_number(
								option.value as 'temperature' | 'top_p' | 'maxSteps',
								option.title,
							);
						api.ui.dialog.replace(() => (
							<api.ui.DialogPrompt
								title={`${agent_name}: model`}
								placeholder="provider/model, or empty for default"
								value={agent?.model ?? ''}
								onCancel={open_agent}
								onConfirm={async (value) => {
									config.subagent ??= {};
									config.subagent.agents ??= {};
									config.subagent.agents[agent_name] = {
										...agent,
										model: value.trim() || undefined,
									};
									await persist();
									open_agent();
								}}
							/>
						));
					}}
				/>
			));
		}

		function open_menu() {
			const skills = config.skills?.enabled;
			const selected_skills = new Set(
				Array.isArray(skills) ? skills : skills === false ? [] : skill_names,
			);
			const all_skills_selected = skill_names.every((name) => selected_skills.has(name));
			function checked(value: boolean | undefined) {
				return value !== false ? '[x]' : '[ ]';
			}
			function radio(value: 'remote' | 'local') {
				return (config.mcp?.type ?? 'remote') === value ? '(*)' : '( )';
			}
			api.ui.dialog.replace(() => (
				<api.ui.DialogSelect<string>
					title={`Svelte plugin (${scope})`}
					{...(current_option === undefined ? {} : { current: current_option })}
					skipFilter
					options={[
						{
							title: `${checked(config.mcp?.enabled)} MCP server`,
							value: 'mcp-enabled',
							category: 'MCP',
						},
						{ title: `${radio('remote')} Remote`, value: 'mcp-remote', category: 'MCP transport' },
						{ title: `${radio('local')} Local`, value: 'mcp-local', category: 'MCP transport' },
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
							title: 'Revert changes',
							value: 'revert',
							category: 'Actions',
							description: 'Restore values from when this dialog opened',
						},
						{ title: 'Change scope', value: 'scope', category: 'Actions' },
						{ title: 'Close', value: 'close', category: 'Actions' },
					]}
					onMove={(option) => (current_option = option.value)}
					onSelect={async (option) => {
						current_option = option.value;
						if (option.value === 'close') return api.ui.dialog.clear();
						if (option.value === 'scope') return open_scope();
						if (option.value === 'agent') return open_agent();
						if (option.value === 'revert') {
							config = structuredClone(original_config);
							await persist();
							return open_menu();
						}
						if (option.value === 'mcp-enabled')
							config.mcp = { ...config.mcp, enabled: config.mcp?.enabled === false };
						if (option.value === 'mcp-remote') config.mcp = { ...config.mcp, type: 'remote' };
						if (option.value === 'mcp-local') config.mcp = { ...config.mcp, type: 'local' };
						if (option.value === 'subagent-enabled')
							config.subagent = { ...config.subagent, enabled: config.subagent?.enabled === false };
						if (option.value === 'instructions')
							config.instructions = {
								...config.instructions,
								enabled: config.instructions?.enabled === false,
							};
						if (option.value === 'skills-all') {
							config.skills = { enabled: all_skills_selected ? [] : [...skill_names] };
						}
						if (option.value.startsWith('skill:')) {
							const name = option.value.slice('skill:'.length);
							if (selected_skills.has(name)) {
								selected_skills.delete(name);
							} else {
								selected_skills.add(name);
							}
							config.skills = { enabled: [...selected_skills] };
						}
						await persist(false);
						open_menu();
					}}
				/>
			));
		}

		open_menu();
	}

	api.keymap.registerLayer({
		commands: [
			{
				name: `${plugin_id}.open`,
				title: 'Configure Svelte plugin',
				category: 'Plugin',
				namespace: 'palette',
				slashName: 'svelte-plugin',
				run: open_scope,
			},
		],
	});
};

export default {
	id: plugin_id,
	tui,
} satisfies TuiPluginModule & { id: string };
