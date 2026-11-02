import { compile as compile_component, compileModule } from 'svelte/compiler';
import { extname } from 'path';
import ts_blank_space from 'ts-blank-space';
import ts from 'typescript';
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping';
import type { SemVer } from 'verkit';

type Location = { line: number; column: number };

function identity_location(location: Location) {
	return location;
}

/**
 * Strips the types from a TypeScript module. It first tries with ts-blank-space, a fast and lightweight
 * typescript transpiler that replaces types with white spaces so the code positions are not affected.
 * If the code contains non-erasable syntax (parameter properties, enums, namespaces etc.) it falls back
 * to a full TypeScript transpilation and returns a function to map the positions back to the original code.
 */
function strip_types(code: string, filename: string) {
	let has_non_erasable_syntax = false;
	const blanked = ts_blank_space(code, () => {
		has_non_erasable_syntax = true;
	});
	if (!has_non_erasable_syntax) {
		return { code: blanked, map_location: identity_location };
	}
	const { outputText: output_text, sourceMapText: source_map_text } = ts.transpileModule(code, {
		fileName: filename,
		compilerOptions: {
			target: ts.ScriptTarget.ESNext,
			module: ts.ModuleKind.ESNext,
			verbatimModuleSyntax: true,
			sourceMap: true,
		},
	});
	const trace_map = new TraceMap(source_map_text!);
	return {
		code: output_text,
		map_location: (location: Location) => {
			const original = originalPositionFor(trace_map, location);
			if (original.line == null || original.column == null) return location;
			return { line: original.line, column: original.column };
		},
	};
}

export function add_compile_issues(
	content: { issues: string[]; suggestions: string[] },
	code: string,
	desired_svelte_version: SemVer,
	filename = 'Component.svelte',
	async = false,
) {
	let compile = compile_component;
	let map_location = identity_location;
	const extension = extname(filename);
	if (extension !== '.svelte') {
		compile = compileModule;
		// compile module doesn't accept .ts files so we need to transpile them first
		if (extension === '.ts') {
			({ code, map_location } = strip_types(code, filename));
		}
	}
	let compilation_result;
	try {
		compilation_result = compile(code, {
			filename: filename || 'Component.svelte',
			generate: false,
			runes: desired_svelte_version.major >= 5,
			experimental: { async },
		});
	} catch (e) {
		const error = e as { start?: Location };
		if (error.start) {
			error.start = map_location(error.start);
		}
		throw e;
	}

	for (const warning of compilation_result.warnings) {
		const start = warning.start && map_location(warning.start);
		content.issues.push(`${warning.message} at line ${start?.line}, column ${start?.column}`);
	}
}
