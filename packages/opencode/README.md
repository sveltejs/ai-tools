# @sveltejs/opencode

OpenCode plugin for Svelte that provides the Svelte MCP server, a specialized file editor subagent and instruction files.

## Installation

Add `@sveltejs/opencode` to your OpenCode config (either global or local):

```json
{
	"$schema": "https://opencode.ai/config.json",
	"plugin": ["@sveltejs/opencode"]
}
```

That's it! You now have the Svelte MCP server and the file editor subagent configured automatically.

To configure the plugin from OpenCode's TUI, also add the package to `tui.json`:

```json
{
	"$schema": "https://opencode.ai/tui.json",
	"plugin": ["@sveltejs/opencode"]
}
```

Run `/svelte-plugin` or choose **Configure Svelte plugin** from the command palette. The dialog lets you choose project or global scope before editing the available options, and guides you through finite choices such as built-in skills.

## Features

### Svelte MCP Server

The plugin automatically configures the [Svelte MCP server](https://mcp.svelte.dev) which provides:

- **list-sections** - Discover available Svelte 5 and SvelteKit documentation sections
- **get-documentation** - Retrieve full documentation content for specific sections
- **svelte-autofixer** - Analyze Svelte code and get issues/suggestions
- **playground-link** - Generate Svelte Playground links with provided code

### Svelte File Editor Subagent

A specialized subagent (`svelte-file-editor`) that is automatically used when creating, editing, or reviewing `.svelte`, `.svelte.ts`, or `.svelte.js` files. It fetches relevant documentation and validates code using the Svelte MCP server tools.

### Agent Instructions

The plugin injects instructions that teach the agent how to effectively use the Svelte MCP tools.

## Configuration

Create `svelte.json` to customize how the plugin configures MCP, the Svelte subagent, instructions, and skills.

```json
{
	"$schema": "https://svelte.dev/opencode/schema.json",
	"mcp": {
		"type": "remote",
		"enabled": true
	},
	"subagent": {
		"enabled": true,
		"agents": {
			"svelte-file-editor": {
				"model": "anthropic/claude-sonnet-4-20250514",
				"temperature": 0.7,
				"top_p": 0.9,
				"maxSteps": 20
			}
		}
	},
	"instructions": {
		"enabled": true
	},
	"skills": {
		"enabled": ["svelte-code-writer", "svelte-core-bestpractices"]
	}
}
```

### Defaults

If omitted, the plugin uses these defaults:

- `mcp.type`: `"remote"`
- `mcp.enabled`: `true`
- `subagent.enabled`: `true`
- `subagent.agents`: `{}`
- `instructions.enabled`: `true`
- `skills.enabled`: `true`

### Configuration Options

| Option                                           | Type                  | Default    | Description                                                                                    |
| ------------------------------------------------ | --------------------- | ---------- | ---------------------------------------------------------------------------------------------- |
| `mcp.type`                                       | `"remote" \| "local"` | `"remote"` | Use `https://mcp.svelte.dev/mcp` (`remote`) or run `@sveltejs/mcp` via `npx` (`local`).        |
| `mcp.enabled`                                    | `boolean`             | `true`     | Enable or disable the Svelte MCP server entry.                                                 |
| `subagent.enabled`                               | `boolean`             | `true`     | Enable or disable registration of the `svelte-file-editor` subagent.                           |
| `subagent.agents.svelte-file-editor.model`       | `string`              | main agent | Override the model used by the Svelte file editor subagent.                                    |
| `subagent.agents.svelte-file-editor.temperature` | `number`              | unset      | Set temperature for the subagent.                                                              |
| `subagent.agents.svelte-file-editor.top_p`       | `number`              | unset      | Set top-p sampling for the subagent.                                                           |
| `subagent.agents.svelte-file-editor.maxSteps`    | `number`              | unlimited  | Limit the number of steps the subagent can execute.                                            |
| `instructions.enabled`                           | `boolean`             | `true`     | Enable or disable automatic instruction-file injection.                                        |
| `skills.enabled`                                 | `boolean \| string[]` | `true`     | Enable all skills (`true`), disable all skills (`false`), or enable only specific skill names. |

### Supported Skill Names

When using `skills.enabled` as an array, these built-in names are currently available:

- `svelte-code-writer`
- `svelte-core-bestpractices`

### Config File Locations and Precedence

The plugin reads from these files (lowest priority first, highest priority last):

- `~/.config/opencode/svelte.json`
- `$OPENCODE_CONFIG_DIR/svelte.json` (when `OPENCODE_CONFIG_DIR` is set)
- `.opencode/svelte.json` in the current project

If the same key is defined in multiple files, the later location overrides earlier ones.

## License

MIT
