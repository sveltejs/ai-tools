import { ESLint } from 'eslint';
import svelte_parser from 'svelte-eslint-parser';
import svelte from 'eslint-plugin-svelte';
import type { Config } from '@sveltejs/kit';
import ts from 'typescript-eslint';
import type { SemVer } from 'verkit';

const linters = new Map<string, ESLint>();

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
	const is_svelte_4 = version.major < 5;
	// async is only relevant for svelte 5 so we key the cache only on the options
	// that actually end up in the config
	const key = is_svelte_4 ? 'svelte_4' : `svelte_5_${async ? 'async' : 'sync'}`;
	let linter = linters.get(key);
	if (!linter) {
		linter = new ESLint({
			overrideConfigFile: true,
			baseConfig: base_config({
				compilerOptions: is_svelte_4 ? { runes: false } : { runes: true, experimental: { async } },
			}),
		});
		linters.set(key, linter);
	}
	return linter;
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
