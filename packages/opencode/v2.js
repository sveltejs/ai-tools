import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agents } from './agents.js';
import { get_mcp_config, watch_mcp_config } from './config.js';
import { setup_updates } from './update.js';

/** @typedef {import('@opencode-ai/plugin').Plugin.Context} V2Context */
/** @typedef {import('@opencode-ai/plugin').Mcp.ServerConfig} McpConfig */
/** @typedef {import('@opencode-ai/plugin').Skill.Info} SkillInfo */
/** @typedef {NonNullable<import('@opencode-ai/plugin').Agent.Info['model']>} ModelRef */

const current_dir = dirname(fileURLToPath(import.meta.url));

/** @param {McpConfig} mcp */
function is_svelte_mcp(mcp) {
	return (
		(mcp.type === 'remote' && mcp.url.includes('https://mcp.svelte.dev/mcp')) ||
		(mcp.type === 'local' && mcp.command.some((command) => command.includes('@sveltejs/mcp')))
	);
}

/** @param {string} server */
function mcp_namespace(server) {
	return server.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Opencode V2 requires an object with `providerId`, `id`, and optionally `variant` to identify a model.
 * Since Opencode V1 used a string that's what we were saving in `svelte.json`. This simple helper
 * converts between the twos. It returns `undefined` for invalid strings, which will cause the agent to fall back to its default model.
 * @param {string} model
 */
function parse_model(model) {
	const provider_end = model.indexOf('/');
	if (provider_end <= 0) return;
	const variant_start = model.indexOf('#', provider_end + 1);
	const provider_id = model.slice(0, provider_end);
	const id = model.slice(provider_end + 1, variant_start === -1 ? undefined : variant_start);
	const variant = variant_start === -1 ? undefined : model.slice(variant_start + 1);
	if (
		!id ||
		provider_id.includes('#') ||
		(variant !== undefined && (!variant || variant.includes('#')))
	) {
		return;
	}
	return /** @type {ModelRef} */ ({
		providerID: provider_id,
		id,
		...(variant === undefined ? {} : { variant }),
	});
}

/**
 * Opencode V1 could load the skills directly by including a folder in the path. In Opencode V2 we need to provide an object with
 * `id`, `name`, `description`, `location`, and `content`. This helper parses the SKILL.md file and returns the object.
 * The SKILL.md file is expected to have a frontmatter section with `name` and `description` fields, followed by the content of the skill.
 * If the frontmatter is missing or invalid, the skill will be skipped.
 * @param {string} content
 */
function parse_skill(content) {
	const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
	if (!match) return;
	const frontmatter_content = match[1];
	const body = match[2];
	if (frontmatter_content === undefined || body === undefined) return;
	/** @type {Record<string, string>} */
	const frontmatter = {};
	for (const line of frontmatter_content.split(/\r?\n/)) {
		const separator = line.indexOf(':');
		if (separator === -1) continue;
		frontmatter[line.slice(0, separator).trim()] = line.slice(separator + 1).trim();
	}
	return {
		name: frontmatter.name,
		description: frontmatter.description,
		content: body,
	};
}

/** @param {boolean | string[] | undefined} enabled */
async function load_skills(enabled) {
	if (enabled === false) return [];
	const skills_dir = join(current_dir, 'skills');
	const names = Array.isArray(enabled)
		? enabled
		: (await readdir(skills_dir, { withFileTypes: true }))
				.filter((entry) => entry.isDirectory())
				.map((entry) => entry.name);
	/** @type {SkillInfo[]} */
	const result = [];
	for (const id of names) {
		const location = join(skills_dir, id, 'SKILL.md');
		let content;
		try {
			content = await readFile(location, 'utf8');
		} catch {
			continue;
		}
		const parsed = parse_skill(content);
		if (!parsed) continue;
		result.push(
			/** @type {SkillInfo} */ ({
				id,
				name: parsed.name ?? id,
				...(parsed.description === undefined ? {} : { description: parsed.description }),
				location,
				content: parsed.content,
			}),
		);
	}
	return result;
}

/**
 * @param {boolean} [enabled]
 * @returns
 */
async function load_instructions(enabled = true) {
	if (!enabled) return [];
	const instructions_dir = join(current_dir, 'instructions');
	const files = await readdir(instructions_dir);
	return Promise.all(files.map((file) => readFile(join(instructions_dir, file), 'utf8')));
}

/** @param {{ title: string, message: string }} warning */
function emit_warning(warning) {
	process.emitWarning(`${warning.title}\n${warning.message}`, { code: 'SVELTE_OPENCODE' });
}

/** @param {V2Context} ctx */
export async function v2_setup(ctx) {
	let mcp_config = get_mcp_config({
		directory: ctx.location.directory,
		on_warning: emit_warning,
	});
	let instructions = await load_instructions(mcp_config.instructions?.enabled);
	let skills = await load_skills(mcp_config.skills?.enabled);
	let svelte_mcp_name = 'svelte';

	await ctx.mcp.transform((draft) => {
		for (const [name, mcp] of draft.list()) {
			if (!is_svelte_mcp(mcp)) continue;
			svelte_mcp_name = name;
			break;
		}
		if (draft.get(svelte_mcp_name)) return;
		if (mcp_config.mcp?.type === 'remote') {
			draft.set(svelte_mcp_name, {
				type: 'remote',
				url: 'https://mcp.svelte.dev/mcp',
				disabled: mcp_config.mcp.enabled === false,
			});
			return;
		}
		draft.set(svelte_mcp_name, {
			type: 'local',
			command: ['npx', '-y', '@sveltejs/mcp'],
			disabled: mcp_config.mcp?.enabled === false,
		});
	});

	await ctx.agent.transform((draft) => {
		if (mcp_config.subagent?.enabled === false) return;
		for (const [agent_name, agent_data] of Object.entries(agents)) {
			const agent_config = mcp_config.subagent?.agents?.[agent_name];
			draft.update(agent_name, (agent) => {
				agent.color = '#ff3e00';
				agent.mode = 'subagent';
				agent.system = agent_data.prompt;
				agent.description = agent_data.description;
				agent.permissions.push({
					action: `${mcp_namespace(svelte_mcp_name)}_*`,
					resource: '*',
					effect: 'allow',
				});
				if (agent_config?.model !== undefined) {
					const model = parse_model(agent_config.model);
					if (model) agent.model = model;
				}
				if (agent_config?.temperature !== undefined) {
					agent.request.body.temperature = agent_config.temperature;
				}
				if (agent_config?.top_p !== undefined) {
					agent.request.body.top_p = agent_config.top_p;
				}
				if (agent_config?.maxSteps !== undefined) agent.steps = agent_config.maxSteps;
			});
		}
	});

	await ctx.skill.transform((draft) => {
		for (const skill of skills) draft.add(skill);
	});
	await ctx.session.hook('context', (context) => {
		for (const instruction of instructions) {
			context.system.push({ type: 'text', text: instruction });
		}
	});

	const stop_updates = setup_updates(mcp_config.autoupdate === true, (update) => {
		emit_warning({ title: 'Svelte: new plugin version available', message: update.message });
	});
	let stopped = false;
	/** @type {ReturnType<typeof setTimeout> | undefined} */
	let refresh_timer;
	let refresh_queue = Promise.resolve();

	async function refresh_config() {
		const next_config = get_mcp_config({
			directory: ctx.location.directory,
			on_warning: emit_warning,
		});
		const [next_instructions, next_skills] = await Promise.all([
			load_instructions(next_config.instructions?.enabled),
			load_skills(next_config.skills?.enabled),
		]);
		mcp_config = next_config;
		instructions = next_instructions;
		skills = next_skills;
		await Promise.all([ctx.mcp.reload(), ctx.agent.reload(), ctx.skill.reload()]);
	}

	const stop_watching = watch_mcp_config(ctx.location.directory, () => {
		if (stopped) return;
		if (refresh_timer) clearTimeout(refresh_timer);
		refresh_timer = setTimeout(() => {
			refresh_timer = undefined;
			refresh_queue = refresh_queue.then(refresh_config).catch((error) => {
				emit_warning({
					title: 'Svelte: failed to reload plugin config',
					message: error instanceof Error ? error.message : 'Unknown configuration reload error',
				});
			});
		}, 100);
		refresh_timer.unref();
	});

	return async () => {
		stopped = true;
		stop_watching();
		if (refresh_timer) clearTimeout(refresh_timer);
		await refresh_queue;
		await stop_updates();
	};
}
