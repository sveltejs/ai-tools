import { exec } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compare } from 'verkit';
import package_json from './package.json' with { type: 'json' };

const current_dir = dirname(fileURLToPath(import.meta.url));
const name_segments = package_json.name.split('/');
const instances_dir = '.instances';

/**
 * @param {string} dir
 * @param {number} levels
 */
function up(dir, levels) {
	for (let i = 0; i < levels; i++) dir = dirname(dir);
	return dir;
}

/**
 * opencode v1 installs every plugin in `<cache>/packages/<spec>/node_modules/<name>`, so removing
 * `<spec>` is enough to make it reinstall the plugin from scratch on the next start.
 *
 * opencode v2 installs them in `<cache>/npm/<spec>/<generation>/node_modules/<name>` instead, where
 * `<generation>` is a timestamp. It keeps the last two generations around and always loads the
 * newest one, so we have to remove the whole `<spec>` folder: deleting only the running generation
 * would make it fall back to an even older version.
 *
 * In both cases `<spec>` is nested in the scope folder (`@sveltejs/opencode@latest`).
 *
 * We return `null` whenever we don't recognize the layout (for example when the plugin is linked
 * locally during development) so that we never delete a folder we don't own.
 *
 * @param {boolean} is_v2 whether the plugin is running in opencode v2
 * @param {string} [dir]
 */
export function get_install_dir(is_v2, dir = current_dir) {
	if (basename(up(dir, name_segments.length)) !== 'node_modules') return null;
	// from `.../node_modules/<name>` up to the folder containing `node_modules`
	const root = up(dir, name_segments.length + 1);
	// in v2 that's the generation folder and `<spec>` is its parent, in v1 it's `<spec>` itself
	const install_dir = is_v2 ? dirname(root) : root;
	// ...and from there up to `<cache>/packages` (v1) or `<cache>/npm` (v2)
	if (basename(up(install_dir, name_segments.length)) !== (is_v2 ? 'npm' : 'packages')) return null;
	// Only unconstrained installs can pick up npm's latest version. Ranges and alternate tags may
	// resolve to the same installed version after every wipe.
	const package_name = name_segments.at(-1);
	if (!package_name || ![package_name, `${package_name}@latest`].includes(basename(install_dir))) {
		return null;
	}
	return install_dir;
}

/**
 * Every plugin setup drops an empty `<pid>-<uuid>` marker in `<install_dir>/.instances`. The UUID
 * keeps registrations in the same process separate, while the pid lets us remove markers left
 * behind by crashed processes.
 *
 * @param {string} install_dir
 * @param {number} [pid]
 * @returns {() => void} removes the marker
 */
export function register_instance(install_dir, pid = process.pid) {
	const marker = join(install_dir, instances_dir, `${pid}-${randomUUID()}`);
	try {
		mkdirSync(dirname(marker), { recursive: true });
		writeFileSync(marker, '');
	} catch {
		// without a marker the other instances could wipe the plugin while we are running, which is
		// what happened before the markers existed anyway
	}
	return () => {
		try {
			rmSync(marker, { force: true });
		} catch {
			// the pid check will take care of it
		}
	};
}

/**
 * @param {number} pid
 */
function is_running(pid) {
	try {
		// this doesn't kill the process, because it send signal 0
		// we use this to determine if the process that claimed a marker
		// is still running or not
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// `EPERM` means the process exists but belongs to someone else
		return /** @type {NodeJS.ErrnoException} */ (error).code === 'EPERM';
	}
}

/**
 * Checks the remaining registrations after the caller removes its own marker. Registrations in
 * the current process still count because another location may be using the same installation.
 *
 * @param {string} install_dir
 */
export function has_other_instances(install_dir) {
	const dir = join(install_dir, instances_dir);
	/** @type {string[]} */
	let markers;
	try {
		markers = readdirSync(dir);
	} catch (error) {
		// if we can't tell we'd rather skip the update than break another instance
		return /** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT';
	}
	return markers.some((marker) => {
		const pid = /^(\d+)-/.exec(marker)?.[1];
		if (pid && is_running(Number(pid))) return true;
		// the instance crashed without cleaning up after itself
		try {
			rmSync(join(dir, marker), { force: true });
		} catch {
			// it's stale either way
		}
		return false;
	});
}

/**
 * Checks npm for a newer version of the plugin and warns the user about it. If `autoupdate` is
 * enabled we also delete the cached plugin on cleanup, so the next start picks up the new version.
 * If other registrations are still active we leave it alone. The last registration can delete it
 * if its version check also found an update.
 *
 * @param {boolean} autoupdate
 * @param {boolean} is_v2 whether the plugin is running in opencode v2
 * @param {(update: { latest: string, message: string }) => void} on_update
 * @returns {() => Promise<void>} the `dispose` hook
 */
export function setup_updates(autoupdate, is_v2, on_update) {
	/** @type {string | null} */
	let stale_dir = null;
	let disposed = false;
	let wiped = false;

	const install_dir = get_install_dir(is_v2);
	const unregister = install_dir ? register_instance(install_dir) : null;

	function wipe() {
		if (wiped) return;
		wiped = true;
		unregister?.();
		if (!stale_dir || has_other_instances(stale_dir)) return;
		try {
			rmSync(stale_dir, { recursive: true, force: true });
		} catch {
			// if we can't delete it there's nothing useful we can do at this point, the user will
			// just get the warning again on the next start
		}
	}

	exec(`npm view ${package_json.name} version`, (_, version) => {
		if (disposed) return;
		const latest = version?.trim();
		if (!latest || compare(latest, package_json.version) !== 1) return;

		stale_dir = autoupdate ? install_dir : null;

		on_update({
			latest,
			message: `${package_json.name}@${latest} is available (you are using ${package_json.version}).\n\n${
				stale_dir
					? 'It will be installed automatically the next time you start OpenCode after closing every running instance.'
					: 'Wipe the cache or update your OpenCode config to update.'
			}`,
		});
	});

	// `dispose` covers plugin unload, including graceful shutdown. `exit` also removes the marker
	// when the process exits without disposing the plugin.
	if (install_dir) process.once('exit', wipe);

	return async () => {
		disposed = true;
		process.off('exit', wipe);
		wipe();
	};
}
