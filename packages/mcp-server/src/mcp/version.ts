import { coerce, tryParse, type SemVer } from 'verkit';

const supported_majors = [4, 5];

/**
 * Parses a svelte version (e.g. `5.16.0`, `^5.16.0`, `5`) into a semver object.
 * Missing minor/patch parts default to 0. Returns `null` if the input is not a supported svelte version.
 */
export function parse_svelte_version(input: string | number): SemVer | null {
	const coerced = coerce(input);
	const version = coerced ? tryParse(coerced) : null;
	if (!version || !supported_majors.includes(version.major)) return null;
	return version;
}
