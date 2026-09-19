import { ESLint } from 'eslint';
import svelte_parser from 'svelte-eslint-parser';
import svelte from 'eslint-plugin-svelte';
import type { Config } from '@sveltejs/kit';
import ts from 'typescript-eslint';
import type { SemVer } from 'verkit';

let svelte_5_linter: ESLint | undefined;

let svelte_4_linter: ESLint | undefined;

function base_config(svelte_config: Config): ESLint.Options['baseConfig'] {
	return [
		...svelte.configs.recommended,
		{
			files: ['*.svelte', '*.svelte.ts', '*.svelte.js'],
			rules: {
				'no-self-assign': 'warn',
				'svelte/infinite-reactive-loop': 'warn',
				'svelte/no-dupe-else-if-blocks': 'warn',
				'svelte/no-dupe-on-directives': 'warn',
				'svelte/no-dupe-style-properties': 'warn',
				'svelte/no-dupe-use-directives': 'warn',
				'svelte/no-object-in-text-mustaches': 'warn',
				'svelte/no-raw-special-elements': 'warn',
				'svelte/no-reactive-functions': 'warn',
				'svelte/no-reactive-literals': 'warn',
				'svelte/no-store-async': 'warn',
				'svelte/no-svelte-internal': 'warn',
				'svelte/no-unnecessary-state-wrap': 'warn',
				'svelte/no-unused-props': 'warn',
				'svelte/no-unused-svelte-ignore': 'warn',
				'svelte/no-useless-children-snippet': 'warn',
				'svelte/no-useless-mustaches': 'warn',
				'svelte/prefer-svelte-reactivity': 'warn',
				'svelte/prefer-writable-derived': 'warn',
				'svelte/require-event-dispatcher-types': 'warn',
				'svelte/require-store-reactive-access': 'warn',
				'svelte/no-inspect': 'off',
			},

			languageOptions: {
				ecmaVersion: 2022,
				sourceType: 'module',
				parser: svelte_parser,
				parserOptions: {
					extraFileExtensions: ['.svelte'],
					parser: ts.parser,
					svelteConfig: svelte_config,
				},
			},
		},
	];
}

function get_linter(version: SemVer, async = false) {
	if (version.major < 5) {
		return (svelte_4_linter ??= new ESLint({
			overrideConfigFile: true,
			baseConfig: base_config({
				compilerOptions: {
					runes: false,
				},
			}),
		}));
	}
	return (svelte_5_linter ??= new ESLint({
		overrideConfigFile: true,
		baseConfig: base_config({
			compilerOptions: {
				runes: true,
				experimental: { async },
			},
		}),
	}));
}

export async function add_eslint_issues(
	content: { issues: string[]; suggestions: string[] },
	code: string,
	desired_svelte_version: SemVer,
	filename = 'Component.svelte',
	async = false,
) {
	const eslint = get_linter(desired_svelte_version, async);
	const results = await eslint.lintText(code, { filePath: filename || './Component.svelte' });

	for (const message of results[0]?.messages ?? []) {
		if (message.severity === 2) {
			content.issues.push(`${message.message} at line ${message.line}, column ${message.column}`);
		} else if (message.severity === 1) {
			content.suggestions.push(
				`${message.message} at line ${message.line}, column ${message.column}`,
			);
		}
	}
}
