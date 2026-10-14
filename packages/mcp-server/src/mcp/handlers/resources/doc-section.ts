import type { SvelteMcp } from '../../index.js';
import { get_sections, fetch_with_timeout } from '../../utils.js';
import { icons } from '../../icons/index.js';
import { resource } from 'tmcp/utils';

export async function list_sections(server: SvelteMcp) {
	const sections = await get_sections();

	server.template(
		{
			name: 'Svelte-Doc-Section',
			description: 'A single documentation section',
			list() {
				return sections.map((section) => {
					const section_name = section.slug;
					const resource_name = section_name;
					const resource_uri = `svelte://${section_name}.md`;
					return {
						name: resource_name,
						description: section.use_cases,
						uri: resource_uri,
						title: section.title,
					};
				});
			},
			complete: {
				slug: (query) => {
					const values = sections
						.reduce<string[]>((acc, section) => {
							const section_name = section.slug;
							const resource_name = section_name;
							if (section_name.includes(query.toLowerCase())) {
								acc.push(resource_name);
							}
							return acc;
						}, [])
						// there's a hard limit of 100 for completions
						.slice(0, 100);
					return {
						completion: {
							values,
						},
					};
				},
			},
			uri: 'svelte://{/slug*}.md',
			icons,
		},
		async (uri, { slug }) => {
			if (server.ctx.custom?.track) {
				await server.ctx.custom.track(
					server.ctx.sessionId,
					'svelte-doc-section',
					Array.isArray(slug) ? slug.join(',') : slug,
				);
			}
			const section = sections.find((section) => {
				return slug === section.slug;
			});
			if (!section) throw new Error(`Section not found: ${slug}`);
			const response = await fetch_with_timeout(section.url);
			const content = await response.text();
			return resource.text(uri, content);
		},
	);
}
