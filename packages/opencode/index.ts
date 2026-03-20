import type { Plugin } from '@opencode-ai/plugin';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { agents } from './agents.js';
import { get_mcp_config } from './config.js';

const current_dir = dirname(fileURLToPath(import.meta.url));

export const svelte_plugin: Plugin = async (ctx) => {
	return {
		async config(input) {
			input.agent ??= {};
			input.mcp ??= {};
			input.instructions ??= [];
			// @ts-expect-error -- types are wrong in the opencode package...will fix there and remove this
			input.skills ??= {};
			// @ts-expect-error -- types are wrong in the opencode package...will fix there and remove this
			input.skills.paths ??= [];
			// by default we use svelte as the name for the svelte MCP server
			let svelte_mcp_name = 'svelte';
			// we loop over every mcp server to see if any of them is already the svelte MCP server
			for (const name in input.mcp) {
				const mcp = input.mcp[name];
				if (
					(mcp?.type === 'remote' && mcp.url.includes('https://mcp.svelte.dev/mcp')) ||
					(mcp?.type === 'local' &&
						mcp.command.some((cmd: string) => cmd.includes('@sveltejs/mcp')))
				) {
					// if we found the svelte MCP server, we store its name and break
					svelte_mcp_name = name;
					break;
				}
			}
			const mcp_config = get_mcp_config(ctx);

			if (mcp_config.instructions?.enabled !== false) {
				const instructions_dir = join(current_dir, 'instructions');
				const instructions_paths = await readdir(instructions_dir);
				input.instructions.push(...instructions_paths.map((file) => join(instructions_dir, file)));
			}

			const skills_enabled = mcp_config.skills?.enabled;
			if (skills_enabled !== false) {
				const skills_dir = join(current_dir, 'skills');
				if (Array.isArray(skills_enabled)) {
					// only add specific skill directories by name
					for (const skill_name of skills_enabled) {
						const skill_path = join(skills_dir, skill_name);
						// @ts-expect-error -- skills is a new opencode feature
						input.skills.paths.push(skill_path);
					}
				} else {
					// @ts-expect-error -- skills is a new opencode feature
					input.skills.paths.push(skills_dir);
				}
			}

			// if the user doesn't have the MCP server already we add one based on config
			if (!input.mcp[svelte_mcp_name]) {
				if (mcp_config.mcp?.type === 'remote') {
					input.mcp[svelte_mcp_name] = {
						type: 'remote',
						url: 'https://mcp.svelte.dev/mcp',
						enabled: mcp_config.mcp?.enabled ?? true,
					};
				} else {
					input.mcp[svelte_mcp_name] = {
						type: 'local',
						command: ['npx', '-y', '@sveltejs/mcp'],
						enabled: mcp_config.mcp?.enabled ?? true,
					};
				}
			}
			if (mcp_config.subagent?.enabled !== false) {
				for (const [agent_name, agent_data] of Object.entries(agents)) {
					// we add the editor subagent that will be used when editing Svelte files to prevent wasting context on the main agent
					const default_config: (typeof input.agent)[string] = {
						color: '#ff3e00',
						mode: 'subagent',
						prompt: agent_data.prompt,
						description: agent_data.description,
						permission: {
							bash: 'ask',
							edit: 'allow',
							webfetch: 'ask',
						},
						tools: {
							[`${svelte_mcp_name}_*`]: true,
						},
					};

					// Get per-agent config from svelte.json (if any)
					const agent_config = mcp_config.subagent?.agents?.[agent_name];

					// Configure agent from svelte.json only
					// Priority: svelte.json agent config > defaults
					input.agent[agent_name] = {
						...default_config,
						...(agent_config?.model !== undefined && {
							model: agent_config.model,
						}),
						...(agent_config?.temperature !== undefined && {
							temperature: agent_config.temperature,
						}),
						...(agent_config?.maxSteps !== undefined && {
							maxSteps: agent_config.maxSteps,
						}),
						...(agent_config?.top_p !== undefined && {
							top_p: agent_config.top_p,
						}),
					};
				}
			}
		},
	};
};
