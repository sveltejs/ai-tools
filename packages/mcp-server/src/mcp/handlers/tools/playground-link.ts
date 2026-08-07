import { createUIResource } from '@mcp-ui/server';
import { tool } from 'tmcp/utils';
import * as v from 'valibot';
import { icons } from '../../icons/index.js';
import type { SvelteMcp } from '../../index.js';

async function compress_and_encode_text(input: string) {
	const reader = new Blob([input]).stream().pipeThrough(new CompressionStream('gzip')).getReader();
	let buffer = '';
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			reader.releaseLock();
			// Some sites like discord don't like it when links end with =
			return btoa(buffer).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
		} else {
			for (let i = 0; i < value.length; i++) {
				// decoding as utf-8 will make btoa reject the string
				buffer += String.fromCharCode(value[i]!);
			}
		}
	}
}

type File = {
	type: 'file';
	name: string;
	basename: string;
	contents: string;
	text: boolean;
};

const playground_link_schema = v.object({
	name: v.pipe(
		v.string(),
		v.description('The name of the Playground, it should reflect the user task'),
	),
	tailwind: v.pipe(
		v.boolean(),
		v.description(
			"If the code requires Tailwind CSS to work...only send true if it it's using tailwind classes in the code",
		),
	),
	files: v.pipe(
		v.record(v.string(), v.string()),
		v.description(
			"An object where all the keys are the filenames (with extensions) and the values are the file content. For example: { 'Component.svelte': '<script>...</script>', 'utils.js': 'export function ...' }. The playground accept multiple files so if are importing from other files just include them all at the root level.",
		),
	),
});

const playground_link_output_schema = v.object({
	url: v.string(),
});

export async function playground_link_handler({
	files,
	name,
	tailwind,
}: v.InferInput<typeof playground_link_schema>) {
	const playground_base = new URL('https://svelte.dev/playground');
	const playground_files: File[] = [];

	let has_app_svelte = false;

	for (const [filename, contents] of Object.entries(files)) {
		if (filename === 'App.svelte') has_app_svelte = true;
		playground_files.push({
			type: 'file',
			name: filename,
			basename: filename.replace(/^.*[\\/]/, ''),
			contents,
			text: true,
		});
	}

	if (!has_app_svelte) {
		throw new Error('The files must contain an App.svelte file as the entry point');
	}

	const playground_config = {
		name,
		tailwind: tailwind ?? false,
		files: playground_files,
	};

	playground_base.hash = await compress_and_encode_text(JSON.stringify(playground_config));

	const url = playground_base.toString();

	// use the embed path to have a cleaner UI for mcp-ui
	playground_base.pathname = '/playground/embed';

	return {
		url,
		iframe_url: playground_base.toString(),
	};
}

// Create the UI resource for MCP Apps hosts (with adapter)
// This will be registered as a resource that MCP Apps hosts can fetch
const playground_ui_resource = createUIResource({
	uri: 'ui://svelte/playground-link',
	encoding: 'text',
	resourceProps: {
		_meta: {
			ui: {
				csp: {
					connectDomains: ['https://svelte.dev'],
					resourceDomains: ['https://svelte.dev'],
					frameDomains: ['https://svelte.dev'],
					baseUriDomains: ['https://svelte.dev'],
				},
			},
		},
	},
	content: {
		type: 'rawHtml',
		// This is a placeholder HTML - the actual iframe URL will be set per-request
		// MCP Apps hosts receive the tool input/output via postMessage
		htmlString: `<!DOCTYPE html>
<html>
<head>
	<meta charset="utf-8">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<style>
		* { margin: 0; padding: 0; box-sizing: border-box; }
		html, body { width: 100%; height: 100%; }
		iframe { width: 100%; height: 100%; border: none; display: none; }
		.loading { display: flex; align-items: center; justify-content: center; height: 100%; font-family: system-ui, sans-serif; color: #666; }
	</style>
</head>
<body>
	<div class="loading" id="loading">Loading playground...</div>
	<iframe id="playground" allow="clipboard-write"></iframe>
	<script>
		function size_changed() {
			const width = document.body.scrollWidth;
			window.parent.postMessage({
				jsonrpc: '2.0',
				method: 'ui/notifications/size-changed',
				params: {
					width,
					height: 800
					}
				}, '*');
		}
		// Signal that the widget is ready
		window.parent.postMessage({ type: 'ui-lifecycle-iframe-ready' }, '*');
		
		// Listen for render data from the adapter (for MCP Apps hosts)
		window.addEventListener('message', (event) => {
			if (event.data.type === 'ui-lifecycle-iframe-render-data') {
				const renderData = event.data.payload.renderData || {};
				const toolOutput = renderData.toolOutput;
				
				// The tool output contains the iframe URL
				if (toolOutput && toolOutput.structuredContent && toolOutput.structuredContent.url) {
					const iframe = document.getElementById('playground');
					const loading = document.getElementById('loading');
					// Convert the URL to embed URL
					const embedUrl = toolOutput.structuredContent.url.replace('/playground#', '/playground/embed#');
					iframe.src = embedUrl;
					iframe.style.display = 'block';
					iframe.addEventListener("load", () => {
						size_changed();
					});
					loading.style.display = 'none';
				}
			}
		});
	</script>
</body>
</html>`,
	},
	uiMetadata: {
		'preferred-frame-size': ['100%', '1200px'],
	},
	adapters: {
		mcpApps: { enabled: true },
	},
});

export function playground_link(server: SvelteMcp) {
	// Register the UI resource so MCP Apps hosts can fetch it
	server.resource(
		{
			name: 'playground-link-ui',
			description: 'UI resource for the Svelte Playground widget',
			uri: playground_ui_resource.resource.uri,
			icons,
		},
		() => {
			return {
				contents: [playground_ui_resource.resource],
			};
		},
	);

	server.tool(
		{
			name: 'playground-link',
			description:
				'Generates a Playground link given a Svelte code snippet. Once you have the final version of the code you want to send to the user, ALWAYS ask the user if it wants a playground link to allow it to quickly check the code in the playground before calling this tool. NEVER use this tool if you have written the component to a file in the user project. The playground accept multiple files so if are importing from other files just include them all at the root level.',
			schema: playground_link_schema,
			outputSchema: playground_link_output_schema,
			annotations: {
				title: 'Playground Link',
				destructiveHint: false,
				readOnlyHint: true,
				openWorldHint: false,
			},
			icons,
			// For MCP Apps hosts - points to the registered resource
			_meta: {
				ui: {
					resourceUri: playground_ui_resource.resource.uri,
				},
			},
		},
		async ({ files, name, tailwind }) => {
			if (server.ctx.custom?.track) {
				await server.ctx.custom.track(server.ctx.sessionId, 'playground-link');
			}
			try {
				const result = await playground_link_handler({ files, name, tailwind });
				return {
					content: [
						{
							type: 'text',
							text: JSON.stringify({ url: result.url }),
						},
						// Embedded resource for MCP-UI hosts (no adapter, uses externalUrl)
						createUIResource({
							uri: 'ui://svelte/playground-link',
							content: {
								type: 'externalUrl',
								iframeUrl: result.iframe_url,
							},
							uiMetadata: {
								'preferred-frame-size': ['100%', '1200px'],
							},
							encoding: 'text',
						}),
					],
					structuredContent: { url: result.url },
				};
			} catch (e) {
				const error = e as Error;
				if (server.ctx.custom?.track) {
					await server.ctx.custom.track(
						server.ctx.sessionId,
						'playground-link-error',
						error.message,
					);
				}
				return tool.error(error.message);
			}
		},
	);
}
