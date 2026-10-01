import type { SvelteMcp } from '../../index.js';
import { get_sections, fetch_with_timeout } from '../../utils.js';
import { icons } from '../../icons/index.js';
import { resource } from 'tmcp/utils';

export function list_sections(server: SvelteMcp) {
	// Share each subdomain's index across resource operations.
	const section_indexes = new Map<string, ReturnType<typeof get_sections>>();

	function load_sections(subdomain: string) {
		const index = get_sections(subdomain);
		section_indexes.set(subdomain, index);
		// Retry failed and unavailable subdomains on the next request rather than pinning the
		// error or the fallback.
		function evict() {
			if (section_indexes.get(subdomain) === index) section_indexes.delete(subdomain);
		}
		index.then((result) => {
			if (result.fallback) evict();
		}, evict);
		return index;
	}

	// Almost every request is for one of these, so start fetching them during setup and load
	// every other subdomain on demand.
	for (const subdomain of ['', 'next']) load_sections(subdomain);

	function get_resource_sections() {
		const subdomain = server.ctx.custom?.subdomain?.trim().toLowerCase() ?? '';
		return section_indexes.get(subdomain) ?? load_sections(subdomain);
	}

	server.template(
		{
			name: 'Svelte-Doc-Section',
			description: 'A single documentation section',
			async list() {
				const { sections, instructions } = await get_resource_sections();
				return sections.map((section) => {
					const section_name = section.slug;
					const resource_name = section_name;
					const resource_uri = `svelte://${section_name}.md`;
					return {
						name: resource_name,
						description: instructions + section.use_cases,
						uri: resource_uri,
						title: section.title,
					};
				});
			},
			complete: {
				slug: async (query) => {
					const { sections } = await get_resource_sections();
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
			const { sections, instructions } = await get_resource_sections();
			const section = sections.find((section) => {
				return slug === section.slug;
			});
			if (!section) throw new Error(`Section not found: ${slug}`);
			const response = await fetch_with_timeout(section.url);
			const content = await response.text();
			return resource.text(uri, instructions + content);
		},
	);
}
