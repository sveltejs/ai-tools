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
import { IGNORE_CODES, push_suggestion } from '../ignore-directives.js';

function run_if_in_effect(
	path: (Node | AST.SvelteNode)[],
	state: AutofixerState,
	to_run: () => void,
) {
	const in_effect = path.findLast(
		(node) =>
			node.type === 'CallExpression' && state.parsed.is_rune(node, ['$effect', '$effect.pre']),
	);

	if (in_effect) {
		to_run();
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
					push_suggestion(
						state.output,
						state.ignore_registry,
						IGNORE_CODES.EFFECT_ASSIGNS_STATE,
						node.loc?.start?.line,
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
		const function_name =
			node.callee.type === 'Identifier' ? `the function \`${node.callee.name}\`` : 'a function';
		push_suggestion(
			state.output,
			state.ignore_registry,
			IGNORE_CODES.EFFECT_CALLS_FUNCTION,
			node.loc?.start?.line,
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
