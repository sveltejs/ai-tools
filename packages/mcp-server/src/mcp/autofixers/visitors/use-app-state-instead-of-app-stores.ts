import type { Autofixer } from './index.js';

export const use_app_state_instead_of_app_stores: Autofixer = {
	ImportDeclaration(node, { state, next }) {
		if (state.desired_svelte_version !== 5) {
			next();
			return;
		}
		const source = (node.source.value || node.source.raw?.slice(1, -1))?.toString();
		if (source === '$app/stores') {
			for (const specifier of node.specifiers) {
				if (specifier.type !== 'ImportSpecifier' || specifier.imported.type !== 'Identifier') {
					continue;
				}
				const name = specifier.imported.name;
				if (['page', 'navigating', 'updated'].includes(name)) {
					state.output.suggestions.push(
						`You are importing "${name}" from "$app/stores". This module is deprecated, consider importing "${name}" from "$app/state" instead (requires SvelteKit 2.12 or later) and reading it as a normal object without the "$" prefix. Keep in mind that the values from "$app/state" are fine grained reactive state and not stores: only the properties you read are tracked, and changes are not picked up by legacy "$:" statements.`,
					);
				} else if (name === 'getStores') {
					state.output.suggestions.push(
						`You are importing "getStores" from "$app/stores" which will be deprecated in the future, consider using the stateful variables ("page", "navigating" and "updated") from "$app/state" instead (requires SvelteKit 2.12 or later).`,
					);
				}
			}
		}
		next();
	},
};
