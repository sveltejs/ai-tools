import { compile as compile_component, compileModule } from 'svelte/compiler';
import { extname } from 'path';
import ts from 'ts-blank-space';
import type { SemVer } from 'verkit';

export function add_compile_issues(
	content: { issues: string[]; suggestions: string[] },
	code: string,
	desired_svelte_version: SemVer,
	filename = 'Component.svelte',
	async = false,
) {
	let compile = compile_component;
	const extension = extname(filename);
	if (extension !== '.svelte') {
		compile = compileModule;
		// compile module doesn't accept .ts files so we need to transpile them first with ts-blank-space
		// a fast and lightweight typescript transpiler that can strips types replacing them with white spaces
		// so the code positions are not affected
		if (extension === '.ts') {
			code = ts(code, (node) => {
				content.issues.push(
					`The provided file is a module but it contains invalid TypeScript code: ${node.getText()} at ${node.getStart()}`,
				);
			});
		}
	}
	const compilation_result = compile(code, {
		filename: filename || 'Component.svelte',
		generate: false,
		runes: desired_svelte_version.major >= 5,
		experimental: { async },
	});

	for (const warning of compilation_result.warnings) {
		content.issues.push(
			`${warning.message} at line ${warning.start?.line}, column ${warning.start?.column}`,
		);
	}
}
