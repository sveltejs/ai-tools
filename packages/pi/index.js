import { readFile, readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { get_config } from './config.js';
import { mcp_tool_name, setup_mcp } from './mcp.js';

/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionAPI} ExtensionAPI */
/** @typedef {import('@earendil-works/pi-coding-agent').ExtensionContext} ExtensionContext */

const current_dir = dirname(fileURLToPath(import.meta.url));
const instructions_dir = join(current_dir, 'instructions');

/**
 * @param {string} mcp_name
 * @param {boolean} isolated whether the MCP server runs outside of the project directory
 */
async function load_instructions(mcp_name, isolated) {
	const files = (await readdir(instructions_dir)).filter((file) => file.endsWith('.md')).sort();
	const contents = await Promise.all(
		files.map((file) => readFile(join(instructions_dir, file), 'utf-8')),
	);
	const tools = ['list-sections', 'get-documentation', 'svelte-autofixer', 'playground-link'];
	const naming = [
		`In Pi the Svelte MCP server is called \`${mcp_name}\` and its tools are named ${tools
			.map((tool) => `\`${mcp_tool_name(mcp_name, tool)}\``)
			.join(', ')}.`,
		'Depending on the configured exposure they are either declared directly, reachable through `tool_search`, or callable from `codemode` scripts.',
		...(isolated
			? [
					`The Svelte MCP server runs outside of the project directory, so when passing a file path to \`${mcp_tool_name(mcp_name, 'svelte-autofixer')}\` it MUST be an absolute path (or pass the code directly): relative paths would be treated as code.`,
				]
			: []),
	].join(' ');
	return [naming, ...contents].join('\n\n');
}

/** @param {ExtensionContext} ctx */
function read_config(ctx) {
	return get_config({
		cwd: ctx.cwd,
		trusted: ctx.isProjectTrusted(),
		on_warning(warning) {
			if (ctx.hasUI) ctx.ui.notify(`${warning.title}\n${warning.message}`, 'warning');
			else process.emitWarning(`${warning.title}\n${warning.message}`, { code: 'SVELTE_PI' });
		},
	});
}

/** @param {ExtensionAPI} pi */
export default function svelte(pi) {
	// `registerMcpServer` landed in pi 0.99.0, together with everything else this package relies on
	// (structured system prompt sections, project trust, ...). Peer dependencies are not enforced
	// when pi installs a package, so we feature-detect and bail out with a warning instead of crashing.
	if (typeof pi.registerMcpServer !== 'function') {
		pi.on('session_start', (_event, ctx) => {
			const message = '@sveltejs/pi requires pi 0.99.0 or newer. Run `pi update self` to update.';
			if (ctx.hasUI) ctx.ui.notify(message, 'warning');
			else process.emitWarning(message, { code: 'SVELTE_PI' });
		});
		return;
	}
	/** @type {string | undefined} */
	let instructions;

	pi.on('session_start', async (_event, ctx) => {
		const config = read_config(ctx);
		const mcp = setup_mcp(pi, config, ctx.cwd, ctx.isProjectTrusted());
		instructions = config.instructions.enabled
			? await load_instructions(mcp.name, mcp.isolated)
			: undefined;
	});

	pi.on('before_agent_start', (event) => {
		if (!instructions) return;
		event.systemPromptOptions.sections.svelte_instructions = instructions;
	});
}
