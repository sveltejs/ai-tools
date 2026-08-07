import { server } from '@sveltejs/mcp-server';
import { HttpTransport } from '@tmcp/transport-http';

export const http_transport = new HttpTransport(server, {
	cors: true,
	path: '/mcp',
	// we are deploying on vercel the SSE connection will timeout after 5 minutes...for
	// the moment we are not sending back any notifications (logs, or list changed notifications)
	// so it's a waste of resources to keep a connection open that will error
	// after 5 minutes making the logs dirty.
	disableSse: true,
});

export { server };
