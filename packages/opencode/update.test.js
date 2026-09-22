import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import package_json from './package.json' with { type: 'json' };

const { exec_mock } = vi.hoisted(() => ({ exec_mock: vi.fn() }));

vi.mock('node:child_process', () => ({ exec: exec_mock }));

import {
	get_install_dir,
	has_other_instances,
	register_instance,
	setup_updates,
} from './update.js';

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

describe('instance markers', () => {
	/** @type {string} */
	let install_dir;

	beforeEach(() => {
		install_dir = mkdtempSync(join(tmpdir(), 'svelte-opencode-'));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		rmSync(install_dir, { recursive: true, force: true });
	});

	test('is alone when nobody registered', () => {
		expect(has_other_instances(install_dir)).toBe(false);
	});

	test('counts its registration until it unregisters', () => {
		const unregister = register_instance(install_dir);
		expect(has_other_instances(install_dir)).toBe(true);

		unregister();
		expect(has_other_instances(install_dir)).toBe(false);
	});

	test('keeps same-process registrations separate even in the same millisecond', () => {
		vi.spyOn(Date, 'now').mockReturnValue(1789644998306);
		const unregister_first = register_instance(install_dir);
		const unregister_second = register_instance(install_dir);
		const markers_dir = join(install_dir, '.instances');
		const markers = readdirSync(markers_dir);
		expect(markers).toHaveLength(2);
		for (const marker of markers) {
			expect(marker.startsWith(`${process.pid}-`)).toBe(true);
			expect(readFileSync(join(markers_dir, marker), 'utf8')).toBe('');
		}

		unregister_first();
		unregister_first();
		expect(readdirSync(markers_dir)).toHaveLength(1);
		expect(has_other_instances(install_dir)).toBe(true);

		unregister_second();
		expect(readdirSync(markers_dir)).toEqual([]);
		expect(has_other_instances(install_dir)).toBe(false);
	});

	test('detects another running instance until it unregisters', () => {
		// the parent process is as good as any other running process
		const unregister = register_instance(install_dir, process.ppid);
		const unregister_self = register_instance(install_dir);
		unregister_self();
		expect(has_other_instances(install_dir)).toBe(true);

		unregister();
		expect(has_other_instances(install_dir)).toBe(false);
	});

	test('cleans up the marker of a crashed instance', () => {
		register_instance(install_dir);
		vi.spyOn(process, 'kill').mockImplementation(() => {
			throw Object.assign(new Error('No such process'), { code: 'ESRCH' });
		});
		expect(has_other_instances(install_dir)).toBe(false);
		expect(readdirSync(join(install_dir, '.instances'))).toEqual([]);
		expect(existsSync(install_dir)).toBe(true);
	});

	test('preserves a registration when its process exists but cannot be signaled', () => {
		register_instance(install_dir);
		vi.spyOn(process, 'kill').mockImplementation(() => {
			throw Object.assign(new Error('Operation not permitted'), { code: 'EPERM' });
		});
		expect(has_other_instances(install_dir)).toBe(true);
		expect(readdirSync(join(install_dir, '.instances'))).toHaveLength(1);
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
