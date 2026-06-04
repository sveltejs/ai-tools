import ts_parser from '@typescript-eslint/parser';
import type * as eslint from 'eslint';
import type { CallExpression, Identifier } from 'estree';
import { parseForESLint as svelte_eslint_parse } from 'svelte-eslint-parser';
import { runes } from '../constants.js';

type Scope = eslint.Scope.Scope;
type ScopeManager = eslint.Scope.ScopeManager;

function collect_scopes(scope: Scope, acc: Scope[] = []) {
	acc.push(scope);
	for (const child of scope.childScopes ?? []) collect_scopes(child, acc);
	return acc;
}

export type ParseResult = ReturnType<typeof parse>;

export function parse(code: string, file_path: string) {
	const parsed = svelte_eslint_parse(code, {
		filePath: file_path,
		parser: { ts: ts_parser, typescript: ts_parser },
	});
	let all_scopes: Scope[] | undefined;
	let all_variables: eslint.Scope.Variable[] | undefined;
	let all_references: eslint.Scope.Reference[] | undefined;

	function get_all_scopes() {
		if (!all_scopes) {
			all_scopes = collect_scopes(parsed.scopeManager!.globalScope!);
		}
		return all_scopes;
	}
	// walking the ast will also walk all the tokens if we don't remove them so we return them separately
	// we also remove the parent which as a circular reference to the ast itself (and it's not needed since we use zimmerframe to walk the ast)
	const {
		ast: { tokens, ...ast },
	} = parsed;

	// @ts-expect-error we also have to delete it from the object or the circular reference remains
	delete parsed.ast.tokens;

	return {
		ast,
		tokens,
		scope_manager: parsed.scopeManager as ScopeManager,
		visitor_keys: parsed.visitorKeys,
		get all_scopes() {
			return get_all_scopes();
		},
		get all_variables() {
			if (!all_variables) {
				all_variables = get_all_scopes().flatMap((s) => s.variables ?? []);
			}
			return all_variables;
		},
		get all_references() {
			if (!all_references) {
				all_references = get_all_scopes().flatMap((s) => s.references ?? []);
			}
			return all_references;
		},
		find_reference_by_id(id: Identifier) {
			return this.all_references.find((r) => r.identifier === id);
		},
		is_rune(call: CallExpression, rune?: (typeof runes)[number][]) {
			// it should always be a call expression but we check just in case because sometimes it's any and TS doesn't complain
			if (call.type !== 'CallExpression') return false;
			if (call.callee.type !== 'Identifier' && call.callee.type !== 'MemberExpression')
				return false;
			const id = call.callee.type === 'Identifier' ? call.callee : call.callee.object;
			if (id.type !== 'Identifier') return false;
			const property = call.callee.type === 'MemberExpression' ? call.callee.property : null;

			const callee_text = `${id.name}${property && property.type === 'Identifier' ? `.${property.name}` : ''}`;
			if (rune && !rune.includes(callee_text as never)) return false;
			if (!rune && !runes.includes(callee_text as never)) return false;

			const reference = this.find_reference_by_id(id);
			if (!reference) return false;
			const variable = reference.resolved;
			if (!variable) return false;
			return variable.defs.length === 0;
		},
	};
}
