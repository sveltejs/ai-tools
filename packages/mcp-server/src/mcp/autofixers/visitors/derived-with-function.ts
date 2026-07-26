import type { Identifier, PrivateIdentifier } from 'estree';
import type { Autofixer } from './index.js';
import { IGNORE_CODES, push_suggestion } from '../ignore-directives.js';

export const derived_with_function: Autofixer = {
	CallExpression(node, { state, path }) {
		if (
			node.callee.type === 'Identifier' &&
			node.callee.name === '$derived' &&
			state.parsed.is_rune(node, ['$derived']) &&
			(node.arguments[0]?.type === 'ArrowFunctionExpression' ||
				node.arguments[0]?.type === 'FunctionExpression')
		) {
			const parent = path[path.length - 1];
			let variable_id: Identifier | PrivateIdentifier | undefined;
			if (parent?.type === 'VariableDeclarator' && parent.id.type === 'Identifier') {
				// const something = $derived(...)
				variable_id = parent.id;
			} else if (parent?.type === 'PropertyDefinition') {
				// class X { something = $derived(...) }
				variable_id =
					parent.key.type === 'Identifier'
						? parent.key
						: parent.key.type === 'PrivateIdentifier'
							? parent.key
							: undefined;
			} else if (parent?.type === 'AssignmentExpression') {
				// this.something = $derived(...)
				variable_id =
					parent.left.type === 'MemberExpression'
						? parent.left.property.type === 'Identifier'
							? parent.left.property
							: undefined
						: undefined;
			}

			push_suggestion(
				state.output,
				state.ignore_registry,
				IGNORE_CODES.DERIVED_WITH_FUNCTION,
				node.loc?.start?.line,
				`You are passing a function to $derived ${variable_id ? `when declaring "${variable_id.name}" ` : ''}but $derived expects an expression. You can use $derived.by instead.`,
			);
		}
	},
};
