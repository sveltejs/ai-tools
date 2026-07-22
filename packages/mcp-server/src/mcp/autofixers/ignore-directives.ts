/**
 * Per-suggestion suppression for the MCP autofixer.
 *
 * The compiler and ESLint passes already have first-class
 * ignore mechanisms (`<!-- svelte-ignore <code> -->` and
 * `// eslint-disable-next-line <rule>` respectively). The
 * custom-visitor pass that this module guards is the third
 * source — `add-autofixers-issues.ts` plus everything under
 * `visitors/` — and it had no ignore protocol at all. This
 * module adds one.
 *
 * Comment syntax (mirrors `svelte-ignore`):
 *
 *     <!-- svelte-mcp-ignore <code1> <code2> ... -->
 *     // svelte-mcp-ignore <code1> <code2> ...
 *     /* svelte-mcp-ignore <code1> <code2> ... *\/
 *
 * Scope: a directive on line N suppresses the listed codes
 * for every suggestion whose triggering AST node *starts* on
 * line N+1. That mirrors what `svelte-ignore` does for
 * compiler warnings and keeps the implementation tractable —
 * the parser hands us `loc.start.line` on every node, so a
 * per-line lookup is `O(1)`.
 *
 * Each suggestion that this module guards is identified by a
 * **stable code** — the keys are documented in
 * `IGNORE_CODES`. Code names are lowercase snake_case so they
 * read naturally in a comment.
 *
 * Unused-directive reporting: if a directive lists a code but
 * no matching suggestion fires on the next line, we surface
 * that as a suggestion of its own (same shape as ESLint's
 * `no-unused-svelte-ignore`). Discourages stale comments
 * lingering after a refactor.
 */

import type { ParseResult } from '../../parse/parse.js';

/** Stable codes every guarded visitor pushes through. */
export const IGNORE_CODES = {
	/** `assign-in-effect.ts` — function call inside an `$effect` body. */
	EFFECT_CALLS_FUNCTION: 'effect_calls_function',
	/** `assign-in-effect.ts` — stateful variable assigned inside an `$effect` body. */
	EFFECT_ASSIGNS_STATE: 'effect_assigns_state',
	/** `suggest-attachments.ts` — `bind:this` on a host element could be an attachment. */
	BIND_THIS_ATTACHMENT: 'bind_this_attachment',
	/** `suggest-attachments.ts` — `use:` action could be an attachment. */
	USE_ACTION_ATTACHMENT: 'use_action_attachment',
	/** `derived-with-function.ts` — `$derived(() => …)` should be `$derived.by`. */
	DERIVED_WITH_FUNCTION: 'derived_with_function',
	/** `imported-runes.ts` — runes imported from the Svelte package. */
	IMPORTED_RUNES: 'imported_runes',
	/** `use-runes-instead-of-store.ts` — `derived` / `writable` / `readable` from `svelte/store`. */
	RUNES_INSTEAD_OF_STORE: 'runes_instead_of_store',
	/** `wrong-property-access-state.ts` — `state.set()` / `state.$` access on stateful variables. */
	WRONG_PROPERTY_ACCESS_STATE: 'wrong_property_access_state',
} as const;

export type IgnoreCode = (typeof IGNORE_CODES)[keyof typeof IGNORE_CODES];

const ALL_CODES: ReadonlySet<string> = new Set(Object.values(IGNORE_CODES));

const DIRECTIVE_KEYWORD = 'svelte-mcp-ignore';

/**
 * One directive collected from a single comment. `codes` is
 * intentionally a `Set<string>` (not `Set<IgnoreCode>`) so
 * typos by the user surface as unused-directive diagnostics
 * rather than being silently dropped at parse time.
 */
type DirectiveEntry = {
	codes: Set<string>;
	used: Set<string>;
	source_line: number;
};

export type IgnoreRegistry = ReturnType<typeof build_registry>;

function build_registry(parsed: ParseResult): {
	/** Suppress `code` for any suggestion whose triggering node starts on `line`. */
	is_ignored(line: number, code: string): boolean;
	/** Collect every directive code that was declared but never matched. */
	unused_directives(): Array<{ line: number; codes: string[] }>;
} {
	/**
	 * `directives_by_target_line[N] = entry` means "an
	 * `svelte-mcp-ignore` comment on line N-1 suppresses
	 * `entry.codes` for any node on line N". `entry.used`
	 * tracks the subset that actually matched, so we can
	 * report the unused remainder.
	 */
	const directives_by_target_line = new Map<number, DirectiveEntry>();

	function consider(comment_value: string, source_line: number) {
		const codes = parse_directive(comment_value);
		if (!codes) {
			return;
		}
		const target_line = source_line + 1;
		const existing = directives_by_target_line.get(target_line);
		if (existing) {
			for (const code of codes) {
				existing.codes.add(code);
			}
			return;
		}
		directives_by_target_line.set(target_line, {
			codes: new Set(codes),
			used: new Set(),
			source_line,
		});
	}

	// Script comments — both `// …` and `/* … */` land here
	// because `svelte-eslint-parser` runs the underlying JS
	// parser with `comment: true`.
	for (const comment of parsed.ast.comments ?? []) {
		const value = comment.value ?? '';
		const start_line = comment.loc?.start?.line;
		if (typeof start_line !== 'number') {
			continue;
		}
		consider(value, start_line);
	}

	// Markup comments are top-level AST nodes (`SvelteHTMLComment`),
	// not entries in `ast.comments`. We walk the body once and
	// pull the directive shape from each one's text.
	for (const node of parsed.ast.body ?? []) {
		if ((node as { type?: string }).type !== 'SvelteHTMLComment') {
			continue;
		}
		const value = (node as { value?: string }).value ?? '';
		const start_line = (node as { loc?: { start?: { line?: number } } }).loc?.start?.line;
		if (typeof start_line !== 'number') {
			continue;
		}
		consider(value, start_line);
	}

	return {
		is_ignored(line, code) {
			const entry = directives_by_target_line.get(line);
			if (!entry) {
				return false;
			}
			if (entry.codes.has(code)) {
				entry.used.add(code);
				return true;
			}
			return false;
		},
		unused_directives() {
			const out: Array<{ line: number; codes: string[] }> = [];
			for (const entry of directives_by_target_line.values()) {
				const unused = [...entry.codes].filter((c) => !entry.used.has(c));
				if (unused.length > 0) {
					out.push({ line: entry.source_line, codes: unused });
				}
			}
			return out;
		},
	};
}

export function gather_ignore_directives(parsed: ParseResult): IgnoreRegistry {
	return build_registry(parsed);
}

/**
 * Pull `code1 code2 …` out of a directive comment body. Returns
 * `null` for non-directive comments (the common case) so the
 * scan stays cheap.
 *
 * Whitespace handling matches `svelte-ignore` — any amount of
 * leading whitespace before the keyword, and any whitespace
 * separator between codes. We deliberately don't accept commas
 * as separators because the upstream `svelte-ignore` parser
 * doesn't either and we want the two surfaces to feel the same.
 */
function parse_directive(raw: string): string[] | null {
	const trimmed = raw.trim();
	if (!trimmed.startsWith(DIRECTIVE_KEYWORD)) {
		return null;
	}
	const rest = trimmed.slice(DIRECTIVE_KEYWORD.length).trim();
	if (rest.length === 0) {
		// Bare `svelte-mcp-ignore` with no codes — accept it but
		// produce zero entries. The user typed it presumably to
		// silence everything; we surface that as "you must list
		// codes" via a synthetic unused-directive (code list is
		// the empty set, so no code is ever matched against it).
		return [];
	}
	return rest.split(/\s+/);
}

/**
 * Push `message` onto the autofixer's suggestion list unless a
 * `svelte-mcp-ignore <code>` directive on the previous line
 * suppresses it. Visitors call this instead of
 * `state.output.suggestions.push(...)` directly so the
 * suppression check happens in one place.
 *
 * `target_line` is the line the suggestion's triggering AST
 * node lives on. Visitors pass `node.loc?.start?.line` from
 * whatever node tripped the check — typically the offending
 * call/import/directive itself.
 *
 * The emitted message carries the code as a trailing
 * `[<code>]` marker so an LLM consumer can read the
 * suggestion and write the matching `svelte-mcp-ignore`
 * directive without consulting any external docs surface.
 */
export function push_suggestion(
	output: { suggestions: string[] },
	registry: IgnoreRegistry,
	code: IgnoreCode,
	target_line: number | null | undefined,
	message: string,
): void {
	if (typeof target_line === 'number' && registry.is_ignored(target_line, code)) {
		return;
	}
	output.suggestions.push(`${message} [${code}]`);
}

/**
 * After every visitor has run, surface any directive that
 * declared a code which never matched. The diagnostic is a
 * suggestion (not an issue) because the underlying intent is
 * "your comment is stale" — same severity as the suggestion
 * the comment was trying to silence.
 *
 * Unknown codes (typos, codes referring to other tools) are
 * reported with a hint so the user knows the difference
 * between "you wrote `effect_call_function`" and "you wrote
 * `effect_calls_function` but the next line doesn't trigger
 * that check anymore".
 */
export function report_unused_directives(
	output: { suggestions: string[] },
	registry: IgnoreRegistry,
): void {
	for (const { line, codes } of registry.unused_directives()) {
		for (const code of codes) {
			if (!ALL_CODES.has(code)) {
				output.suggestions.push(
					`Unknown \`svelte-mcp-ignore\` code "${code}" at line ${line}. Known codes: ${[...ALL_CODES].sort().join(', ')}.`,
				);
				continue;
			}
			output.suggestions.push(
				`Unused \`svelte-mcp-ignore\` directive for code "${code}" at line ${line} — no matching suggestion was emitted for that location.`,
			);
		}
	}
}
