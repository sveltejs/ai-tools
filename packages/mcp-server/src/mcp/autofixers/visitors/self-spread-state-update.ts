import type {
	ArrayExpression,
	AssignmentExpression,
	CallExpression,
	Identifier,
	MemberExpression,
	Node,
	ObjectExpression,
	ThisExpression,
} from 'estree';
import type { AST } from 'svelte-eslint-parser';
import type { Context } from 'zimmerframe';
import type { Autofixer, AutofixerState } from './index.js';

type Target = Identifier | MemberExpression;
type Kind = 'object' | 'array';
type Path = (Node | AST.SvelteNode)[];

/**
 * Unwraps TS-only expression wrappers (`as`, `satisfies`) so that
 * `$state({ ... } as Data)` is still recognised as an object literal.
 */
function unwrap_ts(node: Node | undefined) {
	let current = node as (Node & { expression?: Node }) | undefined;
	while (
		current &&
		(current.type === ('TSAsExpression' as never) ||
			current.type === ('TSSatisfiesExpression' as never)) &&
		current.expression
	) {
		current = current.expression as Node & { expression?: Node };
	}
	return current;
}

function literal_kind(node: Node | undefined): Kind | null {
	const unwrapped = unwrap_ts(node);
	if (unwrapped?.type === 'ObjectExpression') return 'object';
	if (unwrapped?.type === 'ArrayExpression') return 'array';
	return null;
}

/**
 * Returns the textual representation of a target (`data`, `data.inner`, `this.x`, `items[0]`)
 * or `null` if it contains something we can't represent (calls, complex computed keys...).
 */
function target_text(node: Node): string | null {
	if (node.type === 'Identifier') return node.name;
	if (node.type === 'ThisExpression') return 'this';
	if (node.type !== 'MemberExpression') return null;
	const object = target_text(node.object);
	if (object === null) return null;
	if (node.computed) {
		const key = node.property;
		if (key.type === 'Literal') return `${object}[${key.raw ?? JSON.stringify(key.value)}]`;
		if (key.type === 'Identifier') return `${object}[${key.name}]`;
		return null;
	}
	if (node.property.type === 'Identifier') return `${object}.${node.property.name}`;
	if (node.property.type === 'PrivateIdentifier') return `${object}.#${node.property.name}`;
	return null;
}

function root_of(node: Node): Identifier | ThisExpression | null {
	while (node.type === 'MemberExpression') node = node.object;
	return node.type === 'Identifier' || node.type === 'ThisExpression' ? node : null;
}

/**
 * Resolves a variable to its `$state(...)` declaration. Returns the `$state` call and whether
 * the variable holds exactly the value passed to `$state` (i.e. it's not destructured).
 */
function resolve_state_variable(
	id: Identifier,
	state: AutofixerState,
): { init: CallExpression; direct: boolean } | null {
	const reference = state.parsed.find_reference_by_id(id);
	const definition = reference?.resolved?.defs[0];
	if (!definition || definition.type !== 'Variable') return null;

	const init = definition.node.init;
	// `$state.raw` and `$derived` are intentionally excluded: reassignment is their contract
	if (!init || init.type !== 'CallExpression' || !state.parsed.is_rune(init, ['$state'])) {
		return null;
	}

	return { init, direct: definition.node.id?.type === 'Identifier' };
}

/**
 * For `this.x` looks up a `x = $state(...)` field in the closest enclosing class.
 */
function resolve_class_field(target: MemberExpression, path: Path) {
	// find the member expression directly attached to `this` (e.g. `this.x` in `this.x.inner`)
	let field: MemberExpression = target;
	while (field.object.type === 'MemberExpression') field = field.object;
	if (field.object.type !== 'ThisExpression' || field.computed) return null;
	const key = field.property;
	if (key.type !== 'Identifier' && key.type !== 'PrivateIdentifier') return null;

	const class_body = path.findLast((node) => node.type === 'ClassBody');
	if (!class_body || class_body.type !== 'ClassBody') return null;

	for (const member of class_body.body) {
		if (
			member.type === 'PropertyDefinition' &&
			!member.computed &&
			!member.static &&
			member.key.type === key.type &&
			(member.key as Identifier).name === key.name
		) {
			return { init: member.value, direct: field === target };
		}
	}
	return null;
}

/**
 * Resolves the target of an assignment to its `$state` root and, if the target is exactly the
 * stateful value (and not something nested inside it), the kind of literal it was initialised with.
 */
function resolve_target(target: Target, path: Path, state: AutofixerState) {
	const root = root_of(target);
	if (!root) return null;

	let resolved: { init: Node | null | undefined; direct: boolean } | null = null;
	if (root.type === 'Identifier') {
		const variable = resolve_state_variable(root, state);
		if (variable) resolved = { ...variable, direct: variable.direct && target === root };
	} else if (target.type === 'MemberExpression') {
		const field = resolve_class_field(target, path);
		if (field?.init?.type === 'CallExpression' && state.parsed.is_rune(field.init, ['$state'])) {
			resolved = field;
		}
	}
	if (!resolved) return null;

	const argument =
		resolved.init?.type === 'CallExpression' ? (resolved.init.arguments[0] as Node) : undefined;
	// `let x = $state()` starts as `undefined`, the spread is most likely how it gets initialised
	if (resolved.direct && !argument) return null;
	return { known_kind: resolved.direct ? literal_kind(argument) : null };
}

function is_same_target(node: Node, target: Target, state: AutofixerState) {
	if (target_text(node) !== target_text(target)) return false;
	const node_root = root_of(node);
	const target_root = root_of(target);
	if (!node_root || !target_root) return false;
	if (node_root.type === 'ThisExpression') return target_root.type === 'ThisExpression';
	if (target_root.type !== 'Identifier') return false;
	const a = state.parsed.find_reference_by_id(node_root)?.resolved;
	const b = state.parsed.find_reference_by_id(target_root)?.resolved;
	return !!a && a === b;
}

/**
 * `x = { ...x, a: 1, b: 2 }` -> `x.a = ...; x.b = ...`
 */
function get_object_mutation(target: Target, right: ObjectExpression, state: AutofixerState) {
	const [spread, ...properties] = right.properties;
	if (!spread || spread.type !== 'SpreadElement' || properties.length === 0) return null;
	if (!is_same_target(spread.argument, target, state)) return null;

	const text = target_text(target);
	const mutations: string[] = [];
	for (const property of properties) {
		if (
			property.type !== 'Property' ||
			property.kind !== 'init' ||
			property.computed ||
			property.method
		) {
			return null;
		}
		if (property.key.type === 'Identifier') {
			mutations.push(`${text}.${property.key.name} = ...`);
		} else if (property.key.type === 'Literal') {
			mutations.push(`${text}[${property.key.raw ?? JSON.stringify(property.key.value)}] = ...`);
		} else {
			return null;
		}
	}
	return mutations.join('; ');
}

/**
 * `items = [...items, a, b]` -> `items.push(...)`
 */
function get_array_mutation(target: Target, right: ArrayExpression, state: AutofixerState) {
	const [spread, ...elements] = right.elements;
	if (!spread || spread.type !== 'SpreadElement' || elements.length === 0) return null;
	if (!is_same_target(spread.argument, target, state)) return null;
	if (elements.some((element) => !element || element.type === 'SpreadElement')) return null;

	return `${target_text(target)}.push(...)`;
}

function assignment_visitor(
	node: AssignmentExpression,
	{ state, path, next }: Context<Node | AST.SvelteNode, AutofixerState>,
) {
	const parent = path[path.length - 1];
	// only standalone assignments: `x = {...}`, not `foo(x = {...})` or `y = x = {...}`
	if (
		node.operator === '=' &&
		(node.left.type === 'Identifier' || node.left.type === 'MemberExpression') &&
		parent?.type === 'ExpressionStatement'
	) {
		const target = node.left;
		const kind = literal_kind(node.right);
		const resolved = kind && target_text(target) ? resolve_target(target, path, state) : null;

		// if we know the shape of the state make sure it matches the literal it's replaced with
		if (resolved && (!resolved.known_kind || resolved.known_kind === kind)) {
			const mutation =
				kind === 'object'
					? get_object_mutation(target, node.right as ObjectExpression, state)
					: get_array_mutation(target, node.right as ArrayExpression, state);

			if (mutation) {
				state.output.suggestions.push(
					`Reassigning the stateful value "${target_text(target)}" with a spread of itself is less performant than mutating it. Prefer \`${mutation}\` or, if you always replace the whole ${kind}, declare it with \`$state.raw\`.`,
				);
			}
		}
	}
	next();
}

export const self_spread_state_update: Autofixer = {
	AssignmentExpression: assignment_visitor,
};
