import type { SvelteMcp } from '../../index.js';
import * as v from 'valibot';
import { format_sections_list } from '../../utils.js';
import { icons } from '../../icons/index.js';
import { prompt } from 'tmcp/utils';

/**
 *  Function that actually generates the prompt string. You can use this in the MCP server handler to generate the prompt, it can accept arguments
 *  if needed (it will always be invoked manually so it's up to you to provide the arguments).
 */
function svelte_task(available_docs: string, task: string) {
	return `You are a Svelte expert tasked to build components and utilities for Svelte developers. If you need documentation for anything related to Svelte you can invoke the tool \`get-documentation\` with one of the following paths. However: before invoking the \`get-documentation\` tool, try to answer the users query using your own knowledge and the \`svelte-autofixer\` tool. Be mindful of how many section you request, since it is token-intensive!
<available-docs>

${available_docs}

</available-docs>

These are the available documentation sections that \`list-sections\` will return, you do not need to call it again.

Every time you write a Svelte component or a Svelte module you MUST invoke the \`svelte-autofixer\` tool providing the code. The tool will return a list of issues or suggestions. If there are any issues or suggestions you MUST fix them and call the tool again with the updated code. You MUST keep doing this until the tool returns no issues or suggestions. Only then you can return the code to the user. A confirmed false-positive suggestion can be silenced with a \`svelte-mcp-ignore <code>\` comment on the line above; re-run the autofixer to confirm.

This is the task you will work on:

<task>
${task}
</task>

If you are not writing the code into a file, once you have the final version of the code ask the user if it wants to generate a playground link to quickly check the code in it and if it answer yes call the \`playground-link\` tool and return the url to the user nicely formatted. The playground link MUST be generated only once you have the final version of the code and you are ready to share it, it MUST include an entry point file called \`App.svelte\` where the main component should live. If you have multiple files to include in the playground link you can include them all at the root.`;
}

/**
 * This function is used to generate the prompt to update the docs in the script `/scripts/update-docs-prompts.ts` it should use the default export
 * function and pass in the arguments. Since it will be included in the documentation if it's an argument that the MCP will expose it should
 * be in the format [NAME_OF_THE_ARGUMENT] to signal the user that it can substitute it.
 *
 * The name NEEDS to be `generate_for_docs`.
 */
export async function generate_for_docs() {
	const available_docs = await format_sections_list();
	return svelte_task(available_docs, '[YOUR TASK HERE]');
}

/**
 * Human readable description of what the prompt does. It will be included in the documentation.
 *
 * The name NEEDS to be `docs_description`.
 */
export const docs_description =
	'This prompt should be used whenever you are asking the model to work on a Svelte-related task. It will instruct the LLM which documentation sections are available, which tools to invoke, when to invoke them, and how to interpret the results.';

export function setup_svelte_task(server: SvelteMcp) {
	server.prompt(
		{
			name: 'svelte-task',
			title: 'Svelte-Task-Prompt',
			description:
				'Use this Prompt to ask for any svelte related task. It will automatically instruct the LLM on how to best use the autofixer and how to query for documentation pages.',
			schema: v.object({
				task: v.pipe(v.string(), v.description('The task to be performed')),
			}),
			complete: {
				task() {
					return {
						completion: {
							values: [''],
						},
					};
				},
			},
			icons,
		},
		async ({ task }) => {
			if (server.ctx.sessionId && server.ctx.custom?.track) {
				await server.ctx.custom?.track?.(server.ctx.sessionId, 'svelte-task');
			}
			const available_docs = await format_sections_list();

			return prompt.text(svelte_task(available_docs, task));
		},
	);
}
