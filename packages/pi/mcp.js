import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { CONFIG_DIR_NAME, getAgentDir } from '@earendil-works/pi-coding-agent';

/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionAPI} ExtensionAPI */
/** @typedef {import('./config.js').ResolvedConfig} ResolvedConfig */

export const DEFAULT_MCP_NAME = 'svelte';
const REMOTE_URL = 'https://mcp.svelte.dev/mcp';

/** @param {unknown} server */
function is_svelte_mcp(server) {
	if (!server || typeof server !== 'object') return false;
	const { url, command, args } = /** @type {Record<string, unknown>} */ (server);
	if (typeof url === 'string' && url.includes(REMOTE_URL)) return true;
	const parts = [command, ...(Array.isArray(args) ? args : [])];
	return parts.some((part) => typeof part === 'string' && part.includes('@sveltejs/mcp'));
}

/**
 * Looks into the `mcp.json` files pi reads to find out if the user already configured the Svelte
 * MCP server (possibly under a different name). Returns the configured name if found.
 *
 * @param {string} cwd
 * @param {boolean} trusted
 */
export function find_configured_svelte_mcp(cwd, trusted) {
	const paths = [join(getAgentDir(), 'mcp.json')];
	// project config is only read by pi after the project is trusted
	if (trusted) paths.push(join(cwd, CONFIG_DIR_NAME, 'mcp.json'));
	// later paths override earlier ones so we search from the highest priority
	for (const path of paths.reverse()) {
		if (!existsSync(path)) continue;
		try {
			const mcp_servers = JSON.parse(readFileSync(path, 'utf-8')).mcpServers;
			for (const [name, server] of Object.entries(mcp_servers ?? {})) {
				if (is_svelte_mcp(server)) return name;
			}
		} catch {
			// invalid files are reported by pi itself
		}
	}
	return null;
}

/**
 * Tools of MCP servers are exposed by pi as `mcp__<server>__<tool>` with every character that is
 * not a letter, a digit or `_` replaced by `_`.
 * @param {string} server
 * @param {string} tool
 */
export function mcp_tool_name(server, tool) {
	return `mcp__${server}__${tool}`.replace(/[^a-zA-Z0-9_]/g, '_');
}

/**
 * Working directory of the local MCP server in untrusted projects. pi spawns stdio servers in the
 * session directory by default, but `npx` reads the project `.npmrc` (e.g. `script-shell`,
 * `registry`) and prefers a `@sveltejs/mcp` found in the project `node_modules`: a malicious
 * repository could use either to run arbitrary code as soon as pi starts. In untrusted projects we
 * run the server from the pi agent directory instead, which is user-controlled and outside of the
 * project.
 */
function get_isolated_cwd() {
	const agent_dir = getAgentDir();
	return existsSync(agent_dir) ? agent_dir : homedir();
}

/**
 * Registers the Svelte MCP server unless the user already configured it in `mcp.json`.
 * Returns the name of the server in use (registered or user configured) and whether the server
 * runs outside of the project directory (in which case relative paths can't be resolved by it).
 *
 * @param {ExtensionAPI} pi
 * @param {ResolvedConfig} config
 * @param {string} cwd
 * @param {boolean} trusted
 */
export function setup_mcp(pi, config, cwd, trusted) {
	// if the user already configured the Svelte MCP server we don't register ours, but we return
	// its name so that the instructions can reference the right tool names
	const configured = find_configured_svelte_mcp(cwd, trusted);
	if (configured) return { name: configured, isolated: false };
	const description =
		'Official Svelte MCP server: Svelte 5 and SvelteKit documentation, code analysis with the autofixer and playground links.';
	if (config.mcp.type === 'remote') {
		pi.registerMcpServer(DEFAULT_MCP_NAME, {
			url: REMOTE_URL,
			enabled: config.mcp.enabled,
			exposure: config.mcp.exposure,
			description,
		});
		return { name: DEFAULT_MCP_NAME, isolated: false };
	}
	// In trusted projects we keep the default working directory (the project) so that the autofixer
	// can resolve relative file paths: pi already runs project extensions there, so honoring the
	// project npm configuration doesn't add any risk.
	const isolated = !trusted;
	pi.registerMcpServer(DEFAULT_MCP_NAME, {
		command: 'npx',
		args: ['-y', '@sveltejs/mcp'],
		...(isolated ? { cwd: get_isolated_cwd() } : {}),
		enabled: config.mcp.enabled,
		exposure: config.mcp.exposure,
		description,
	});
	return { name: DEFAULT_MCP_NAME, isolated };
}
