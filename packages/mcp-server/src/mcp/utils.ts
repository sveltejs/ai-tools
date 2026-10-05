import * as v from 'valibot';
import { documentation_sections_schema } from '../lib/schemas.js';
import summary_data from '../use_cases.json' with { type: 'json' };
import { documentation_instructions } from './handlers/tools/prompts.js';

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

async function fetch_sections(origin: string) {
	const response = await fetch_with_timeout(`${origin}/docs/experimental/sections.json`);
	if (!response.ok)
		throw new Error(`Could not fetch documentation index (HTTP ${response.status})`);
	if (response.url && new URL(response.url).origin !== origin) {
		throw new Error('Documentation index redirected to a different origin');
	}
	const sections = await response.json();
	const validated_sections = v.safeParse(documentation_sections_schema, sections);
	if (!validated_sections.success || Object.keys(validated_sections.output).length === 0) {
		throw new Error('Invalid or empty documentation index');
	}

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

export async function get_sections(subdomain?: string) {
	subdomain = subdomain?.trim().toLowerCase();
	if (subdomain && !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(subdomain)) {
		throw new Error('Invalid documentation subdomain: use a single DNS label, such as "next".');
	}
	const origin = subdomain ? `https://${subdomain}.svelte.dev` : 'https://svelte.dev';
	try {
		return {
			sections: await fetch_sections(origin),
			instructions: documentation_instructions(subdomain),
			fallback: false,
		};
	} catch (error) {
		if (!subdomain) throw error;
		return {
			sections: await fetch_sections('https://svelte.dev'),
			instructions: documentation_instructions(subdomain, true),
			fallback: true,
		};
	}
}

export function format_sections(sections: Awaited<ReturnType<typeof get_sections>>['sections']) {
	return sections
		.map((s) => `- title: ${s.title}, use_cases: ${s.use_cases}, path: ${s.slug}`)
		.join('\n');
}

export async function format_sections_list(subdomain?: string) {
	const { sections, instructions } = await get_sections(subdomain);
	return instructions + format_sections(sections);
}
