import { v1_plugin } from './v1.js';
import { v2_setup } from './v2.js';

let loaded_by_v1 = false;

export default {
	id: '@sveltejs/opencode',
	// V1 reads `server` before validating `tui`, while V2 ignores this legacy property. This lets
	// the shared entrypoint advertise its TUI to V2 without exposing an invalid boolean TUI to V1.
	// it is a bit hackish but V1 is unlikely to change after V2 is released so I'd say it's ok
	// to have this hack until we deprecate V1. The alternative would be forcing the users to setup a
	// separate global cli.json for V2
	get server() {
		loaded_by_v1 = true;
		return v1_plugin;
	},
	get tui() {
		return loaded_by_v1 ? undefined : true;
	},
	setup: v2_setup,
};
