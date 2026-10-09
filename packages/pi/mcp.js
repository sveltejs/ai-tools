import { existsSync, readFileSync } from 'node:fs';
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
 * Registers the Svelte MCP server unless the user already configured it in `mcp.json`.
 * Returns the name of the server in use (registered or user configured).
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
	if (configured) return configured;
	const description =
		'Official Svelte MCP server: Svelte 5 and SvelteKit documentation, code analysis with the autofixer and playground links.';
	if (config.mcp.type === 'remote') {
		pi.registerMcpServer(DEFAULT_MCP_NAME, {
			url: REMOTE_URL,
			enabled: config.mcp.enabled,
			exposure: config.mcp.exposure,
			description,
		});
	} else {
		pi.registerMcpServer(DEFAULT_MCP_NAME, {
			command: 'npx',
			args: ['-y', '@sveltejs/mcp'],
			enabled: config.mcp.enabled,
			exposure: config.mcp.exposure,
			description,
		});
	}
	return DEFAULT_MCP_NAME;
}
