import * as v from 'valibot';
import { documentation_sections_schema } from '../lib/schemas.js';
import summary_data from '../use_cases.json' with { type: 'json' };

export async function fetch_with_timeout(
	url: string,
	timeout_ms: number = 10000,
): Promise<Response> {
	try {
		const response = await fetch(url, { signal: AbortSignal.timeout(timeout_ms) });
		return response;
	} catch (error) {
		if (error instanceof Error && error.name === 'AbortError') {
			throw new Error(`Request timed out after ${timeout_ms}ms`);
		}
		throw error;
	}
}

const summaries = (summary_data.summaries || {}) as Record<string, string>;

export async function get_sections(next = false) {
	const origin = next ? 'https://next.svelte.dev' : 'https://svelte.dev';
	const sections = await fetch_with_timeout(`${origin}/docs/experimental/sections.json`).then(
		(res) => res.json(),
	);
	const validated_sections = v.safeParse(documentation_sections_schema, sections);
	if (!validated_sections.success) return [];

	const mapped_sections = Object.entries(validated_sections.output).map(([, section]) => {
		const original_slug = section.slug;
		const cleaned_slug = original_slug.startsWith('docs/')
			? original_slug.slice('docs/'.length)
			: original_slug;

		return {
			title: section.metadata.title,
			use_cases:
				section.metadata.use_cases ??
				summaries[original_slug] ??
				summaries[cleaned_slug] ??
				'use title and path to estimate use case',
			slug: cleaned_slug,
			// Use original slug in URL to ensure it still works
			url: `${origin}/${original_slug}/llms.txt`,
		};
	});

	return mapped_sections;
}

export async function format_sections_list(next = false) {
	const sections = await get_sections(next);
	return sections
		.map((s) => `- title: ${s.title}, use_cases: ${s.use_cases}, path: ${s.slug}`)
		.join('\n');
}
