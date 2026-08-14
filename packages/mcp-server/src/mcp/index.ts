import { ValibotJsonSchemaAdapter } from '@tmcp/adapter-valibot';
import { McpServer } from 'tmcp';
import { setup_prompts, setup_resources, setup_tools } from './handlers/index.js';
import { icons } from './icons/index.js';

export const server = new McpServer(
	{
		name: 'Svelte MCP',
		version: '0.0.1',
		description: 'The official Svelte MCP server implementation',
		websiteUrl: 'https://mcp.svelte.dev',
		icons,
	},
	{
		adapter: new ValibotJsonSchemaAdapter(),
		capabilities: {
			tools: {},
			prompts: {},
			resources: {},
			completions: {},
		},
		instructions:
			'This is the official Svelte MCP server. It MUST be used whenever svelte development is involved. It can provide official documentation, code examples and correct your code. After you correct the component call this tool again to confirm all the issues are fixed.',
	},
).withContext<{
	track?: (sessionId: string | undefined, event: string, extra?: string) => Promise<void>;
	id?: string;
	stdio?: boolean;
}>();

export type SvelteMcp = typeof server;

setup_tools(server);
setup_resources(server);
setup_prompts(server);

server.on('initialize', async ({ clientInfo: client_info }) => {
	if (!server.ctx.custom?.track) return;
	server.ctx.custom.track(server.ctx.sessionId, 'initialize', client_info.name);
});

server.on('discover', (request) => {
	if (!request?._meta) return;
	const { 'io.modelcontextprotocol/clientInfo': client_info } = request._meta;
	if (!server.ctx.custom?.track || !client_info) return;
	server.ctx.custom.track(undefined, 'discover', client_info.name);
});
