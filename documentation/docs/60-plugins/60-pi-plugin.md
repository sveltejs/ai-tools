---
title: Pi
---

[Pi](https://pi.dev) supports [packages](https://pi.dev/docs/packages) that bundle extensions and skills. Svelte has a Pi package published under `@sveltejs/pi`.

## Installation

With Pi 0.99.0 or newer, install the package from the command line:

```sh
pi install npm:@sveltejs/pi
```

Add `-l` to install it only for the current project.

That's it! You now have the Svelte [MCP server](mcp), [skills](skills) and the [instructions](instructions) configured for you.

If you already configured the Svelte MCP server in your `mcp.json`, the package will use that instead of registering a new one.

> [!NOTE] Unlike the other plugins, the Pi package doesn't include the `svelte-file-editor` [subagent](subagent), as Pi deliberately doesn't ship with subagents. If you want to delegate work to an isolated context, you can ask Pi to spawn another instance of itself (e.g. with `pi --print "<task>"`). The spawned instance loads your installed packages too, so it will still have access to the Svelte MCP server, skills and instructions.

## Configuration

By default, the MCP server, skills and instructions are enabled. You can customize them by creating a `svelte.json` file:

- locally, in `.pi/svelte.json` (only read in trusted projects)
- globally, in `~/.pi/agent/svelte.json`

```json
{
	"$schema": "https://svelte.dev/pi/schema.json",
	"mcp": {
		"type": "local", // or "remote"; defaults to local
		"enabled": true,
		"exposure": "direct" // or "codemode", "deferred", "hidden"; defaults to direct
	},
	"instructions": {
		"enabled": true
	},
	"skills": {
		"enabled": true // or an array of skill names, e.g. ["svelte-code-writer"]
	}
}
```

Run `/reload` after changing the configuration.
