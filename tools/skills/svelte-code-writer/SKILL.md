---
name: svelte-code-writer
description: CLI tools for Svelte 5 documentation lookup and code analysis. MUST be used whenever creating, editing or analyzing any Svelte component (.svelte) or Svelte module (.svelte.ts/.svelte.js). If possible, this skill should be executed within the svelte-file-editor agent for optimal results.
---

## CLI tools

You have access to `@sveltejs/mcp` CLI for Svelte-specific assistance. Use these commands via `npx`:

### Choose the documentation version

Before fetching documentation, check `package.json` dependencies and devDependencies for the relevant Svelte or SvelteKit version. If the version uses a catalog or workspace reference, resolve it from the referenced configuration or lockfile.

For a Next release (the `next` tag or a corresponding prerelease version), set `SVELTE_MCP_NEXT=true` on both documentation commands to fetch from `next.svelte.dev`:

```bash
SVELTE_MCP_NEXT=true npx @sveltejs/mcp list-sections
SVELTE_MCP_NEXT=true npx @sveltejs/mcp get-documentation 'svelte/$state,kit/routing'
```

For stable releases, leave the variable unset or set it to `false` to use `svelte.dev`. If Next mode is enabled for a project that isn't using a Next release, tell the user to unset `SVELTE_MCP_NEXT` or set it to `false` in their configuration: Next documentation may be ahead of or behind their installed version. Use `SVELTE_MCP_NEXT=false` on CLI documentation commands to override an inherited Next setting for that project.

This variable selects documentation for `list-sections` and `get-documentation`; it does not change the version used by `svelte-autofixer`.

### List documentation sections

```bash
npx @sveltejs/mcp list-sections
```

Lists all available Svelte 5 and SvelteKit documentation sections with titles and paths.

### Get documentation

```bash
npx @sveltejs/mcp get-documentation "<section1>,<section2>,..."
```

Retrieves full documentation for specified sections. Use after `list-sections` to fetch relevant docs.

**Example:**

```bash
npx @sveltejs/mcp get-documentation "$state,$derived,$effect"
```

### Svelte autofixer

```bash
npx @sveltejs/mcp svelte-autofixer "<code_or_path>" [options]
```

Analyzes Svelte code and suggests fixes for common issues.

**Options:**

- `--async` - Enable async Svelte mode (default: false)
- `--svelte-version` - Target version: 4 or 5 (default: 5)

**Examples:**

```bash
# Analyze inline code (escape $ as \$)
npx @sveltejs/mcp svelte-autofixer '<script>let count = \$state(0);</script>'

# Analyze a file
npx @sveltejs/mcp svelte-autofixer ./src/lib/Component.svelte

# Target Svelte 4
npx @sveltejs/mcp svelte-autofixer ./Component.svelte --svelte-version 4
```

**Important:** When passing code with runes (`$state`, `$derived`, etc.) via the terminal, escape the `$` character as `\$` to prevent shell variable substitution.

## Workflow

1. **Uncertain about syntax?** Run `list-sections` then `get-documentation` for relevant topics
2. **Reviewing/debugging?** Run `svelte-autofixer` on the code to detect issues
3. **Always validate** - Run `svelte-autofixer` before finalizing any Svelte component
