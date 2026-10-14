# @sveltejs/pi

[pi](https://pi.dev) package for Svelte that provides the Svelte MCP server, skills and instructions.

## Installation

Requires pi 0.99.0 or newer.

```sh
pi install npm:@sveltejs/pi
```

Add `-l` to install it only for the current project (written to `.pi/settings.json`). To try it for a single session without installing:

```sh
pi -e npm:@sveltejs/pi
```

That's it! You now have the Svelte MCP server, the Svelte skills and the Svelte instructions configured automatically.

## Features

### Svelte MCP Server

The package registers the [Svelte MCP server](https://mcp.svelte.dev) which provides:

- **list-sections** - Discover available Svelte 5 and SvelteKit documentation sections
- **get-documentation** - Retrieve full documentation content for specific sections
- **svelte-autofixer** - Analyze Svelte code and get issues/suggestions
- **playground-link** - Generate Svelte Playground links with provided code

In pi the tools are named `mcp__svelte__<tool>` (e.g. `mcp__svelte__svelte_autofixer`). If you already configured the Svelte MCP server in `~/.pi/agent/mcp.json` or `.pi/mcp.json` (under any name), the package uses that one instead of registering a new server.

### Skills

The `svelte-code-writer` and `svelte-core-bestpractices` skills are added to pi. Use `/skill:svelte-code-writer` to load one explicitly.

### Agent Instructions

The package injects instructions in the system prompt that teach the agent how to effectively use the Svelte MCP tools.

### What about subagents?

Unlike the other Svelte plugins, this package doesn't include the `svelte-file-editor` subagent: pi deliberately doesn't ship with subagents. If you want to delegate work to an isolated context, you can ask pi to spawn another instance of itself (e.g. with `pi --print "<task>"`). The spawned instance loads your installed packages too, so it will still have access to the Svelte MCP server, skills and instructions.

## Configuration

Create `svelte.json` to customize how the package configures MCP, instructions, and skills.

```json
{
	"$schema": "https://svelte.dev/pi/schema.json",
	"mcp": {
		"type": "local",
		"enabled": true,
		"exposure": "direct"
	},
	"instructions": {
		"enabled": true
	},
	"skills": {
		"enabled": ["svelte-code-writer", "svelte-core-bestpractices"]
	}
}
```

Run `/reload` after changing the configuration.

### Defaults

- `mcp.type`: `"local"`
- `mcp.enabled`: `true`
- `mcp.exposure`: `"direct"`
- `instructions.enabled`: `true`
- `skills.enabled`: `true`

### Configuration Options

| Option                 | Type                                               | Default    | Description                                                                                              |
| ---------------------- | -------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| `mcp.type`             | `"remote" \| "local"`                              | `"local"`  | Run `@sveltejs/mcp` via `npx` (`local`) or use `https://mcp.svelte.dev/mcp` (`remote`).                  |
| `mcp.enabled`          | `boolean`                                          | `true`     | Enable or disable the Svelte MCP server entry.                                                           |
| `mcp.exposure`         | `"direct" \| "codemode" \| "deferred" \| "hidden"` | `"direct"` | How the MCP tools reach the model. See [pi MCP exposure](https://pi.dev/docs/mcp#control-tool-exposure). |
| `instructions.enabled` | `boolean`                                          | `true`     | Enable or disable the instructions injected in the system prompt.                                        |
| `skills.enabled`       | `boolean \| string[]`                              | `true`     | Enable all skills (`true`), disable all skills (`false`), or enable only specific skill names.           |

### Config File Locations and Precedence

The package reads from these files (lowest priority first, highest priority last):

- `~/.pi/agent/svelte.json` (or `$PI_CODING_AGENT_DIR/svelte.json`)
- `.pi/svelte.json` in the current project (only when the project is trusted)

If the same key is defined in both files, the project one wins.

## License

MIT
