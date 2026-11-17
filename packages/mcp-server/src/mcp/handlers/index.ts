import type { SvelteMcp } from '../index.js';
import * as prompts from './prompts/index.js';
import { tools, type ToolName } from './tools/index.js';
import * as resources from './resources/index.js';

export const tool_names = Object.keys(tools) as ToolName[];

/**
 * Validates an allow-list of tool names, returning every tool when no allow-list is given.
 */
export function resolve_tools(allowed?: string[]): Set<ToolName> {
	if (!allowed) return new Set(tool_names);

	const unknown = allowed.filter((name) => !tool_names.includes(name as ToolName));
	if (unknown.length > 0) {
		throw new Error(
			`Unknown tool${unknown.length > 1 ? 's' : ''}: ${unknown.join(', ')}. Valid tools are: ${tool_names.join(', ')}`,
		);
	}
	if (allowed.length === 0) {
		throw new Error(`No tools enabled. Valid tools are: ${tool_names.join(', ')}`);
	}

	return new Set(allowed as ToolName[]);
}

export function setup_tools(server: SvelteMcp, enabled_tools: Set<ToolName>) {
	for (const tool of enabled_tools) {
		tools[tool](server);
	}
}

export function setup_prompts(server: SvelteMcp, enabled_tools: Set<ToolName>) {
	for (const prompt in prompts) {
		prompts[prompt as keyof typeof prompts](server, enabled_tools);
	}
}

export function setup_resources(server: SvelteMcp) {
	for (const resource in resources) {
		resources[resource as keyof typeof resources](server);
	}
}
