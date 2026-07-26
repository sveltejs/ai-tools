import { exec } from 'node:child_process';
import { rmSync } from 'node:fs';
import { basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare } from 'verkit';
import package_json from './package.json' with { type: 'json' };

/** @typedef {import('@opencode-ai/plugin').PluginInput} PluginInput */

const current_dir = dirname(fileURLToPath(import.meta.url));
const name_segments = package_json.name.split('/');

/**
 * @param {string} dir
 * @param {number} levels
 */
function up(dir, levels) {
	for (let i = 0; i < levels; i++) dir = dirname(dir);
	return dir;
}

/**
 * opencode installs every plugin in `<cache>/packages/<spec>/node_modules/<name>`, so removing
 * `<spec>` is enough to make it reinstall the plugin from scratch on the next start.
 *
 * We return `null` whenever we don't recognize that layout (for example when the plugin is linked
 * locally during development) so that we never delete a folder we don't own.
 */
export function get_install_dir(dir = current_dir) {
	// from `<cache>/packages/<spec>/node_modules/<name>` up to `<cache>/packages/<spec>`
	const install_dir = up(dir, name_segments.length + 1);
	// ...and from there up to `<cache>/packages`
	if (basename(up(install_dir, name_segments.length)) !== 'packages') return null;
	// Only unconstrained installs can pick up npm's latest version. Ranges and alternate tags may
	// resolve to the same installed version after every wipe.
	const package_name = name_segments.at(-1);
	if (!package_name || ![package_name, `${package_name}@latest`].includes(basename(install_dir))) {
		return null;
	}
	return install_dir;
}

/**
 * Checks npm for a newer version of the plugin and warns the user about it. If `autoupdate` is
 * enabled we also delete the cached plugin once opencode shuts down, so the next start picks up the
 * new version.
 *
 * @param {PluginInput} ctx
 * @param {boolean} autoupdate
 * @returns {() => Promise<void>} the `dispose` hook
 */
export function setup_updates(ctx, autoupdate) {
	/** @type {string | null} */
	let stale_dir = null;
	let wiped = false;

	function wipe() {
		if (wiped || !stale_dir) return;
		wiped = true;
		try {
			rmSync(stale_dir, { recursive: true, force: true });
		} catch {
			// if we can't delete it there's nothing useful we can do at this point, the user will
			// just get the warning again on the next start
		}
	}

	exec(`npm view ${package_json.name} version`, (_, version) => {
		const latest = version?.trim();
		if (!latest || compare(latest, package_json.version) !== 1) return;

		stale_dir = autoupdate ? get_install_dir() : null;
		// `dispose` covers a graceful shutdown, `exit` is the safety net for everything else. We only
		// register it once we know we have something to delete to avoid piling up listeners.
		if (stale_dir) process.once('exit', wipe);

		setTimeout(() => {
			ctx.client.tui.showToast({
				body: {
					title: 'Svelte: new plugin version available',
					message: `${package_json.name}@${latest} is available (you are using ${package_json.version}).\n\n${
						stale_dir
							? 'It will be installed automatically the next time you start OpenCode.'
							: 'Wipe the cache or update your OpenCode config to update.'
					}`,
					variant: 'warning',
					duration: 7000,
				},
			});
		}, 7000);
	});

	return async () => {
		process.off('exit', wipe);
		wipe();
	};
}
