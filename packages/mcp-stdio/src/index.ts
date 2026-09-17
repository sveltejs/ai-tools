#! /usr/bin/env node
import { server } from '@sveltejs/mcp-server';
import {
	list_sections_handler,
	get_documentation_handler,
	svelte_autofixer_handler,
} from '@sveltejs/mcp-server/handlers';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { StdioTransport } from '@tmcp/transport-stdio';
import sade from 'sade';

const cli = sade('svelte-mcp');

cli.command('__mcp', '', { default: true }).action(() => {
	const transport = new StdioTransport(server);
	transport.listen({
		stdio: true,
	});
});

cli
	.command('list-sections')
	.describe('List all the available documentation sections')
	.action(async () => {
		console.log(await list_sections_handler());
	});

cli
	.command('get-documentation <sections>')
	.describe('Get documentation for specified sections, separated by commas')
	.action(async (sections) => {
		console.log(await get_documentation_handler({ section: sections.split(',') }));
	});

cli
	.command('svelte-autofixer <code_or_path>')
	.describe(
		'Detect and suggest fixes for Svelte code issues, because the terminal will substitute variables `$` should be correctly escaped',
	)
	.option('--async', 'Wether the project is using async svelte or not', false)
	.option(
		'--svelte-version',
		'Which version of svelte to use...ideally the full version from package.json (e.g. 5.16.0), the major must be 4 or 5',
		'5',
	)
	.action(async (code_or_path, { async, 'svelte-version': version }) => {
		let code = code_or_path;

		let is_path = false;

		if (existsSync(code_or_path)) {
			console.log('Detected file path, reading file...');
			code = await readFile(code_or_path, 'utf-8');
			is_path = true;
		} else {
			console.log('File not found, treating input as code...');
		}

		const desired_svelte_version = String(version);

		const result = await svelte_autofixer_handler({
			code,
			async: Boolean(async),
			desired_svelte_version,
			filename: is_path ? code_or_path : undefined,
		});
		console.log(result);
	});

cli.parse(process.argv);
