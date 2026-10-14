import v1_module from './v1-tui.jsx';
import { v2_tui_setup } from './v2-tui.js';

export default {
	id: 'svelte.configure',
	tui: v1_module.tui,
	setup: v2_tui_setup,
};
