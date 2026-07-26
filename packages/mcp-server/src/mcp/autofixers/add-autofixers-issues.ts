import { parse } from '../../parse/parse.js';
import { walk } from '../../mcp/autofixers/ast/walk.js';
import type { Node } from 'estree';
import * as autofixers from './visitors/index.js';
import { gather_ignore_directives, report_unused_directives } from './ignore-directives.js';

export function add_autofixers_issues(
	content: { issues: string[]; suggestions: string[] },
	code: string,
	desired_svelte_version: number,
	filename = 'Component.svelte',
	async = false,
) {
	const parsed = parse(code, filename);
	const ignore_registry = gather_ignore_directives(parsed);

	// Run each autofixer separately to avoid interrupting logic flow
	for (const autofixer of Object.values(autofixers)) {
		walk(
			parsed.ast as unknown as Node,
			{ output: content, parsed, desired_svelte_version, async, ignore_registry },
			autofixer,
		);
	}

	// Surface any `svelte-mcp-ignore` directive that listed a
	// code which never matched — same shape as ESLint's
	// `no-unused-svelte-ignore` rule. Diagnoses both stale
	// comments left over from a refactor and typos in the
	// code name itself.
	report_unused_directives(content, ignore_registry);
}
