---
name: svelte-code-writer
description: CLI tools for Svelte 5 documentation lookup and code analysis. MUST be used whenever creating, editing or analyzing any Svelte component (.svelte) or Svelte module (.svelte.ts/.svelte.js). If possible, this skill should be executed within the svelte-file-editor agent for optimal results.
---

## CLI tools

You have access to `@sveltejs/mcp` CLI for Svelte-specific assistance. Use these commands via `npx`:

### Choose the documentation version

Before fetching documentation, check `package.json` dependencies and devDependencies for the relevant Svelte or SvelteKit version. If the version uses a catalog or workspace reference, resolve it from the referenced configuration or lockfile.

To use documentation from a subdomain of `svelte.dev`, set `SVELTE_MCP_SUBDOMAIN` on both documentation commands. For example, for a Next release (the `next` tag or a corresponding prerelease version), use `next` to fetch from `next.svelte.dev`:

```bash
SVELTE_MCP_SUBDOMAIN=next npx @sveltejs/mcp list-sections
SVELTE_MCP_SUBDOMAIN=next npx @sveltejs/mcp get-documentation 'svelte/$state,kit/routing'
```

Replace `next` with the subdomain appropriate for the project (a single DNS label, not a full URL). For stable releases, leave the variable unset or empty to use `svelte.dev`. If the selected docs don't match the installed version, tell the user to update or unset `SVELTE_MCP_SUBDOMAIN`: these docs may describe unavailable or outdated APIs. Use `SVELTE_MCP_SUBDOMAIN=` on CLI documentation commands to override an inherited setting for that project.

If the selected subdomain's documentation index is unavailable or invalid, the server falls back to `svelte.dev`. When the output reports this fallback, warn the user that the requested docs couldn't be loaded and that the returned default docs may not match their installed version.

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
