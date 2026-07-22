import { basename } from 'node:path';
import { tool } from 'tmcp/utils';
import * as v from 'valibot';
import { add_autofixers_issues } from '../../autofixers/add-autofixers-issues.js';
import { add_compile_issues } from '../../autofixers/add-compile-issues.js';
import { add_eslint_issues } from '../../autofixers/add-eslint-issues.js';
import { icons } from '../../icons/index.js';
import { type SvelteMcp } from '../../index.js';

let cached_schema: ReturnType<typeof get_autofixer_schema> | null = null;

function get_autofixer_schema(stdio: boolean) {
	let code = v.string();
	if (stdio) {
		// we only add the description if we are running in stdio, this saves a few tokens for the remote server
		code = v.pipe(
			v.string(),
			v.description(
				"The code to be processed by the autofixer. It can also be a path to a file containing the code. If the file doesn't exists the string will be treated as the code",
			),
		);
	}
	return v.object({
		code,
		desired_svelte_version: v.pipe(
			v.union([v.string(), v.number()]),
			v.description(
				'The desired major svelte version as an integer (must be 4 or 5)...if possible read this from the package.json of the user project, otherwise use some hint from the wording (if the user asks for runes it wants version 5). Default to 5 in case of doubt.',
			),
		),
		async: v.pipe(
			v.optional(v.boolean()),
			v.description(
				'If true the code is an async component/module and might use await in the markup or top-level awaits in the script tag. If possible check the svelte.config.js/svelte.config.ts to check if the option is enabled otherwise asks the user if they prefer using it or not. You can only use this option if the version is 5.',
			),
		),
		filename: v.pipe(
			v.optional(v.string()),
			v.description(
				'The filename of the component if available, it MUST be only the Component name with .svelte or .svelte.ts extension and not the entire path.',
			),
		),
	});
}

const autofixer_output_schema = v.object({
	issues: v.array(v.string()),
	suggestions: v.array(v.string()),
	require_another_tool_call_after_fixing: v.boolean(),
});

export async function svelte_autofixer_handler({
	code,
	desired_svelte_version: desired_svelte_version_unchecked,
	async,
	filename: filename_or_path,
}: v.InferInput<ReturnType<typeof get_autofixer_schema>>) {
	// we validate manually because some clients don't support union in the input schema (looking at you cursor)
	const parsed_version = v.safeParse(
		v.union([v.literal(4), v.literal(5), v.literal('4'), v.literal('5')]),
		desired_svelte_version_unchecked,
	);
	if (parsed_version.success === false) {
		throw new Error(
			`The desired_svelte_version MUST be either 4 or 5 but received "${desired_svelte_version_unchecked}"`,
		);
	}

	const desired_svelte_version = parsed_version.output;

	if (async && +desired_svelte_version < 5) {
		throw new Error('The async option can only be used with Svelte version 5 or higher.');
	}

	const content: {
		issues: string[];
		suggestions: string[];
		require_another_tool_call_after_fixing: boolean;
	} = { issues: [], suggestions: [], require_another_tool_call_after_fixing: false };
	try {
		// just in case the LLM sends a full path we extract the filename...it's not really needed
		// but it's nice to have a filename in the errors

		const filename = filename_or_path ? basename(filename_or_path) : 'Component.svelte';

		add_compile_issues(content, code, +desired_svelte_version, filename, async);

		add_autofixers_issues(content, code, +desired_svelte_version, filename, async);

		await add_eslint_issues(content, code, +desired_svelte_version, filename, async);
	} catch (e: unknown) {
		const error = e as Error & { start?: { line: number; column: number }; frame?: string };
		content.issues.push(
			`${error.message} at line ${error.start?.line}, column ${error.start?.column}`,
		);
		if (error.message.includes('js_parse_error')) {
			// Check if the error frame contains template syntax that was incorrectly placed in the script tag
			if (error.frame?.includes('{#snippet')) {
				content.suggestions.push(
					"The code can't be compiled because a Javascript parse error. The error suggests you have a `{#snippet ...}` block inside the `<script>` tag. Snippets are template syntax and should be declared in the markup section of the component, not in the script. Move the snippet outside of the `<script>` tag. Snippets declared in the markup can also be accessed in the script tag in case you need them.",
				);
			} else {
				content.suggestions.push(
					"The code can't be compiled because a Javascript parse error. In case you are using runes like this `$state variable_name = 3;` or `$derived variable_name = 3 * count` that's not how runes are used. You need to use them as function calls without importing them: `const variable_name = $state(3)` and `const variable_name = $derived(3 * count)`.",
				);
			}
		} else if (error.message.includes('css_expected_identifier')) {
			content.suggestions.push(
				"The code can't be compiled because a valid CSS identifier is expected. This sometimes means you are trying to use a variable in CSS like this: `color: {my_color}` but Svelte doesn't support that. You can use inline CSS variables for that `<div style:--color={my_color}></div>` and then use the variable as usual in CSS with `color: var(--color)`.",
			);
		}
	}

	if (content.issues.length > 0 || content.suggestions.length > 0) {
		content.require_another_tool_call_after_fixing = true;
	}
	return content;
}

export function svelte_autofixer(server: SvelteMcp) {
	server.tool(
		{
			name: 'svelte-autofixer',
			title: 'Svelte Autofixer',
			description:
				'Given a svelte component or module returns a list of suggestions to fix any issues it has. This tool MUST be used whenever the user is asking to write svelte code before sending the code back to the user. A confirmed false-positive suggestion can be silenced with a `svelte-mcp-ignore <code>` comment on the line above (script or markup).',
			get schema() {
				return (
					cached_schema ?? (cached_schema = get_autofixer_schema(server.ctx.custom?.stdio ?? false))
				);
			},
			outputSchema: autofixer_output_schema,
			annotations: {
				title: 'Svelte Autofixer',
				destructiveHint: false,
				readOnlyHint: true,
				openWorldHint: false,
			},
			icons,
		},
		async ({
			code,
			filename: filename_or_path,
			desired_svelte_version: desired_svelte_version_unchecked,
			async,
		}) => {
			if (server.ctx.sessionId && server.ctx.custom?.track) {
				await server.ctx.custom?.track?.(server.ctx.sessionId, 'svelte-autofixer');
			}

			// we only do this if we know we are running in stdio mode (only stdio pass the context as true)
			if (server.ctx.custom?.stdio) {
				const [exists_sync, read_file] = await Promise.all([
					import('node:fs').then((mod) => mod.existsSync),
					import('node:fs/promises').then((mod) => mod.readFile),
				]);
				if (exists_sync(code)) {
					code = await read_file(code, 'utf-8');
				}
			}

			try {
				const content = await svelte_autofixer_handler({
					code,
					desired_svelte_version: desired_svelte_version_unchecked,
					async,
					filename: filename_or_path,
				});
				return tool.structured(content);
			} catch (e) {
				const error = e as Error;
				if (server.ctx.sessionId && server.ctx.custom?.track) {
					await server.ctx.custom?.track?.(
						server.ctx.sessionId,
						'svelte-autofixer-error',
						error.message,
					);
				}
				return tool.error(error.message);
			}
		},
	);
}
