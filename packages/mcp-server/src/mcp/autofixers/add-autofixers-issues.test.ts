import { describe, expect, it } from 'vitest';
import { add_autofixers_issues } from './add-autofixers-issues.js';
import { base_runes } from '../../constants.js';

const dollarless_runes = base_runes.map((r) => ({ rune: r.replace('$', '') }));

function run_autofixers_on_code(code: string, desired_svelte_version = 5) {
	const content: { issues: string[]; suggestions: string[] } = { issues: [], suggestions: [] };
	add_autofixers_issues(content, code, desired_svelte_version);
	// Suggestion messages carry a trailing ` [<code>]` marker
	// since the `svelte-mcp-ignore` work — strip it here so
	// pre-existing assertions that match the human-readable
	// message verbatim keep working. The dedicated ignore-
	// directive tests assert on the marker explicitly.
	content.suggestions = content.suggestions.map((s) => s.replace(/ \[[a-z_]+\]$/, ''));
	return content;
}

function with_possible_inits(title: string, fn: (args: { init: string }) => void) {
	describe.each([
		{ init: '$state' },
		{ init: '$state.raw' },
		{ init: '$derived' },
		{ init: '$derived.by' },
	])(title, fn);
}

describe('add_autofixers_issues', () => {
	describe('assign_in_effect', () => {
		with_possible_inits('($init)', ({ init }) => {
			it(`should add suggestions when assigning to a stateful variable inside an effect`, () => {
				const content = run_autofixers_on_code(`
				<script>
					const count = ${init}(0);
					$effect(() => {
						count = 43;
					});
				</script>`);

				expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
				expect(content.suggestions).toContain(
					'The stateful variable "count" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
				);
			});

			it(`should add a suggestion for each variable assigned within an effect`, () => {
				const content = run_autofixers_on_code(`
				<script>
					const count = $state(0);
					const count2 = $state(0);
					$effect(() => {
						count = 43;
						count2 = 44;
					});
				</script>`);

				expect(content.suggestions.length).toBeGreaterThanOrEqual(2);
				expect(content.suggestions).toContain(
					'The stateful variable "count" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
				);
				expect(content.suggestions).toContain(
					'The stateful variable "count2" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
				);
			});
			it(`should not add a suggestion for variables that are not assigned within an effect`, () => {
				const content = run_autofixers_on_code(`
				<script>
					const count = ${init}(0);
				</script>

				<button onclick={() => count = 43}>Increment</button>
				`);

				expect(content.suggestions).not.toContain(
					'The stateful variable "count" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
				);
			});

			it("should not add a suggestions for variables that are assigned within an effect but aren't stateful", () => {
				const content = run_autofixers_on_code(`
				<script>
					const count = 0;

					$effect(() => {
						count = 43;
					});
				</script>`);

				expect(content.suggestions).not.toContain(
					'The stateful variable "count" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
				);
			});

			it(`should add a suggestion for variables that are assigned within an effect with an update`, () => {
				const content = run_autofixers_on_code(`
				<script>
					let count = ${init}(0);

					$effect(() => {
						count++;
					});
				</script>
				`);

				expect(content.suggestions).toContain(
					'The stateful variable "count" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
				);
			});

			it(`should add a suggestion for variables that are mutated within an effect`, () => {
				const content = run_autofixers_on_code(`
				<script>
					let count = ${init}({ value: 0 });

					$effect(() => {
						count.value = 42;
					});
				</script>
				`);

				expect(content.suggestions).toContain(
					'The stateful variable "count" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
				);
			});

			it(`should add a suggestion for variables that are mutated within an effect.pre`, () => {
				const content = run_autofixers_on_code(`
				<script>
					let count = ${init}({ value: 0 });

					$effect.pre(() => {
						count.value = 42;
					});
				</script>
				`);

				expect(content.suggestions).toContain(
					'The stateful variable "count" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
				);
			});
		});

		it('should add a suggestion when calling a function inside an effect', () => {
			const content = run_autofixers_on_code(`
			<script>
				import { fetch_data } from './data.js';
				$effect(() => {
					fetch_data();
				});
			</script>`);

			expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
			expect(content.suggestions).toContain(
				`You are calling the function \`fetch_data\` inside an $effect. Please check if the function is reassigning a stateful variable because that's considered malpractice and check if it could use  \`$derived\` instead. Ignore this suggestion if you are sure this function is not assigning any stateful variable or if you can't check if it does.`,
			);
		});

		it('should add a suggestion when calling a function inside an effect (with non identifier callee)', () => {
			const content = run_autofixers_on_code(`
			<script>
				import { fetch_data } from './data.js';
				$effect(() => {
					fetch_data.fetch();
				});
			</script>`);

			expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
			expect(content.suggestions).toContain(
				`You are calling a function inside an $effect. Please check if the function is reassigning a stateful variable because that's considered malpractice and check if it could use  \`$derived\` instead. Ignore this suggestion if you are sure this function is not assigning any stateful variable or if you can't check if it does.`,
			);
		});
	});

	with_possible_inits('($init)', ({ init }) => {
		describe.each([{ method: 'set' }, { method: 'update' }])(
			'wrong_property_access_state ($method)',
			({ method }) => {
				it(`should add suggestions when using .${method}() on a stateful variable with a literal init`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const count = ${init}(0);
				function update_count() {
					count.${method}(43);
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to update the stateful variable "count" using "${method}". stateful variables should be updated with a normal assignment/mutation, do not use methods to update them.`,
					);
				});

				it(`should add suggestions when using .${method}() on a stateful variable with an array init`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const count = ${init}([0]);
				function update_count() {
					count.${method}([1]);
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to update the stateful variable "count" using "${method}". stateful variables should be updated with a normal assignment/mutation, do not use methods to update them.`,
					);
				});

				it(`should add suggestions when using .${method}() on a stateful variable with conditional if it's not sure if the method could actually be present on the variable (${init}({}))`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const count = ${init}({ value: 0 });
				function update_count() {
					count.${method}({ value: 43 });
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to update the stateful variable "count" using "${method}". stateful variables should be updated with a normal assignment/mutation, do not use methods to update them. However I can't verify if "count" is a state variable of an object or a class with a "${method}" method on it. Please verify that before updating the code to use a normal assignment`,
					);
				});

				it(`should add suggestions when using .${method}() on a stateful variable with conditional if it's not sure if the method could actually be present on the variable (${init}(new Class()))`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const count = ${init}(new Class());
				function update_count() {
					count.${method}(new Class());
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to update the stateful variable "count" using "${method}". stateful variables should be updated with a normal assignment/mutation, do not use methods to update them. However I can't verify if "count" is a state variable of an object or a class with a "${method}" method on it. Please verify that before updating the code to use a normal assignment`,
					);
				});

				it(`should add suggestions when using .${method}() on a stateful variable with conditional if it's not sure if the method could actually be present on the variable (${init}(variable_name))`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const { init } = $props();
				const count = ${init}(init);
				function update_count() {
					count.${method}(43);
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to update the stateful variable "count" using "${method}". stateful variables should be updated with a normal assignment/mutation, do not use methods to update them. However I can't verify if "count" is a state variable of an object or a class with a "${method}" method on it. Please verify that before updating the code to use a normal assignment`,
					);
				});

				it(`should not add suggestions when using .${method} on a stateful variable if it's not a method call`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const count = ${init}({});
				function update_count() {
					console.log(count.${method});
				}
			</script>`);

					expect(content.suggestions).not.toContain(
						`You are trying to update the stateful variable "count" using "${method}". stateful variables should be updated with a normal assignment/mutation, do not use methods to update them. However I can't verify if "count" is a state variable of an object or a class with a "${method}" method on it. Please verify that before updating the code to use a normal assignment`,
					);
				});
			},
		);

		describe.each([{ property: '$' }])(
			'wrong_property_access_state property ($property)',
			async ({ property }) => {
				it(`should add suggestions when reading .${property} on a stateful variable with a literal init`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const count = ${init}(0);
				function read_count() {
					count.${property};
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to read the stateful variable "count" using "${property}". stateful variables should be read just by accessing them like normal variable, do not use properties to read them.`,
					);
				});

				it(`should add suggestions when reading .${property} on a stateful variable with an array init`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const count = ${init}([1]);
				function read_count() {
					count.${property};
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to read the stateful variable "count" using "${property}". stateful variables should be read just by accessing them like normal variable, do not use properties to read them.`,
					);
				});

				it(`should add suggestions when reading .${property} on a stateful variable with conditional if it's not sure if the property could actually be present on the variable (${init}({}))`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const count = ${init}({ value: 0 });
				function read_count() {
					count.${property};
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to read the stateful variable "count" using "${property}". stateful variables should be read just by accessing them like normal variable, do not use properties to read them. However I can't verify if "count" is a state variable of an object or a class with a "${property}" property on it. Please verify that before updating the code to use a normal access`,
					);
				});

				it(`should add suggestions when reading .${property} on a stateful variable with conditional if it's not sure if the property could actually be present on the variable (${init}(new Class()))`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const count = ${init}(new Class());
				function read_count() {
					count.${property};
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to read the stateful variable "count" using "${property}". stateful variables should be read just by accessing them like normal variable, do not use properties to read them. However I can't verify if "count" is a state variable of an object or a class with a "${property}" property on it. Please verify that before updating the code to use a normal access`,
					);
				});

				it(`should add suggestions when reading .${property} on a stateful variable with conditional if it's not sure if the property could actually be present on the variable (${init}(variable_name))`, () => {
					const content = run_autofixers_on_code(`
			<script>
				const { init } = $props();
				const count = ${init}(init);
				function read_count() {
					count.${property};
				}
			</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are trying to read the stateful variable "count" using "${property}". stateful variables should be read just by accessing them like normal variable, do not use properties to read them. However I can't verify if "count" is a state variable of an object or a class with a "${property}" property on it. Please verify that before updating the code to use a normal access`,
					);
				});
			},
		);
	});

	describe('imported_runes', () => {
		describe.each([
			{ source: 'svelte' },
			{ source: 'svelte/runes' },
			{ source: '@sveltejs/runes' },
			{ source: '@sveltejs/vite-plugin-svelte' },
		])('from "$source"', ({ source }) => {
			describe.each(dollarless_runes)('single import ($rune)', ({ rune }) => {
				it(`should add suggestions when importing '${rune}' from '${source}'`, () => {
					const content = run_autofixers_on_code(`
					<script>
						import { ${rune} } from '${source}';
					</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are importing "${rune}" from "${source}". This is not necessary, all runes are globally available. Please remove this import and use "$${rune}" directly.`,
					);
				});

				it(`should add suggestions when importing "${rune}" as the default export from '${source}'`, () => {
					const content = run_autofixers_on_code(`
					<script>
						import ${rune} from '${source}';
					</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are importing "${rune}" from "${source}". This is not necessary, all runes are globally available. Please remove this import and use "$${rune}" directly.`,
					);
				});

				it(`should add suggestions when importing '${rune}' as the namespace export from '${source}'`, () => {
					const content = run_autofixers_on_code(`
					<script>
						import * as ${rune} from '${source}';
					</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are importing "${rune}" from "${source}". This is not necessary, all runes are globally available. Please remove this import and use "$${rune}" directly.`,
					);
				});
			});

			it(`should add suggestions when importing multiple runes from '${source}'`, () => {
				const content = run_autofixers_on_code(`
					<script>
						import { onMount, state, effect } from '${source}';
					</script>`);

				expect(content.suggestions.length).toBeGreaterThanOrEqual(2);
				expect(content.suggestions).toContain(
					`You are importing "state" from "${source}". This is not necessary, all runes are globally available. Please remove this import and use "$state" directly.`,
				);
				expect(content.suggestions).toContain(
					`You are importing "effect" from "${source}". This is not necessary, all runes are globally available. Please remove this import and use "$effect" directly.`,
				);
			});

			it(`should not add suggestions when importing other identifiers from '${source}'`, () => {
				const content = run_autofixers_on_code(`
					<script>
						import { onMount } from '${source}';
					</script>`);

				expect(content.suggestions).not.toContain(
					`You are importing "onMount" from "${source}". This is not necessary, all runes are globally available. Please remove this import and use "$onMount" directly.`,
				);
			});
		});

		describe.each(dollarless_runes)('importing $rune from external lib', ({ rune }) => {
			it(`should not add suggestions when importing from packages whose name doesn't contain svelte`, () => {
				const content = run_autofixers_on_code(`
				<script>
					import { ${rune} } from 'something-something';
				</script>`);

				expect(content.suggestions).not.toContain(
					`You are importing "${rune}" from "something-something". This is not necessary, all runes are globally available. Please remove this import and use "$${rune}" directly.`,
				);
			});

			it(`should add suggestions with a different hint when importing from packages whose name contains svelte but it's not official`, () => {
				const content = run_autofixers_on_code(`
				<script>
					import { ${rune} } from 'svelte-something-something';
				</script>`);

				expect(content.suggestions).toContain(
					`You are importing "${rune}" from "svelte-something-something". If you are trying to import runes to use them this is not necessary, all runes are globally available. Please remove this import and use "$${rune}" directly. If you are importing the function from a separate library ignore this suggestion.`,
				);
			});
		});

		it('should not add the imported_runes suggestion when importing derived from svelte/store', () => {
			const content = run_autofixers_on_code(`
			<script>
				import { derived } from 'svelte/store';
			</script>`);

			expect(content.suggestions).not.toContain(
				'You are importing "derived" from "svelte/store". This is not necessary, all runes are globally available. Please remove this import and use "$derived" directly.',
			);
		});
	});

	describe('derived_with_function', () => {
		it(`should add suggestions when using a function as the first argument to $derived`, () => {
			const content = run_autofixers_on_code(`
			<script>
				const value = $derived(() => {
					return 43;
				});
			</script>`);

			expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
			expect(content.suggestions).toContain(
				'You are passing a function to $derived when declaring "value" but $derived expects an expression. You can use $derived.by instead.',
			);
		});

		it(`should add suggestions when using a function as the first argument to $derived in classes`, () => {
			const content = run_autofixers_on_code(`
			<script>
				class Double {
					value = $derived(() => 43);
				}
			</script>`);

			expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
			expect(content.suggestions).toContain(
				'You are passing a function to $derived when declaring "value" but $derived expects an expression. You can use $derived.by instead.',
			);
		});

		it(`should add suggestions when using a function as the first argument to $derived in classes constructors`, () => {
			const content = run_autofixers_on_code(`
			<script>
				class Double {
					value;

					constructor(){
						this.value = $derived(function() { return 44; });
					}
				}
			</script>`);

			expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
			expect(content.suggestions).toContain(
				'You are passing a function to $derived when declaring "value" but $derived expects an expression. You can use $derived.by instead.',
			);
		});

		it(`should add suggestions when using a function as the first argument to $derived without the declaring part if it's not an identifier`, () => {
			const content = run_autofixers_on_code(`
			<script>
				const { destructured } = $derived(() => 43);
			</script>`);

			expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
			expect(content.suggestions).toContain(
				'You are passing a function to $derived but $derived expects an expression. You can use $derived.by instead.',
			);
		});

		it(`should add suggestions when using a function as the first argument to $derived.by`, () => {
			const content = run_autofixers_on_code(`
			<script>
				const { destructured } = $derived.by(() => 43);
			</script>`);

			expect(content.suggestions).not.toContain(
				'You are passing a function to $derived but $derived expects an expression. You can use $derived.by instead.',
			);
		});
	});

	describe('use_runes_instead_of_store', () => {
		describe.each([{ import: 'derived' }, { import: 'writable' }, { import: 'readable' }])(
			'importing $import from svelte/store',
			({ import: imported }) => {
				it(`should add suggestions when importing '${imported}' from 'svelte/store'`, () => {
					const content = run_autofixers_on_code(`
				<script>
					import { ${imported} } from 'svelte/store';
				</script>`);

					expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
					expect(content.suggestions).toContain(
						`You are importing "${imported}" from "svelte/store". Unless the user specifically asked for stores or it's required because some library/component requires a store as input consider using runes like \`$state\` or \`$derived\` instead, all runes are globally available.`,
					);
				});
			},
		);

		it(`should not add suggestions when importing other identifiers from 'svelte/store'`, () => {
			const content = run_autofixers_on_code(`
			<script>
				import { get } from 'svelte/store';
			</script>`);

			expect(content.suggestions).not.toContain(
				`You are importing "get" from "svelte/store". Unless the user specifically asked for stores or it's required because some library/component requires a store as input consider using runes like \`$state\` or \`$derived\` instead, all runes are globally available.`,
			);
		});
	});

	describe('suggest_attachments', () => {
		describe('bind:this', () => {
			it('should add suggestions when using bind:this on an element', () => {
				const content = run_autofixers_on_code(`
			<script>
				let a = $state();	
			</script>

			<a bind:this={a} />`);

				expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
				expect(content.suggestions).toContain(
					'The usage of `bind:this` can often be replaced with an easier to read `action` or even better an `attachment`. Consider using the latter if possible.',
				);
			});

			it('should not add suggestions when using bind:this on a component', () => {
				const content = run_autofixers_on_code(`
			<script>
				import Child from './Child.svelte';
				let a = $state();	
			</script>

			<Child bind:this={a} />`);

				expect(content.suggestions).not.toContain(
					'The usage of `bind:this` can often be replaced with an easier to read `action` or even better an `attachment`. Consider using the latter if possible.',
				);
			});

			it('should not add suggestions when using bind:this on a component nested in an element', () => {
				const content = run_autofixers_on_code(`
			<script>
				import Child from './Child.svelte';
				let a = $state();	
			</script>

			<div>
				<Child bind:this={a} />
			</div>`);

				expect(content.suggestions).not.toContain(
					'The usage of `bind:this` can often be replaced with an easier to read `action` or even better an `attachment`. Consider using the latter if possible.',
				);
			});

			it('should add suggestions but not suggest attachments when using bind:this on an element and the desired svelte version is 4', () => {
				const content = run_autofixers_on_code(
					`
			<script>
				let a;	
			</script>

			<a bind:this={a} />`,
					4,
				);

				expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
				expect(content.suggestions).toContain(
					'The usage of `bind:this` can often be replaced with an easier to read `action`. Consider using the latter if possible.',
				);
			});
		});

		describe('use:', () => {
			it('should add suggestions when using use: on an element and the action is declared as a function', () => {
				const content = run_autofixers_on_code(
					`<script>
						function my_action(node) {
							// do something with the node
						}
					</script>

					<a use:my_action />`,
				);

				expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
				expect(content.suggestions).toContain(
					'Consider using an `attachment` instead of an `action` for "my_action".',
				);
			});

			it('should add suggestions when using use: on an element and the action is declared as a variable', () => {
				const content = run_autofixers_on_code(
					`<script>
						const my_action = (node) => {
							// do something with the node
						}
					</script>

					<a use:my_action />`,
				);

				expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
				expect(content.suggestions).toContain(
					'Consider using an `attachment` instead of an `action` for "my_action".',
				);
			});

			it('should add suggestions when using use: on an element and the action is declared as an object', () => {
				const content = run_autofixers_on_code(
					`<script>
						const my_action = {
							action: (node) => {
								// do something with the node
							}
						};
					</script>

					<a use:my_action.action />`,
				);

				expect(content.suggestions.length).toBeGreaterThanOrEqual(1);
				expect(content.suggestions).toContain(
					'Consider using an `attachment` instead of an `action` for "my_action".',
				);
			});

			it('should not add suggestions when using use: on an element and the desired svelte version is 4', () => {
				const content = run_autofixers_on_code(
					`<script>
						function my_action(node) {
							// do something with the node
						}
					</script>

					<a use:my_action />`,
					4,
				);

				expect(content.suggestions).not.toContain(
					'Consider using an `attachment` instead of an `action` for "my_action".',
				);
			});

			it('should not add suggestions when using use: on an element and the action comes from an import', () => {
				const content = run_autofixers_on_code(
					`<script>
						import { my_action } from './actions.js';
					</script>

					<a use:my_action />`,
				);

				expect(content.suggestions).not.toContain(
					'Consider using an `attachment` instead of an `action` for "my_action".',
				);
			});

			it('should not add suggestions when using use: on an element and the action comes from the props', () => {
				const content = run_autofixers_on_code(
					`<script>
						const { my_action } = $props();
					</script>

					<a use:my_action />`,
				);

				expect(content.suggestions).not.toContain(
					'Consider using an `attachment` instead of an `action` for "my_action".',
				);
			});

			it('should not add suggestions when using use: on an element and the action comes from a global variable', () => {
				const content = run_autofixers_on_code(`<a use:my_action />`);

				expect(content.suggestions).not.toContain(
					'Consider using an `attachment` instead of an `action` for "my_action".',
				);
			});
		});
	});
	describe('read_state_with_dollar', () => {
		with_possible_inits('($init)', ({ init }) => {
			it(`should add an issue when reading a stateful variable initialized with ${init} like if it was a store`, () => {
				const content = run_autofixers_on_code(`<script>
					let x = ${init}(()=> 43);
					$x;
				</script>
				`);

				expect(content.issues).toContain(
					`You are reading the stateful variable "$x" with a "$" prefix. Stateful variables are not stores and should be read without the "$". Please read it as a normal variable "x"`,
				);
			});
		});

		it(`should not add an issue when reading an imported variable like if it was a store`, () => {
			const content = run_autofixers_on_code(`<script>
					import { x } from "./my-stores.ts";
					$x;
				</script>
				`);

			expect(content.issues).not.toContain(
				`You are reading the stateful variable "$x" with a "$" prefix. Stateful variables are not stores and should be read without the "$". Please read it as a normal variable "x"`,
			);
		});

		it(`should not add an issue when reading a non-stateful variable like if it was a store`, () => {
			const content = run_autofixers_on_code(`<script>
					import { writable } from "svelte/store";	
					const x = writable(0);
					$x;
				</script>
				`);

			expect(content.issues).not.toContain(
				`You are reading the stateful variable "$x" with a "$" prefix. Stateful variables are not stores and should be read without the "$". Please read it as a normal variable "x"`,
			);
		});

		it(`should not add an issue when reading a prop like if it was a store`, () => {
			const content = run_autofixers_on_code(`<script>
					const { x } = $props();
					$x;
				</script>
				`);

			expect(content.issues).not.toContain(
				`You are reading the stateful variable "$x" with a "$" prefix. Stateful variables are not stores and should be read without the "$". Please read it as a normal variable "x"`,
			);
		});

		// https://github.com/sveltejs/ai-tools/issues/200
		it('should not crash when reading $-prefixed identifier for variable initialized with member expression', () => {
			expect(() =>
				run_autofixers_on_code(`<div>{$x}</div>

					<script>
					const x = foo.bar;
					</script>`),
			).not.toThrow();
		});
	});
});
