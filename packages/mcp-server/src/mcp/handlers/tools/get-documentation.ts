import type { SvelteMcp } from '../../index.js';
import * as v from 'valibot';
import { get_sections, fetch_with_timeout, format_sections_list } from '../../utils.js';
import { SECTIONS_LIST_INTRO, SECTIONS_LIST_OUTRO } from './prompts.js';
import { icons } from '../../icons/index.js';
import { tool } from 'tmcp/utils';

const get_documentation_schema = v.object({
	section: v.pipe(
		v.union([v.string(), v.array(v.string())]),
		v.description(
			'The section name(s) to retrieve. Can search by title (e.g., "$state", "load functions") or file path (e.g., "cli/overview"). Supports single string and array of strings',
		),
	),
});

export async function get_documentation_handler({
	section,
}: v.InferInput<typeof get_documentation_schema>) {
	let sections: string[];

	if (Array.isArray(section)) {
		sections = section.filter((s): s is string => typeof s === 'string');
	} else if (
		typeof section === 'string' &&
		section.trim().startsWith('[') &&
		section.trim().endsWith(']')
	) {
		try {
			const parsed = JSON.parse(section);
			if (Array.isArray(parsed)) {
				sections = parsed.filter((s): s is string => typeof s === 'string');
			} else {
				sections = [section];
			}
		} catch {
			sections = [section];
		}
	} else if (typeof section === 'string') {
		sections = [section];
	} else {
		sections = [];
	}

	const available_sections = await get_sections();

	const settled_results = await Promise.allSettled(
		sections.map(async (requested_section) => {
			const matched_section = available_sections.find(
				(s) =>
					s.title.toLowerCase() === requested_section.toLowerCase() ||
					s.slug === requested_section ||
					s.url === requested_section,
			);

			if (matched_section) {
				try {
					const response = await fetch_with_timeout(matched_section.url);
					if (response.ok) {
						const content = await response.text();
						return { success: true, content: `## ${matched_section.title}\n\n${content}` };
					} else {
						return {
							success: false,
							content: `## ${matched_section.title}\n\nError: Could not fetch documentation (HTTP ${response.status})`,
						};
					}
				} catch (error) {
					return {
						success: false,
						content: `## ${matched_section.title}\n\nError: Failed to fetch documentation - ${error}`,
					};
				}
			} else {
				return {
					success: false,
					content: `## ${requested_section}\n\nError: Section not found.`,
				};
			}
		}),
	);

	const results = settled_results.map((result) => {
		if (result.status === 'fulfilled') {
			return result.value;
		} else {
			return {
				success: false,
				content: `Error: Couldn't fetch - ${result.reason}`,
			};
		}
	});

	const successes = results.filter((r) => r.success);
	const failed_sections = sections.filter(
		(s) =>
			!available_sections.some(
				(a) => a.title.toLowerCase() === s.toLowerCase() || a.slug === s || a.url === s,
			),
	);

	if (successes.length > 0 && failed_sections.length === 0) {
		return successes.map((r) => r.content).join('\n\n---\n\n');
	}

	const parts: string[] = [];

	if (successes.length > 0) {
		parts.push(successes.map((r) => r.content).join('\n\n---\n\n'));
	}

	const fuzzy_results = failed_sections.map((requested) => {
		const lower = requested.toLowerCase();
		const matches = available_sections.filter(
			(a) =>
				a.title.toLowerCase().includes(lower) ||
				a.slug.includes(lower) ||
				lower.includes(a.slug.split('/').pop() ?? '') ||
				a.use_cases.toLowerCase().includes(lower),
		);
		return { requested, matches };
	});

	const has_fuzzy = fuzzy_results.some((r) => r.matches.length > 0);

	// Full list only when no successes and no fuzzy matches
	if (successes.length === 0 && !has_fuzzy) {
		const formatted_sections = await format_sections_list();
		parts.push(`${SECTIONS_LIST_INTRO}\n\n${formatted_sections}\n\n${SECTIONS_LIST_OUTRO}`);
	}

	// Similar results then errors
	for (const { requested, matches } of fuzzy_results) {
		if (matches.length > 0) {
			const match_list = matches.map((m) => `- title: ${m.title}, section: ${m.slug}`).join('\n');
			parts.push(
				`${matches.length} similar result${matches.length > 1 ? 's' : ''} for "${requested}":\n${match_list}`,
			);
		}
		parts.push(`Section not found: "${requested}".`);
	}

	return parts.join('\n\n---\n\n');
}

export function get_documentation(server: SvelteMcp) {
	server.tool(
		{
			name: 'get-documentation',
			description:
				'Retrieves full documentation content for Svelte 5 or SvelteKit sections. Supports flexible search by title (e.g., "$state", "routing") or file path (e.g., "cli/overview"). Can accept a single section name or an array of sections. Before running this, make sure to analyze the users query, as well as the output from list-sections (which should be called first). Then ask for ALL relevant sections the user might require. For example, if the user asks to build anything interactive, you will need to fetch all relevant runes, and so on. Before calling this tool, try to implement Svelte components using your own knowledge and the `svelte-autofixer` tool, since calling this tool is token intensive.',
			schema: get_documentation_schema,
			annotations: {
				title: 'Get Documentation',
				destructiveHint: false,
				readOnlyHint: true,
				openWorldHint: false,
			},
			icons,
		},
		async ({ section }) => {
			if (server.ctx.sessionId && server.ctx.custom?.track) {
				await server.ctx.custom?.track?.(server.ctx.sessionId, 'get-documentation');
			}
			try {
				const content = await get_documentation_handler({ section });
				return tool.text(content);
			} catch (e) {
				const error = e as Error;
				if (server.ctx.sessionId && server.ctx.custom?.track) {
					await server.ctx.custom?.track?.(
						server.ctx.sessionId,
						'get-documentation-error',
						error.message,
					);
				}
				return tool.error(error.message);
			}
		},
	);
}
