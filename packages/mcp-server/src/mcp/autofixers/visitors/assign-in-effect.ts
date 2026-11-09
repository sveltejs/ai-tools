import type {
	AssignmentExpression,
	CallExpression,
	Identifier,
	Node,
	UpdateExpression,
} from 'estree';
import type { Autofixer, AutofixerState } from './index.js';
import { left_most_id } from '../ast/utils.js';
import type { AST } from 'svelte-eslint-parser';
import type { Context } from 'zimmerframe';

/**
 * Global functions that can't reassign a stateful variable when they are invoked
 */
const harmless_globals = new Set([
	'setTimeout',
	'clearTimeout',
	'setInterval',
	'clearInterval',
	'requestAnimationFrame',
	'cancelAnimationFrame',
	'queueMicrotask',
]);

/**
 * Global objects whose methods can't reassign a stateful variable when they are invoked
 */
const harmless_global_objects = new Set(['console']);

/**
 * Functions exported from `svelte` that can't reassign a stateful variable when they are invoked
 */
const harmless_svelte_imports = new Set(['untrack', 'tick']);

function is_global(id: Identifier, state: AutofixerState) {
	const reference = state.parsed.find_reference_by_id(id);
	if (!reference) return false;
	return !reference.resolved || reference.resolved.defs.length === 0;
}

/**
 * Returns the name of the export if `id` references an import from `svelte`
 */
function get_svelte_import_name(id: Identifier, state: AutofixerState) {
	const definition = state.parsed.find_reference_by_id(id)?.resolved?.defs[0];
	if (
		definition?.type !== 'ImportBinding' ||
		definition.parent.source.value !== 'svelte' ||
		definition.node.type !== 'ImportSpecifier'
	) {
		return null;
	}
	const imported = definition.node.imported;
	return imported.type === 'Identifier' ? imported.name : String(imported.value);
}

function is_harmless_call(node: CallExpression, state: AutofixerState) {
	const { callee } = node;
	if (callee.type === 'Identifier') {
		if (harmless_globals.has(callee.name) && is_global(callee, state)) return true;
		const svelte_import = get_svelte_import_name(callee, state);
		return svelte_import !== null && harmless_svelte_imports.has(svelte_import);
	}
	return (
		callee.type === 'MemberExpression' &&
		callee.object.type === 'Identifier' &&
		harmless_global_objects.has(callee.object.name) &&
		is_global(callee.object, state)
	);
}

function is_function(node: Node | AST.SvelteNode) {
	return (
		node.type === 'ArrowFunctionExpression' ||
		node.type === 'FunctionExpression' ||
		node.type === 'FunctionDeclaration'
	);
}

/**
 * Runs `to_run` if the current node is executed synchronously by an `$effect`. The search stops at the
 * first function boundary because we can't know when a nested function is invoked (e.g. a `setTimeout`
 * callback or the teardown function run later), except for the callback of `untrack` that is invoked
 * synchronously.
 */
function run_if_in_effect(
	path: (Node | AST.SvelteNode)[],
	state: AutofixerState,
	to_run: () => void,
) {
	for (let i = path.length - 1; i >= 0; i--) {
		const node = path[i];
		if (!node || !is_function(node)) continue;
		const parent = path[i - 1];
		if (parent?.type === 'CallExpression' && parent.arguments[0] === node) {
			if (state.parsed.is_rune(parent, ['$effect', '$effect.pre'])) {
				to_run();
				return;
			}
			if (
				parent.callee.type === 'Identifier' &&
				get_svelte_import_name(parent.callee, state) === 'untrack'
			) {
				continue;
			}
		}
		return;
	}
}

function assign_or_update_visitor(
	node: UpdateExpression | AssignmentExpression,
	{ state, path, next }: Context<Node | AST.SvelteNode, AutofixerState>,
) {
	run_if_in_effect(path, state, () => {
		function check_if_stateful_id(id: Identifier) {
			const reference = state.parsed.find_reference_by_id(id);
			const definition = reference?.resolved?.defs[0];
			if (definition && definition.type === 'Variable') {
				const init = definition.node.init;
				if (
					init?.type === 'CallExpression' &&
					state.parsed.is_rune(init, ['$state', '$state.raw', '$derived', '$derived.by'])
				) {
					state.output.suggestions.push(
						`The stateful variable "${id.name}" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.`,
					);
				}
			}
		}
		const variable = node.type === 'UpdateExpression' ? node.argument : node.left;

		if (variable.type === 'Identifier') {
			check_if_stateful_id(variable);
		} else if (variable.type === 'MemberExpression') {
			const object = left_most_id(variable);
			if (object) {
				check_if_stateful_id(object);
			}
		}
	});
	next();
}

function call_expression_visitor(
	node: CallExpression,
	{ state, path, next }: Context<Node | AST.SvelteNode, AutofixerState>,
) {
	run_if_in_effect(path, state, () => {
		if (is_harmless_call(node, state)) return;
		const function_name =
			node.callee.type === 'Identifier' ? `the function \`${node.callee.name}\`` : 'a function';
		state.output.suggestions.push(
			`You are calling ${function_name} inside an $effect. Please check if the function is reassigning a stateful variable because that's considered malpractice and check if it could use  \`$derived\` instead. Ignore this suggestion if you are sure this function is not assigning any stateful variable or if you can't check if it does.`,
		);
	});
	next();
}

export const assign_in_effect: Autofixer = {
	UpdateExpression: assign_or_update_visitor,
	AssignmentExpression: assign_or_update_visitor,
	CallExpression: call_expression_visitor,
};
