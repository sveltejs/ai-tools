import { InMemoryTransport } from '@tmcp/transport-in-memory';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let client: ReturnType<InMemoryTransport<{ next?: boolean }>['stateless']>;
const fetch_mock = vi.fn<typeof fetch>();

beforeEach(async () => {
	vi.resetModules();
	vi.stubGlobal('fetch', fetch_mock);
	fetch_mock.mockImplementation(async (input) => {
		const url = new URL(String(input));
		const channel = url.hostname === 'next.svelte.dev' ? 'next' : 'stable';
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
	const { server } = await import('../../index.js');
	client = new InMemoryTransport(server).stateless();
	expect(fetch_mock).toHaveBeenCalledTimes(2);
	expect(fetch_mock).toHaveBeenCalledWith(
		'https://svelte.dev/docs/experimental/sections.json',
		expect.anything(),
	);
	expect(fetch_mock).toHaveBeenCalledWith(
		'https://next.svelte.dev/docs/experimental/sections.json',
		expect.anything(),
	);
	fetch_mock.mockClear();
});

afterEach(() => {
	vi.unstubAllGlobals();
	fetch_mock.mockReset();
});

describe.each([undefined, false, true])('documentation with next=%s', (next) => {
	const channel = next ? 'next' : 'stable';
	const origin = next ? 'https://next.svelte.dev' : 'https://svelte.dev';
	const ctx = next === undefined ? undefined : { next };

	it('lists sections from the selected documentation site', async () => {
		const result = await client.callTool('list-sections', {}, ctx);
		expect(result.isError).not.toBe(true);
		expect(result.content).toEqual([
			{ type: 'text', text: expect.stringContaining(`path: svelte/${channel}-overview`) },
		]);
		expect(JSON.stringify(result).includes('package.json')).toBe(Boolean(next));
		if (next) {
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

	it('fetches section content from the selected site and includes Next guidance only when enabled', async () => {
		const result = await client.callTool(
			'get-documentation',
			{ section: `svelte/${channel}-overview` },
			ctx,
		);
		expect(result.isError).not.toBe(true);
		expect(result.content).toEqual([
			{ type: 'text', text: expect.stringContaining(`${channel} documentation content`) },
		]);
		expect(JSON.stringify(result).includes('package.json')).toBe(Boolean(next));
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
		expect(JSON.stringify(result).includes('package.json')).toBe(Boolean(next));
		expect(fetch_mock.mock.calls.every(([url]) => String(url).startsWith(origin))).toBe(true);
	});

	it('reuses the preloaded index for resource lists, reads, and completions', async () => {
		const uri = `svelte://svelte/${channel}-overview.md`;
		const resources = await client.listResources({}, ctx);
		expect(resources.resources).toContainEqual(expect.objectContaining({ uri }));
		const result = await client.readResource(uri, ctx);
		expect(result.contents).toContainEqual(
			expect.objectContaining({ text: `${channel} documentation content` }),
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
		// Only the page content is fetched; listing and completion use the startup snapshot.
		expect(fetch_mock).toHaveBeenCalledTimes(1);
		expect(fetch_mock).toHaveBeenCalledWith(
			`${origin}/docs/svelte/${channel}-overview/llms.txt`,
			expect.anything(),
		);
	});

	it('uses the selected section list in the Svelte task prompt', async () => {
		const result = await client.getPrompt('svelte-task', { task: 'Build a counter' }, ctx);
		expect(JSON.stringify(result)).toContain(`path: svelte/${channel}-overview`);
	});
});

it('isolates Next and stable documentation for concurrent requests', async () => {
	const [next_result, stable_result] = await Promise.all([
		client.callTool('get-documentation', { section: 'svelte/next-overview' }, { next: true }),
		client.callTool('get-documentation', { section: 'svelte/stable-overview' }),
	]);
	const next_text = JSON.stringify(next_result);
	const stable_text = JSON.stringify(stable_result);
	expect(next_text).toContain('next documentation content');
	expect(next_text).toContain('package.json');
	expect(stable_text).toContain('stable documentation content');
	expect(stable_text).not.toContain('package.json');
});

it.each([false, true])(
	'keeps next=%s resources available if the other index fails',
	async (next) => {
		vi.resetModules();
		const fetch_documentation = fetch_mock.getMockImplementation()!;
		const failed_origin = next ? 'https://svelte.dev' : 'https://next.svelte.dev';
		fetch_mock.mockImplementation(async (input, init) => {
			if (String(input).startsWith(failed_origin)) throw new Error('Index unavailable');
			return fetch_documentation(input, init);
		});
		const { server } = await import('../../index.js');
		const resource_client = new InMemoryTransport(server).stateless();
		const channel = next ? 'next' : 'stable';
		const resources = await resource_client.listResources({}, { next });
		expect(resources.resources).toContainEqual(
			expect.objectContaining({ uri: `svelte://svelte/${channel}-overview.md` }),
		);
		await expect(resource_client.listResources({}, { next: !next })).rejects.toThrow(
			'Index unavailable',
		);
	},
);
