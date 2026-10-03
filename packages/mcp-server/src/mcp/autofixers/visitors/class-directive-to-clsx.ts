import type { AST } from 'svelte-eslint-parser';
import type { Autofixer } from './index.js';
import { isGreaterOrEqual } from 'verkit';

const valid_identifier = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Returns the source text of a node using its range
 */
function source_of(code: string, node: { range?: [number, number] | undefined }) {
	if (!node.range) return null;
	return code.slice(node.range[0], node.range[1]);
}

/**
 * Converts a `class:` directive into an object property for the `class` attribute
 * (`class:cool` -> `cool`, `class:lame={!cool}` -> `lame: !cool`)
 */
function directive_to_property(code: string, directive: AST.SvelteClassDirective) {
	const name = directive.key.name.name;
	const key = valid_identifier.test(name) ? name : `'${name}'`;
	if (
		directive.shorthand ||
		!directive.expression ||
		(directive.expression.type === 'Identifier' && directive.expression.name === name)
	) {
		return key;
	}
	const expression = source_of(code, directive.expression) ?? name;
	return `${key}: ${expression}`;
}

/**
 * Converts the value of an existing `class` attribute into a javascript expression
 * (`class="foo"` -> `'foo'`, `class={bar}` -> `bar`, `class="foo {bar}"` -> `` `foo ${bar}` ``)
 */
function class_attribute_to_expression(code: string, attribute: AST.SvelteAttribute) {
	const parts = attribute.value;
	if (parts.length === 1 && parts[0]?.type === 'SvelteMustacheTag') {
		return source_of(code, parts[0].expression);
	}
	if (parts.every((part) => part.type === 'SvelteLiteral')) {
		return `'${parts.map((part) => part.value).join('')}'`;
	}
	let template = '`';
	for (const part of parts) {
		if (part.type === 'SvelteLiteral') {
			template += part.value;
		} else if (part.type === 'SvelteMustacheTag') {
			template += `\${${source_of(code, part.expression) ?? ''}}`;
		}
	}
	return template + '`';
}

export const class_directive_to_clsx: Autofixer = {
	SvelteElement(node, { state, next }) {
		// objects and arrays in the `class` attribute are only supported since svelte 5.16
		if (!isGreaterOrEqual(state.desired_svelte_version, '5.16.0') || node.kind !== 'html') {
			next();
			return;
		}

		const directives = node.startTag.attributes.filter(
			(attribute): attribute is AST.SvelteClassDirective =>
				attribute.type === 'SvelteDirective' && attribute.kind === 'Class',
		);

		if (directives.length > 0) {
			const code = state.parsed.code;
			const class_attribute = node.startTag.attributes.find(
				(attribute): attribute is AST.SvelteAttribute =>
					attribute.type === 'SvelteAttribute' && attribute.key.name === 'class',
			);

			const object = `{ ${directives.map((directive) => directive_to_property(code, directive)).join(', ')} }`;
			const existing = class_attribute
				? class_attribute_to_expression(code, class_attribute)
				: null;
			const value = existing ? `[${existing}, ${object}]` : object;
			const names = directives.map((directive) => `"${directive.key.name.name}"`).join(', ');
			const element_name = node.name.type === 'SvelteName' ? node.name.name : 'html';

			state.output.suggestions.push(
				`Consider using the \`class\` attribute instead of the \`class:\` directive for ${names} on the \`${element_name}\` element, e.g. \`class={${value}}\`.`,
			);
		}

		next();
	},
};
