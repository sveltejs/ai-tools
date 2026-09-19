import { join } from 'node:path';
import { describe, expect, test, vi } from 'vitest';
import package_json from './package.json' with { type: 'json' };

const { exec_mock } = vi.hoisted(() => ({ exec_mock: vi.fn() }));

vi.mock('node:child_process', () => ({ exec: exec_mock }));

import { get_install_dir, setup_updates } from './update.js';

const cache_packages = join('/cache', 'packages');
const [package_scope = '@sveltejs', package_name = 'opencode'] = package_json.name.split('/');

/**
 * @param {string} spec
 */
function plugin_dir(spec) {
	return join(cache_packages, package_scope, spec, 'node_modules', package_scope, package_name);
}

const cache_npm = join('/cache', 'npm');

/**
 * @param {string} spec
 * @param {string} [generation]
 */
function v2_plugin_dir(spec, generation = '1789644998306') {
	return join(
		cache_npm,
		package_scope,
		spec,
		generation,
		'node_modules',
		package_scope,
		package_name,
	);
}

describe('get_install_dir', () => {
	test('returns the spec directory, not the generation, for an OpenCode v2 install', () => {
		expect(get_install_dir(true, v2_plugin_dir(`${package_name}@latest`))).toBe(
			join(cache_npm, package_scope, `${package_name}@latest`),
		);
	});

	test.each([
		['an exact version', `${package_name}@0.1.11`],
		['a range', `${package_name}@^0.1.0`],
		['an alternate dist-tag', `${package_name}@beta`],
	])('ignores %s in an OpenCode v2 install', (_, spec) => {
		expect(get_install_dir(true, v2_plugin_dir(spec))).toBeNull();
	});

	test('ignores a generation layout outside the OpenCode v2 npm cache', () => {
		const dir = join(
			'/workspace',
			package_scope,
			`${package_name}@latest`,
			'1789644998306',
			'node_modules',
			package_scope,
			package_name,
		);
		expect(get_install_dir(true, dir)).toBeNull();
	});

	test('does not treat a v1 layout under the v2 cache root as an install', () => {
		const dir = join(
			cache_npm,
			package_scope,
			package_name,
			'node_modules',
			package_scope,
			package_name,
		);
		expect(get_install_dir(true, dir)).toBeNull();
		expect(get_install_dir(false, dir)).toBeNull();
	});

	test('does not recognize a layout that does not match the running OpenCode version', () => {
		expect(get_install_dir(false, v2_plugin_dir(`${package_name}@latest`))).toBeNull();
		expect(get_install_dir(true, plugin_dir(`${package_name}@latest`))).toBeNull();
	});

	test.each([
		['an unpinned install', package_name],
		['the latest tag', `${package_name}@latest`],
	])('returns the cache directory for %s', (_, spec) => {
		expect(get_install_dir(false, plugin_dir(spec))).toBe(join(cache_packages, '@sveltejs', spec));
	});

	test.each([
		['an exact version', `${package_name}@0.1.11`],
		['an exact version with a v prefix', `${package_name}@v0.1.11`],
		['a range', `${package_name}@^0.1.0`],
		['an alternate dist-tag', `${package_name}@beta`],
	])('ignores %s', (_, spec) => {
		expect(get_install_dir(false, plugin_dir(spec))).toBeNull();
	});

	test('ignores a matching layout outside the OpenCode package cache', () => {
		const dir = join('/workspace', 'node_modules', package_scope, package_name);
		expect(get_install_dir(true, dir)).toBeNull();
		expect(get_install_dir(false, dir)).toBeNull();
	});
});

describe('setup_updates', () => {
	test('ignores a version check that completes after disposal', async () => {
		/**
		 * @type {Function|undefined}
		 */
		let complete;
		exec_mock.mockImplementationOnce((_command, callback) => {
			complete = callback;
		});
		const on_update = vi.fn();
		const dispose = setup_updates(true, false, on_update);

		await dispose();
		complete?.(null, '999.0.0');

		expect(on_update).not.toHaveBeenCalled();
	});
});
