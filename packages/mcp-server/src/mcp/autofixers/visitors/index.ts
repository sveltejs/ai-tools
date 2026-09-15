import type { Node } from 'estree';
import type { AST } from 'svelte-eslint-parser';
import type { Visitors } from 'zimmerframe';
import type { ParseResult } from '../../../parse/parse.js';

export type AutofixerState = {
	output: { issues: string[]; suggestions: string[] };
	parsed: ParseResult;
	desired_svelte_version: number;
	async?: boolean;
};

export type Autofixer = Visitors<Node | AST.SvelteNode, AutofixerState>;

export * from './assign-in-effect.js';
export * from './wrong-property-access-state.js';
export * from './imported-runes.js';
export * from './derived-with-function.js';
export * from './use-runes-instead-of-store.js';
export * from './suggest-attachments.js';
export * from './read-state-with-dollar.js';
export * from './self-spread-state-update.js';
