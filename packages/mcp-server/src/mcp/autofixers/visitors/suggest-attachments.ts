import type { Identifier } from 'estree';
import type { Autofixer } from './index.js';
import { left_most_id } from '../ast/utils.js';

export const suggest_attachments: Autofixer = {
	SvelteDirective(node, { state, next, path }) {
		if (node.kind === 'Binding' && node.key.name.name === 'this') {
			const parent_element = path.findLast((p) => p.type === 'SvelteElement');
			if (parent_element?.kind === 'html' && parent_element.startTag.attributes.includes(node)) {
				let better_an_attachment = ` or even better an \`attachment\``;
				if (state.desired_svelte_version.major === 4) {
					better_an_attachment = ``;
				}
				state.output.suggestions.push(
					`The usage of \`bind:this\` can often be replaced with an easier to read \`action\`${better_an_attachment}. Consider using the latter if possible.`,
				);
			}
		} else if (node.kind === 'Action' && state.desired_svelte_version.major === 5) {
			let id: Identifier | null = null;
			if (node.key.name.type === 'Identifier') {
				id = node.key.name;
			} else if (node.key.name.type === 'MemberExpression') {
				id = left_most_id(node.key.name);
			}
			if (id) {
				const reference = state.parsed.find_reference_by_id(id);
				const definition = reference?.resolved?.defs[0];
				if (
					definition &&
					(definition.type === 'Variable' ||
						!(definition.type === 'ImportBinding' || definition.type === 'Parameter')) &&
					!(
						definition.type === 'Variable' &&
						definition.node.init?.type === 'CallExpression' &&
						state.parsed.is_rune(definition.node.init, ['$props'])
					)
				) {
					state.output.suggestions.push(
						`Consider using an \`attachment\` instead of an \`action\` for "${id.name}".`,
					);
				}
			}
		}
		next();
	},
};
