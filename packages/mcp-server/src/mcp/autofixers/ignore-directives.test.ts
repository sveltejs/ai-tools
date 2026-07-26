import { describe, expect, it } from 'vitest';
import { add_autofixers_issues } from './add-autofixers-issues.js';

/** Run the autofixer and strip the trailing ` [<code>]` marker
 *  from each suggestion so verbatim message assertions stay
 *  readable. The marker itself is exercised by the dedicated
 *  `code marker` tests below via `run_raw`. */
function run(code: string, desired_svelte_version = 5) {
	const content = run_raw(code, desired_svelte_version);
	content.suggestions = content.suggestions.map((s) => s.replace(/ \[[a-z_]+\]$/, ''));
	return content;
}

function run_raw(code: string, desired_svelte_version = 5) {
	const content: { issues: string[]; suggestions: string[] } = { issues: [], suggestions: [] };
	add_autofixers_issues(content, code, desired_svelte_version);
	return content;
}

describe('svelte-mcp-ignore', () => {
	describe('code marker', () => {
		it('emits a trailing `[effect_calls_function]` marker on the call-in-effect suggestion', () => {
			const { suggestions } = run_raw(`
				<script>
					import { fetch_data } from './data.js';
					$effect(() => {
						fetch_data();
					});
				</script>`);
			expect(suggestions).toEqual([expect.stringMatching(/ \[effect_calls_function\]$/)]);
		});

		it('emits a trailing `[effect_assigns_state]` marker on the state-assigned-in-effect suggestion', () => {
			const { suggestions } = run_raw(`
				<script>
					let count = $state(0);
					$effect(() => {
						count = 43;
					});
				</script>`);
			expect(suggestions).toEqual([expect.stringMatching(/ \[effect_assigns_state\]$/)]);
		});

		it('emits a trailing `[bind_this_attachment]` marker on the bind:this suggestion', () => {
			const { suggestions } = run_raw(`
				<script>
					let el = $state();
				</script>

				<div bind:this={el}></div>`);
			expect(suggestions).toEqual([expect.stringMatching(/ \[bind_this_attachment\]$/)]);
		});
	});

	describe('effect_calls_function', () => {
		it('suppresses the suggestion when the directive sits on the previous line (`//` form)', () => {
			const { suggestions } = run(`
				<script>
					import { fetch_data } from './data.js';
					$effect(() => {
						// svelte-mcp-ignore effect_calls_function
						fetch_data();
					});
				</script>`);
			expect(suggestions).not.toContain(
				`You are calling the function \`fetch_data\` inside an $effect. Please check if the function is reassigning a stateful variable because that's considered malpractice and check if it could use  \`$derived\` instead. Ignore this suggestion if you are sure this function is not assigning any stateful variable or if you can't check if it does.`,
			);
		});

		it('also accepts the `/* … */` block form', () => {
			const { suggestions } = run(`
				<script>
					import { fetch_data } from './data.js';
					$effect(() => {
						/* svelte-mcp-ignore effect_calls_function */
						fetch_data();
					});
				</script>`);
			expect(suggestions).not.toContain(
				`You are calling the function \`fetch_data\` inside an $effect. Please check if the function is reassigning a stateful variable because that's considered malpractice and check if it could use  \`$derived\` instead. Ignore this suggestion if you are sure this function is not assigning any stateful variable or if you can't check if it does.`,
			);
		});

		it('does NOT suppress when the directive sits two lines above the call', () => {
			const { suggestions } = run(`
				<script>
					import { fetch_data } from './data.js';
					$effect(() => {
						// svelte-mcp-ignore effect_calls_function

						fetch_data();
					});
				</script>`);
			expect(suggestions).toContain(
				`You are calling the function \`fetch_data\` inside an $effect. Please check if the function is reassigning a stateful variable because that's considered malpractice and check if it could use  \`$derived\` instead. Ignore this suggestion if you are sure this function is not assigning any stateful variable or if you can't check if it does.`,
			);
		});

		it('does NOT suppress unrelated suggestions on the same line', () => {
			// `bind:this` and the function-in-effect are different
			// codes — silencing one must not silence the other.
			const { suggestions } = run(`
				<script>
					import { fetch_data } from './data.js';
					let el = $state();
					$effect(() => {
						// svelte-mcp-ignore effect_calls_function
						fetch_data();
					});
				</script>

				<div bind:this={el}></div>`);
			expect(suggestions).toContain(
				'The usage of `bind:this` can often be replaced with an easier to read `action` or even better an `attachment`. Consider using the latter if possible.',
			);
		});
	});

	describe('effect_assigns_state', () => {
		it('suppresses the state-assigned-in-effect suggestion', () => {
			const { suggestions } = run(`
				<script>
					let count = $state(0);
					$effect(() => {
						// svelte-mcp-ignore effect_assigns_state
						count = 43;
					});
				</script>`);
			expect(suggestions).not.toContain(
				'The stateful variable "count" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
			);
		});

		it('can list multiple codes on a single directive to silence two suggestions on the same target line', () => {
			// Directive scope is **line N+1** (matching
			// `svelte-ignore`). Both call + assignment have to
			// share the target line for one directive to cover
			// both. Splitting them across multiple lines would
			// need two directives, one per target line.
			const { suggestions } = run(`
				<script>
					import { fetch_data } from './data.js';
					let count = $state(0);
					$effect(() => {
						// svelte-mcp-ignore effect_calls_function effect_assigns_state
						fetch_data(); count = 43;
					});
				</script>`);
			expect(suggestions).not.toContain(
				`You are calling the function \`fetch_data\` inside an $effect. Please check if the function is reassigning a stateful variable because that's considered malpractice and check if it could use  \`$derived\` instead. Ignore this suggestion if you are sure this function is not assigning any stateful variable or if you can't check if it does.`,
			);
			expect(suggestions).not.toContain(
				'The stateful variable "count" is assigned inside an $effect which is generally consider a malpractice. Consider using $derived if possible.',
			);
		});
	});

	describe('bind_this_attachment', () => {
		it('suppresses the suggestion via a markup HTML comment directly above the element', () => {
			const { suggestions } = run(`
				<script>
					let el = $state();
				</script>

				<!-- svelte-mcp-ignore bind_this_attachment -->
				<div bind:this={el}></div>`);
			expect(suggestions).not.toContain(
				'The usage of `bind:this` can often be replaced with an easier to read `action` or even better an `attachment`. Consider using the latter if possible.',
			);
		});

		it('does NOT suppress when the next element on the line below has no matching directive', () => {
			const { suggestions } = run(`
				<script>
					let el1 = $state();
					let el2 = $state();
				</script>

				<!-- svelte-mcp-ignore bind_this_attachment -->
				<div bind:this={el1}></div>
				<span bind:this={el2}></span>`);
			// One element silenced, the next still produces the
			// suggestion. The autofixer's `bind:this` message is
			// identical for every element it fires on, so we only
			// assert it appears (i.e. at least once for `<span>`).
			expect(suggestions).toContain(
				'The usage of `bind:this` can often be replaced with an easier to read `action` or even better an `attachment`. Consider using the latter if possible.',
			);
		});
	});

	describe('imported_runes', () => {
		it('suppresses the suggestion for an import line', () => {
			const { suggestions } = run(`
				<script>
					// svelte-mcp-ignore imported_runes
					import { state } from 'svelte';
				</script>`);
			expect(suggestions).not.toContain(
				`You are importing "state" from "svelte". This is not necessary, all runes are globally available. Please remove this import and use "$state" directly.`,
			);
		});
	});

	describe('derived_with_function', () => {
		it('suppresses the suggestion on the next line', () => {
			const { suggestions } = run(`
				<script>
					// svelte-mcp-ignore derived_with_function
					const v = $derived(() => 42);
				</script>`);
			expect(suggestions).not.toContain(
				'You are passing a function to $derived when declaring "v" but $derived expects an expression. You can use $derived.by instead.',
			);
		});
	});

	describe('unused-directive diagnostics', () => {
		it('reports a directive whose code never matched', () => {
			const { suggestions } = run(`
				<script>
					// svelte-mcp-ignore effect_calls_function
					const x = 1;
				</script>`);
			expect(suggestions.some((s) => s.startsWith('Unused `svelte-mcp-ignore` directive'))).toBe(
				true,
			);
		});

		it('reports an unknown code with a hint about valid codes', () => {
			const { suggestions } = run(`
				<script>
					// svelte-mcp-ignore not_a_real_code
					const x = 1;
				</script>`);
			const unknown = suggestions.find((s) =>
				s.startsWith('Unknown `svelte-mcp-ignore` code "not_a_real_code"'),
			);
			expect(unknown).toBeTruthy();
			expect(unknown).toContain('Known codes:');
			expect(unknown).toContain('effect_calls_function');
		});

		it('does NOT report when the directive actually matched something', () => {
			const { suggestions } = run(`
				<script>
					import { fetch_data } from './data.js';
					$effect(() => {
						// svelte-mcp-ignore effect_calls_function
						fetch_data();
					});
				</script>`);
			expect(suggestions.some((s) => s.startsWith('Unused `svelte-mcp-ignore` directive'))).toBe(
				false,
			);
		});

		it('partially-used directives still report the unused codes', () => {
			// `effect_calls_function` fires; `bind_this_attachment`
			// has nothing to silence on the same line — report
			// only the second one as unused.
			const { suggestions } = run(`
				<script>
					import { fetch_data } from './data.js';
					$effect(() => {
						// svelte-mcp-ignore effect_calls_function bind_this_attachment
						fetch_data();
					});
				</script>`);
			expect(
				suggestions.some(
					(s) =>
						s.startsWith('Unused `svelte-mcp-ignore` directive') &&
						s.includes('bind_this_attachment'),
				),
			).toBe(true);
			expect(
				suggestions.some(
					(s) =>
						s.startsWith('Unused `svelte-mcp-ignore` directive') &&
						s.includes('effect_calls_function'),
				),
			).toBe(false);
		});
	});
});
