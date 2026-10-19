import { InMemoryTransport } from '@tmcp/transport-in-memory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let client: ReturnType<InMemoryTransport<{ subdomain?: string }>['stateless']>;
const fetch_mock = vi.fn<typeof fetch>();

beforeEach(async () => {
	vi.stubGlobal('fetch', fetch_mock);
	fetch_mock.mockImplementation(async (input) => {
		const url = new URL(String(input));
		const channel = url.hostname === 'svelte.dev' ? 'stable' : url.hostname.split('.')[0];
		if (url.pathname === '/docs/experimental/sections.json') {
			return Response.json({
				[url.pathname]: {
					metadata: { title: `${channel} overview`, use_cases: 'getting started' },
					slug: `docs/svelte/${channel}-overview`,
				},
			});
		}
		if (url.pathname === `/docs/svelte/${channel}-overview/llms.txt`) {
			return new Response(`${channel} documentation content`);
		}
		throw new Error(`Unexpected documentation URL: ${url}`);
	});
	await create_client();
});

/**
 * Creates a fresh server, which prefetches the stable and next indexes during setup.
 */
async function create_client() {
	vi.resetModules();
	fetch_mock.mockClear();
	const { server } = await import('../../index.js');
	client = new InMemoryTransport(server).stateless();
	// A failed prefetch may already have requested its fallback by now.
	expect(fetch_mock.mock.calls.slice(0, 2).map(([url]) => url)).toEqual([
		'https://svelte.dev/docs/experimental/sections.json',
		'https://next.svelte.dev/docs/experimental/sections.json',
	]);
	// Let the tests only count the requests they make.
	fetch_mock.mockClear();
}

afterEach(() => {
	vi.unstubAllGlobals();
	fetch_mock.mockReset();
});

describe.each([undefined, '', 'next', 'preview'])(
	'documentation with subdomain=%s',
	(subdomain) => {
		const channel = subdomain || 'stable';
		const origin = subdomain ? `https://${subdomain}.svelte.dev` : 'https://svelte.dev';
		const ctx = subdomain === undefined ? undefined : { subdomain };

		it('lists sections from the selected documentation site', async () => {
			const result = await client.callTool('list-sections', {}, ctx);
			expect(result.isError).not.toBe(true);
			expect(result.content).toEqual([
				{ type: 'text', text: expect.stringContaining(`path: svelte/${channel}-overview`) },
			]);
			expect(JSON.stringify(result).includes('package.json')).toBe(Boolean(subdomain));
			if (subdomain) {
				expect(result.content?.[0]).toMatchObject({
					text: expect.stringContaining('change their MCP configuration'),
				});
			} else {
				expect(JSON.stringify(result)).not.toContain('package.json');
			}
			expect(fetch_mock).toHaveBeenCalledWith(
				`${origin}/docs/experimental/sections.json`,
				expect.anything(),
			);
		});

		it('fetches section content from the selected site and includes version guidance for subdomains', async () => {
			const result = await client.callTool(
				'get-documentation',
				{ section: `svelte/${channel}-overview` },
				ctx,
			);
			expect(result.isError).not.toBe(true);
			expect(result.content).toEqual([
				{ type: 'text', text: expect.stringContaining(`${channel} documentation content`) },
			]);
			expect(JSON.stringify(result).includes('package.json')).toBe(Boolean(subdomain));
			expect(fetch_mock).toHaveBeenCalledWith(
				`${origin}/docs/svelte/${channel}-overview/llms.txt`,
				expect.anything(),
			);
		});

		it('keeps fallback section lists on the selected site', async () => {
			const result = await client.callTool('get-documentation', { section: 'nonexistent' }, ctx);
			expect(result.content).toEqual([
				{ type: 'text', text: expect.stringContaining(`path: svelte/${channel}-overview`) },
			]);
			expect(JSON.stringify(result).includes('package.json')).toBe(Boolean(subdomain));
			expect(fetch_mock.mock.calls.every(([url]) => String(url).startsWith(origin))).toBe(true);
		});

		it('reuses the same index for resource lists, reads, and completions', async () => {
			const uri = `svelte://svelte/${channel}-overview.md`;
			const resources = await client.listResources({}, ctx);
			expect(resources.resources).toContainEqual(expect.objectContaining({ uri }));
			const result = await client.readResource(uri, ctx);
			expect(result.contents).toContainEqual(
				expect.objectContaining({
					text: expect.stringContaining(`${channel} documentation content`),
				}),
			);
			const completion = await client.complete(
				{ type: 'ref/resource', uri: 'svelte://{/slug*}.md' },
				{ name: 'slug', value: 'overview' },
				undefined,
				ctx,
			);
			expect(completion.completion.values).toEqual([`svelte/${channel}-overview`]);
			await client.listResources({}, ctx);
			await client.complete(
				{ type: 'ref/resource', uri: 'svelte://{/slug*}.md' },
				{ name: 'slug', value: 'overview' },
				undefined,
				ctx,
			);
			// Fetch the page content once, and the index once unless it was prefetched during setup.
			expect(fetch_mock).toHaveBeenCalledTimes(subdomain === 'preview' ? 2 : 1);
			expect(fetch_mock).toHaveBeenCalledWith(
				`${origin}/docs/svelte/${channel}-overview/llms.txt`,
				expect.anything(),
			);
		});

		it('uses the selected section list in the Svelte task prompt', async () => {
			const result = await client.getPrompt('svelte-task', { task: 'Build a counter' }, ctx);
			expect(JSON.stringify(result)).toContain(`path: svelte/${channel}-overview`);
		});
	},
);

it('isolates subdomains and stable documentation for concurrent requests', async () => {
	const [next_result, preview_result, stable_result] = await Promise.all([
		client.callTool(
			'get-documentation',
			{ section: 'svelte/next-overview' },
			{ subdomain: 'next' },
		),
		client.callTool(
			'get-documentation',
			{ section: 'svelte/preview-overview' },
			{ subdomain: 'preview' },
		),
		client.callTool('get-documentation', { section: 'svelte/stable-overview' }),
	]);
	const next_text = JSON.stringify(next_result);
	const stable_text = JSON.stringify(stable_result);
	expect(next_text).toContain('next documentation content');
	expect(next_text).toContain('package.json');
	expect(next_text).not.toContain('preview documentation content');
	expect(JSON.stringify(preview_result)).toContain('preview documentation content');
	expect(stable_text).toContain('stable documentation content');
	expect(stable_text).not.toContain('package.json');
});

describe.each(['network', 'timeout', '404', '503', 'html', 'invalid schema', 'empty', 'redirect'])(
	'unavailable subdomain (%s)',
	(failure) => {
		beforeEach(() => {
			const fetch_documentation = fetch_mock.getMockImplementation()!;
			fetch_mock.mockImplementation(async (input, init) => {
				if (String(input).startsWith('https://preview.svelte.dev')) {
					switch (failure) {
						case 'network':
							throw new TypeError('fetch failed');
						case 'timeout':
							throw new DOMException('Timed out', 'TimeoutError');
						case '404':
							return new Response('Not found', { status: 404 });
						case '503':
							return new Response('Unavailable', { status: 503 });
						case 'html':
							return new Response('<html>Not deployed</html>');
						case 'invalid schema':
							return Response.json({ message: 'Not found' });
						case 'empty':
							return Response.json({});
						case 'redirect': {
							const response = await fetch_documentation(
								'https://svelte.dev/docs/experimental/sections.json',
								init,
							);
							Object.defineProperty(response, 'url', {
								value: 'https://svelte.dev/docs/experimental/sections.json',
							});
							return response;
						}
					}
				}
				return fetch_documentation(input, init);
			});
		});

		it('returns stable sections with an explicit instruction to warn the user', async () => {
			const result = await client.callTool('list-sections', {}, { subdomain: 'preview' });
			expect(result.isError).not.toBe(true);
			const text = JSON.stringify(result);
			expect(text).toContain('path: svelte/stable-overview');
			expect(text).toContain('https://preview.svelte.dev is unavailable');
			expect(text).toContain('MUST warn the user');
		});

		it('fetches fallback content and includes the warning even for missing sections', async () => {
			const result = await client.callTool(
				'get-documentation',
				{ section: 'svelte/stable-overview' },
				{ subdomain: 'preview' },
			);
			expect(result.isError).not.toBe(true);
			expect(JSON.stringify(result)).toContain('stable documentation content');
			expect(JSON.stringify(result)).toContain('MUST warn the user');
			const missing = await client.callTool(
				'get-documentation',
				{ section: 'nonexistent' },
				{ subdomain: 'preview' },
			);
			expect(JSON.stringify(missing)).toContain('path: svelte/stable-overview');
			expect(JSON.stringify(missing)).toContain('MUST warn the user');
		});

		it('includes the fallback warning in resource descriptions, content, and task prompts', async () => {
			const ctx = { subdomain: 'preview' };
			const resources = await client.listResources({}, ctx);
			expect(resources.resources).toContainEqual(
				expect.objectContaining({
					uri: 'svelte://svelte/stable-overview.md',
					description: expect.stringContaining('MUST warn the user'),
				}),
			);
			const result = await client.readResource('svelte://svelte/stable-overview.md', ctx);
			expect(JSON.stringify(result)).toContain('stable documentation content');
			expect(JSON.stringify(result)).toContain('MUST warn the user');
			const completion = await client.complete(
				{ type: 'ref/resource', uri: 'svelte://{/slug*}.md' },
				{ name: 'slug', value: 'overview' },
				undefined,
				ctx,
			);
			expect(completion.completion.values).toEqual(['svelte/stable-overview']);
			const prompt = await client.getPrompt('svelte-task', { task: 'Build a counter' }, ctx);
			expect(JSON.stringify(prompt)).toContain('path: svelte/stable-overview');
			expect(JSON.stringify(prompt)).toContain('MUST warn the user');
		});
	},
);

it('retries a subdomain after a fallback instead of caching the fallback forever', async () => {
	fetch_mock.mockRejectedValueOnce(new Error('Not deployed yet'));
	const fallback = await client.listResources({}, { subdomain: 'preview' });
	expect(fallback.resources).toContainEqual(
		expect.objectContaining({ uri: 'svelte://svelte/stable-overview.md' }),
	);
	const recovered = await client.listResources({}, { subdomain: 'preview' });
	expect(recovered.resources).toContainEqual(
		expect.objectContaining({ uri: 'svelte://svelte/preview-overview.md' }),
	);
	expect(JSON.stringify(recovered)).not.toContain('MUST warn the user');
});

it('retries a prefetched subdomain that was unavailable during setup', async () => {
	const fetch_documentation = fetch_mock.getMockImplementation()!;
	fetch_mock.mockImplementation(async (input, init) => {
		if (String(input).startsWith('https://next.svelte.dev/')) throw new Error('Not deployed yet');
		return fetch_documentation(input, init);
	});
	await create_client();
	const fallback = await client.listResources({}, { subdomain: 'next' });
	expect(fallback.resources).toContainEqual(
		expect.objectContaining({ uri: 'svelte://svelte/stable-overview.md' }),
	);
	expect(JSON.stringify(fallback)).toContain('MUST warn the user');
	fetch_mock.mockImplementation(fetch_documentation);
	const recovered = await client.listResources({}, { subdomain: 'next' });
	expect(recovered.resources).toContainEqual(
		expect.objectContaining({ uri: 'svelte://svelte/next-overview.md' }),
	);
	expect(JSON.stringify(recovered)).not.toContain('MUST warn the user');
});

it('keeps working subdomains available when stable docs fail and retries failed resource indexes', async () => {
	const fetch_documentation = fetch_mock.getMockImplementation()!;
	fetch_mock.mockImplementation(async (input, init) => {
		if (String(input).startsWith('https://svelte.dev/')) throw new Error('Index unavailable');
		return fetch_documentation(input, init);
	});
	// Fail the prefetch too, a failed index should never be pinned.
	await create_client();
	const resources = await client.listResources({}, { subdomain: 'preview' });
	expect(resources.resources).toContainEqual(
		expect.objectContaining({ uri: 'svelte://svelte/preview-overview.md' }),
	);
	await expect(client.listResources({})).rejects.toThrow('Index unavailable');
	fetch_mock.mockImplementation(fetch_documentation);
	expect((await client.listResources({})).resources).toContainEqual(
		expect.objectContaining({ uri: 'svelte://svelte/stable-overview.md' }),
	);
});

it('reports an error if both the subdomain and fallback are unavailable', async () => {
	fetch_mock.mockRejectedValue(new Error('Index unavailable'));
	const result = await client.callTool('list-sections', {}, { subdomain: 'preview' });
	expect(result.isError).toBe(true);
	expect(JSON.stringify(result)).toContain('Index unavailable');
	expect(fetch_mock).toHaveBeenCalledTimes(2);
});

it.each([
	'https://example.com',
	'next/path',
	'next?query',
	'next#fragment',
	'user@host',
	'../next',
	'-next',
	'a'.repeat(64),
])('rejects invalid subdomain %s without fetching', async (subdomain) => {
	const result = await client.callTool('list-sections', {}, { subdomain });
	expect(result.isError).toBe(true);
	expect(JSON.stringify(result)).toContain('Invalid documentation subdomain');
	expect(fetch_mock).not.toHaveBeenCalled();
});

it('normalizes subdomains and treats whitespace as the default site', async () => {
	const preview = await client.callTool('list-sections', {}, { subdomain: ' Preview ' });
	expect(JSON.stringify(preview)).toContain('path: svelte/preview-overview');
	const stable = await client.callTool('list-sections', {}, { subdomain: ' ' });
	expect(JSON.stringify(stable)).toContain('path: svelte/stable-overview');
	expect(JSON.stringify(stable)).not.toContain('package.json');
});
