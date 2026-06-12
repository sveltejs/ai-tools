import { dev } from '$app/environment';
import { http_transport } from '$lib/mcp/index.js';
import { redirect } from '@sveltejs/kit';
import { track } from '@vercel/analytics/server';

export async function handle({ event, resolve }) {
	if (event.request.method === 'GET') {
		const accept = event.request.headers.get('accept');
		if (accept) {
			const accepts = accept.split(',');
			if (!accepts.includes('text/event-stream')) {
				// the request it's a browser request, not an MCP client request
				// it means someone probably opened it from the docs...we should redirect to the docs
				redirect(302, 'https://svelte.dev/docs/mcp/overview');
			}
		}
	}
	const mcp_response = await http_transport.respond(event.request, {
		// only add analytics in production
		track: dev
			? undefined
			: async (session_id, event, extra) => {
					await track(event, { session_id, ...(extra ? { extra } : {}) });
				},
	});
	return mcp_response ?? resolve(event);
}
