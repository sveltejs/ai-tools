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

The default configuration:

```json
{
	"$schema": "https://raw.githubusercontent.com/sveltejs/ai-tools/refs/heads/main/packages/opencode/schema.json",
	"mcp": {
		"type": "remote",
		"enabled": true
	},
	"subagent": {
		"enabled": true
	},
	"instructions": {
		"enabled": true
	}
}
```

### Configuration Options

| Option                 | Type                    | Default    | Description                                                                      |
| ---------------------- | ----------------------- | ---------- | -------------------------------------------------------------------------------- |
| `mcp.type`             | `"remote"` \| `"local"` | `"remote"` | Use the remote server at `mcp.svelte.dev` or run locally via `npx @sveltejs/mcp` |
| `mcp.enabled`          | `boolean`               | `true`     | Enable/disable the MCP server                                                    |
| `subagent.enabled`     | `boolean`               | `true`     | Enable/disable the Svelte file editor subagent                                   |
| `instructions.enabled` | `boolean`               | `true`     | Enable/disable agent instructions injection                                      |

### Config File Location

Place your configuration at one of these locations:

- `~/.config/opencode/svelte.json` (global)
- `$OPENCODE_CONFIG_DIR/svelte.json` (if `OPENCODE_CONFIG_DIR` is set, takes priority)

## License

MIT
