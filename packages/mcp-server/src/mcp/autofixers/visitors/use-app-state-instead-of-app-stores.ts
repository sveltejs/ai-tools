import type { Autofixer } from './index.js';

export const use_app_state_instead_of_app_stores: Autofixer = {
	ImportDeclaration(node, { state, next }) {
		const source = (node.source.value || node.source.raw?.slice(1, -1))?.toString();
		if (source && source === '$app/stores' && state.desired_svelte_version === 5) {
			for (const specifier of node.specifiers) {
				if (
					specifier.type === 'ImportSpecifier' &&
					specifier.imported.type === 'Identifier' &&
					['page', 'navigating', 'updated'].includes(specifier.imported.name)
				) {
					state.output.suggestions.push(
						`You are importing "${specifier.imported.name}" from "$app/stores". This module is deprecated, consider importing "${specifier.imported.name}" from "$app/state" instead (requires SvelteKit 2.12 or later) and reading it as a normal object without the "$" prefix.`,
					);
				}
			}
		}
		next();
	},
};
