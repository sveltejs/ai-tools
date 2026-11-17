import { InMemoryTransport } from '@tmcp/transport-in-memory';
import { describe, expect, it, vi } from 'vitest';
import { create_server } from './index.js';

vi.mock('./utils.js', async (import_original) => ({
	...(await import_original<typeof import('./utils.js')>()),
	get_sections: async () => [],
	format_sections_list: async () => '',
}));

function client(tools?: string[]) {
	return new InMemoryTransport(create_server({ tools })).stateless();
}

async function svelte_task_text(tools?: string[]) {
	const result = await client(tools).getPrompt('svelte-task', { task: 'build a counter' });
	const [message] = result.messages;
	return message?.content.type === 'text' ? message.content.text : '';
}

describe('create_server tools allow-list', () => {
	it('registers every tool when no allow-list is given', async () => {
		const result = await client().listTools();
		expect(result.tools.map((tool) => tool.name).sort()).toStrictEqual([
			'get-documentation',
			'list-sections',
			'playground-link',
			'svelte-autofixer',
		]);
	});

	it('only registers the allowed tools', async () => {
		const result = await client(['list-sections', 'svelte-autofixer']).listTools();
		expect(result.tools.map((tool) => tool.name).sort()).toStrictEqual([
			'list-sections',
			'svelte-autofixer',
		]);
	});

	it('does not allow calling a tool that is not in the allow-list', async () => {
		const result = await client(['list-sections']).callTool('playground-link', {
			name: 'My Playground',
			tailwind: false,
			files: { 'App.svelte': 'Hi there!' },
		});
		expect(result.isError).toBe(true);
		expect(result.content).toStrictEqual([
			{ type: 'text', text: 'Tool playground-link not found' },
		]);
	});

	it('does not register the playground UI resource when playground-link is excluded', async () => {
		const with_playground = await client().listResources();
		expect(with_playground.resources.map((resource) => resource.name)).toContain(
			'playground-link-ui',
		);

		const without_playground = await client(['list-sections']).listResources();
		expect(without_playground.resources.map((resource) => resource.name)).not.toContain(
			'playground-link-ui',
		);
	});

	it('only mentions playground-link in the svelte-task prompt when it is enabled', async () => {
		expect(await svelte_task_text()).toContain('playground-link');
		expect(
			await svelte_task_text(['list-sections', 'get-documentation', 'svelte-autofixer']),
		).not.toContain('playground-link');
	});

	it('throws on unknown tool names', () => {
		expect(() => create_server({ tools: ['list-sections', 'nope'] })).toThrow(
			'Unknown tool: nope. Valid tools are: get-documentation, list-sections, svelte-autofixer, playground-link',
		);
	});

	it('throws when the allow-list is empty', () => {
		expect(() => create_server({ tools: [] })).toThrow('No tools enabled');
	});
});
