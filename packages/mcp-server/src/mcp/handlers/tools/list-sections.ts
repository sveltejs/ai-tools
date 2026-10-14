import type { SvelteMcp } from '../../index.js';
import { format_sections_list } from '../../utils.js';
import { SECTIONS_LIST_INTRO, SECTIONS_LIST_OUTRO } from './prompts.js';
import { icons } from '../../icons/index.js';
import { tool } from 'tmcp/utils';

export async function list_sections_handler() {
	const formatted_sections = await format_sections_list();

	return `${SECTIONS_LIST_INTRO}\n\n${formatted_sections}\n\n${SECTIONS_LIST_OUTRO}`;
}

export function list_sections(server: SvelteMcp) {
	server.tool(
		{
			name: 'list-sections',
			description:
				'Lists all available Svelte 5 and SvelteKit documentation sections in a structured format. Each section includes a "use_cases" field that describes WHEN this documentation would be useful. You should carefully analyze the use_cases field to determine which sections are relevant for the user\'s query. The use_cases contain comma-separated keywords describing project types (e.g., "e-commerce", "blog"), features (e.g., "authentication", "forms"), components (e.g., "slider", "modal"), development stages (e.g., "deployment", "testing"), or "always" for fundamental concepts. Match these use_cases against the user\'s intent - for example, if building an e-commerce site, fetch sections with use_cases containing "e-commerce", "product listings", "shopping cart", etc. If building a slider, look for "slider", "carousel", "animation", etc. Returns sections as "* title: [section_title], use_cases: [use_cases], path: [file_path]". Always run list-sections FIRST for any Svelte query, then analyze ALL use_cases to identify relevant sections, and finally use get_documentation to fetch ALL relevant sections at once.',
			annotations: {
				title: 'List Sections',
				destructiveHint: false,
				readOnlyHint: true,
				openWorldHint: false,
			},
			icons,
		},
		async () => {
			if (server.ctx.custom?.track) {
				await server.ctx.custom.track(server.ctx.sessionId, 'list-sections');
			}
			try {
				const content = await list_sections_handler();
				return tool.text(content);
			} catch (e) {
				const error = e as Error;
				if (server.ctx.custom?.track) {
					await server.ctx.custom.track(server.ctx.sessionId, 'list-sections-error', error.message);
				}
				return tool.error(error.message);
			}
		},
	);
}
