import type { Node } from 'estree';
import type { AST } from 'svelte-eslint-parser';
import type { Visitors } from 'zimmerframe';
import type { ParseResult } from '../../../parse/parse.js';
import type { IgnoreRegistry } from '../ignore-directives.js';

export type AutofixerState = {
	output: { issues: string[]; suggestions: string[] };
	parsed: ParseResult;
	desired_svelte_version: number;
	async?: boolean;
	/**
	 * Per-file map of `svelte-mcp-ignore` directives that
	 * suppress suggestions on the line they target. Visitors
	 * should route their `state.output.suggestions.push(...)`
	 * calls through `push_suggestion` from
	 * `../ignore-directives.js` so the suppression check
	 * happens in one place.
	 */
	ignore_registry: IgnoreRegistry;
};

export type Autofixer = Visitors<Node | AST.SvelteNode, AutofixerState>;

export * from './assign-in-effect.js';
export * from './wrong-property-access-state.js';
export * from './imported-runes.js';
export * from './derived-with-function.js';
export * from './use-runes-instead-of-store.js';
export * from './suggest-attachments.js';
export * from './read-state-with-dollar.js';
