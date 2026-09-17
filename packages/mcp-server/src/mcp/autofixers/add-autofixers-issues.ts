import { parse } from '../../parse/parse.js';
import { walk } from '../../mcp/autofixers/ast/walk.js';
import type { Node } from 'estree';
import * as autofixers from './visitors/index.js';
import type { SemVer } from 'verkit';

export function add_autofixers_issues(
	content: { issues: string[]; suggestions: string[] },
	code: string,
	desired_svelte_version: SemVer,
	filename = 'Component.svelte',
	async = false,
) {
	const parsed = parse(code, filename);

	// Run each autofixer separately to avoid interrupting logic flow
	for (const autofixer of Object.values(autofixers)) {
		walk(
			parsed.ast as unknown as Node,
			{ output: content, parsed, desired_svelte_version, async },
			autofixer,
		);
	}
}
