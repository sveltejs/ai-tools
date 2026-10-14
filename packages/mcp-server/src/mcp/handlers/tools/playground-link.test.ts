import { InMemoryTransport } from '@tmcp/transport-in-memory';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../index.js';

const transport = new InMemoryTransport(server);

let client: ReturnType<typeof transport.session> | ReturnType<typeof transport.stateless>;

describe.each(['session', 'stateless'])('playground-link tool - %s', (kind) => {
	beforeEach(async () => {
		if (kind === 'session') {
			client = transport.session();
			await client.initialize(
				'2025-06-18',
				{},
				{
					name: 'test-client',
					version: '1.0.0',
				},
			);
		} else {
			client = transport.stateless();
		}
	});

	it('should create a playground link if App.svelte is present', async () => {
		const result = await client.callTool<{ url: string }>('playground-link', {
			name: 'My Playground',
			tailwind: false,
			files: {
				'App.svelte': `Hi there!`,
			},
		});
		expect(result.structuredContent).toBeDefined();
		expect(result.structuredContent?.url).toBeDefined();
		// Verify URL structure rather than exact match (gzip compression can vary by platform)
		expect(result.structuredContent?.url).toMatch(/^https:\/\/svelte\.dev\/playground#H4sIA/);
		expect(result.structuredContent?.url).toContain('svelte.dev/playground');
	});

	it('should have a content with the stringified version of structured content and an ui resource', async () => {
		const result = await client.callTool<{ url: string }>('playground-link', {
			name: 'My Playground',
			tailwind: false,
			files: {
				'App.svelte': `Hi there!`,
			},
		});
		expect(result.structuredContent).toBeDefined();
		expect(result.content).toStrictEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'text',
					text: JSON.stringify(result.structuredContent),
				}),
			]),
		);
		// Verify resource structure without exact URL match (gzip compression can vary by platform)
		expect(result.content).toStrictEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: 'resource',
					resource: expect.objectContaining({
						uri: 'ui://svelte/playground-link',
						mimeType: 'text/html;profile=mcp-app',
						_meta: { 'mcpui.dev/ui-preferred-frame-size': ['100%', '1200px'] },
						text: expect.stringMatching(/^https:\/\/svelte\.dev\/playground\/embed#H4sIA/),
					}),
				}),
			]),
		);
	});

	it('should have tool _meta with resource URI for MCP Apps hosts', async () => {
		const tools = await client.listTools();
		const playground_tool = tools.tools.find((t) => t.name === 'playground-link');
		expect(playground_tool).toBeDefined();
		expect(playground_tool?._meta).toStrictEqual({
			ui: { resourceUri: 'ui://svelte/playground-link' },
		});
	});

	it('should expose a resource for MCP Apps hosts', async () => {
		const resources = await client.listResources();
		const playground_resource = resources.resources.find(
			(r) => r.uri === 'ui://svelte/playground-link',
		);
		expect(playground_resource).toBeDefined();
		expect(playground_resource?.name).toBe('playground-link-ui');
	});

	it('should not create a playground link if App.svelte is missing', async () => {
		const result = await client.callTool<{ url: string }>('playground-link', {
			name: 'My Playground',
			tailwind: false,
			files: {
				'Something.svelte': `Hi there!`,
			},
		});
		expect(result.isError).toBe(true);
		expect(result.content?.[0]).toStrictEqual({
			type: 'text',
			text: 'The files must contain an App.svelte file as the entry point',
		});
	});
});
