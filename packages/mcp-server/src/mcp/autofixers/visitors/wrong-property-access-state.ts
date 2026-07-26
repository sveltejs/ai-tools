import type { Autofixer } from './index.js';
import { left_most_id } from '../ast/utils.js';
import { IGNORE_CODES, push_suggestion } from '../ignore-directives.js';

const UPDATE_PROPERTIES = new Set(['set', 'update', '$']);
const METHODS = new Set(['set', 'update']);

export const wrong_property_access_state: Autofixer = {
	MemberExpression(node, { state, next, path }) {
		const parent = path[path.length - 1];
		let is_property = false;
		if (
			node.property.type === 'Identifier' &&
			((is_property = !METHODS.has(node.property.name)) ||
				(parent?.type === 'CallExpression' && parent.callee === node)) &&
			UPDATE_PROPERTIES.has(node.property.name)
		) {
			const id = left_most_id(node);
			if (id) {
				const reference = state.parsed.find_reference_by_id(id);
				const definition = reference?.resolved?.defs[0];
				if (definition && definition.type === 'Variable') {
					const init = definition.node.init;
					if (
						init?.type === 'CallExpression' &&
						state.parsed.is_rune(init, ['$state', '$state.raw', '$derived', '$derived.by'])
					) {
						let suggestion = is_property
							? `You are trying to read the stateful variable "${id.name}" using "${node.property.name}". stateful variables should be read just by accessing them like normal variable, do not use properties to read them.`
							: `You are trying to update the stateful variable "${id.name}" using "${node.property.name}". stateful variables should be updated with a normal assignment/mutation, do not use methods to update them.`;
						const argument = init.arguments[0];
						if (!argument || (argument.type !== 'Literal' && argument.type !== 'ArrayExpression')) {
							suggestion += ` However I can't verify if "${id.name}" is a state variable of an object or a class with a "${node.property.name}" ${is_property ? 'property' : 'method'} on it. Please verify that before updating the code to use a normal ${is_property ? 'access' : 'assignment'}`;
						}
						push_suggestion(
							state.output,
							state.ignore_registry,
							IGNORE_CODES.WRONG_PROPERTY_ACCESS_STATE,
							node.loc?.start?.line,
							suggestion,
						);
					}
				}
			}
		}
		next();
	},
};
