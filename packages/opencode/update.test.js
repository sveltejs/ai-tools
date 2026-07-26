import { join } from 'node:path';
import { describe, expect, test } from 'vitest';
import { get_install_dir } from './update.js';

const cache_packages = join('/cache', 'packages');

/**
 * @param {string} spec
 */
function plugin_dir(spec) {
	return join(cache_packages, '@sveltejs', spec, 'node_modules', '@sveltejs', 'opencode');
}

describe('get_install_dir', () => {
	test.each([
		['an unpinned install', 'opencode'],
		['the latest tag', 'opencode@latest'],
	])('returns the cache directory for %s', (_, spec) => {
		expect(get_install_dir(plugin_dir(spec))).toBe(join(cache_packages, '@sveltejs', spec));
	});

	test.each([
		['an exact version', 'opencode@0.1.11'],
		['an exact version with a v prefix', 'opencode@v0.1.11'],
		['a range', 'opencode@^0.1.0'],
		['an alternate dist-tag', 'opencode@beta'],
	])('ignores %s', (_, spec) => {
		expect(get_install_dir(plugin_dir(spec))).toBeNull();
	});

	test('ignores a matching layout outside the OpenCode package cache', () => {
		const dir = join('/workspace', 'node_modules', '@sveltejs', 'opencode');
		expect(get_install_dir(dir)).toBeNull();
	});
});
