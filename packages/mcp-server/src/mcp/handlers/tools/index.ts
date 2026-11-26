import { get_documentation } from './get-documentation.js';
import { list_sections } from './list-sections.js';
import { svelte_autofixer } from './svelte-autofixer.js';
import { playground_link } from './playground-link.js';

/**
 * Every tool keyed by the name it is registered with, used to filter tools with an allow-list.
 */
export const tools = {
	'get-documentation': get_documentation,
	'list-sections': list_sections,
	'svelte-autofixer': svelte_autofixer,
	'playground-link': playground_link,
};

export type ToolName = keyof typeof tools;
