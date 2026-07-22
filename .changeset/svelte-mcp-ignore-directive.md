---
'@sveltejs/mcp': minor
---

feat(autofixer): per-suggestion suppression via `svelte-mcp-ignore` directives

The custom-visitor suggestions emitted by `add_autofixers_issues` (the third
diagnostic source, separate from the Svelte compiler and ESLint passes) can now
be silenced individually with a comment directive on the line above the
triggering node:

```svelte
<script>
	// svelte-mcp-ignore effect_calls_function
	$effect(() => {
		external_library.set(value);
	});
</script>

<!-- svelte-mcp-ignore bind_this_attachment -->
<canvas bind:this={canvas}></canvas>
```

Multiple codes can be listed on one directive (space-separated). Stale codes
(no matching suggestion fired) and typos (unknown code) surface as follow-up
"unused directive" suggestions so the comments don't quietly rot.

Available codes:

- `effect_calls_function`
- `effect_assigns_state`
- `bind_this_attachment`
- `use_action_attachment`
- `derived_with_function`
- `imported_runes`
- `runes_instead_of_store`
- `wrong_property_access_state`
