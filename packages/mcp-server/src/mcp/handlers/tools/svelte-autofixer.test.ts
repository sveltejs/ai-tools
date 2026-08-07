/* eslint-disable @typescript-eslint/no-explicit-any */
import { writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { InMemoryTransport } from '@tmcp/transport-in-memory';
import { beforeEach, describe, expect, it } from 'vitest';
import { server } from '../../index.js';

const transport = new InMemoryTransport(server);

let client: ReturnType<typeof transport.session> | ReturnType<typeof transport.stateless>;

async function autofixer_tool_call(
	code: string,
	is_error = false,
	desired_svelte_version = 5,
	async = false,
	ctx?: { stdio?: boolean },
) {
	const result = await client.callTool(
		'svelte-autofixer',
		{
			code,
			desired_svelte_version,
			filename: 'App.svelte',
			async,
		},
		ctx,
	);

	expect(result).toBeDefined();
	if (is_error) {
		return result as any;
	}
	expect(result.structuredContent).toBeDefined();
	return result.structuredContent as any;
}

describe.each(['session', 'stateless'])('svelte-autofixer tool - %s', (type) => {
	beforeEach(async () => {
		if (type === 'session') {
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

	it('should add suggestions for js parse errors', async () => {
		const content = await autofixer_tool_call(`<script>
			$state count = 0;
		</script>`);
		expect(content.issues.length).toBeGreaterThan(0);
		expect(content.suggestions).toContain(
			"The code can't be compiled because a Javascript parse error. In case you are using runes like this `$state variable_name = 3;` or `$derived variable_name = 3 * count` that's not how runes are used. You need to use them as function calls without importing them: `const variable_name = $state(3)` and `const variable_name = $derived(3 * count)`.",
		);
	});

	it('should add suggestions for snippets declared in script tag', async () => {
		const content = await autofixer_tool_call(`<script>
			{#snippet my_snippet()}
				some content
			{/snippet}
		</script>`);
		expect(content.issues.length).toBeGreaterThan(0);
		expect(content.suggestions).toContain(
			"The code can't be compiled because a Javascript parse error. The error suggests you have a `{#snippet ...}` block inside the `<script>` tag. Snippets are template syntax and should be declared in the markup section of the component, not in the script. Move the snippet outside of the `<script>` tag. Snippets declared in the markup can also be accessed in the script tag in case you need them.",
		);
	});

	it('should error out if async is true with a version less than 5', async () => {
		const content = await autofixer_tool_call(
			`<script>
			$state count = 0;
		</script>`,
			true,
			4,
			true,
		);
		expect(content.isError).toBeTruthy();
		expect(content.content[0]).toBeDefined();
		expect(content.content[0].text).toBe(
			'The async option can only be used with Svelte version 5 or higher.',
		);
	});

	it('should not add suggestion/issues if async is true and await is used in the template/derived', async () => {
		const content = await autofixer_tool_call(
			`<script>
			import { slow_double } from './utils.js';
			let count = $state(0);
			let double = $derived(await slow_double(count));
		</script>
		
		{double}
		{await slow_double(count)}`,
			false,
			5,
			true,
		);
		expect(content.issues).toHaveLength(0);
		expect(content.suggestions).toHaveLength(0);
		expect(content.require_another_tool_call_after_fixing).toBeFalsy();
	});

	it('should add suggestion/issues if async is false and await is used in the template/derived', async () => {
		const content = await autofixer_tool_call(
			`<script>
			import { slow_double } from './utils.js';
			let count = $state(0);
			let double = $derived(await slow_double(count));
		</script>
		
		{double}
		{await slow_double(count)}`,
			false,
			5,
		);
		expect(content.issues.length).toBeGreaterThanOrEqual(1);
		expect(content.issues).toEqual(
			expect.arrayContaining([expect.stringContaining('experimental_async')]),
		);
		expect(content.require_another_tool_call_after_fixing).toBeTruthy();
	});

	it('should add suggestions for css invalid identifier', async () => {
		const content = await autofixer_tool_call(`<script>
				let my_color = $state('red');
			</script>
							
			<style>
				.my-class {
					color: {my_color};
				}
			</style>`);

		expect(content.issues.length).toBeGreaterThan(0);
		expect(content.suggestions).toContain(
			"The code can't be compiled because a valid CSS identifier is expected. This sometimes means you are trying to use a variable in CSS like this: `color: {my_color}` but Svelte doesn't support that. You can use inline CSS variables for that `<div style:--color={my_color}></div>` and then use the variable as usual in CSS with `color: var(--color)`.",
		);
	});

	it('should error in case the passed in version is different from 4 or 5', async () => {
		const content = await autofixer_tool_call(`whatever`, true, 3);

		expect(content.content).toBeDefined();
		expect(content.content[0]).toBeDefined();
		expect(content.content[0].text).toContain(
			'The desired_svelte_version MUST be either 4 or 5 but received "3"',
		);
	});

	it('should read file content from path when stdio context is true', async () => {
		const tmp_file = join(tmpdir(), `svelte-autofixer-test-${Date.now()}.svelte`);
		const file_content = `<script>
			$state count = 0;
		</script>`;

		writeFileSync(tmp_file, file_content, 'utf-8');

		try {
			// with stdio: true, the file is read from disk and parsed, producing issues
			const content = await autofixer_tool_call(tmp_file, false, 5, false, { stdio: true });
			expect(content.issues.length).toBeGreaterThan(0);
			expect(content.suggestions.length).toBeGreaterThan(0);
		} finally {
			unlinkSync(tmp_file);
		}
	});

	it('should treat file path as code when stdio context is not set', async () => {
		const tmp_file = join(tmpdir(), `svelte-autofixer-test-${Date.now()}.svelte`);
		const file_content = `<script>
			$state count = 0;
		</script>`;

		writeFileSync(tmp_file, file_content, 'utf-8');

		try {
			// without stdio context, the path string is treated as raw code (plain text), no issues
			const content = await autofixer_tool_call(tmp_file, false, 5, false);
			expect(content.issues).toHaveLength(0);
			expect(content.suggestions).toHaveLength(0);
		} finally {
			unlinkSync(tmp_file);
		}
	});
});
