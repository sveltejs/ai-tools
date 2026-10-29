# @sveltejs/mcp

The CLI version of the Svelte MCP.

You can run it directly with

```bash
npx @sveltejs/mcp
```

or install it and then run it

```bash
pnpm i @sveltejs/mcp
pnpm svelte-mcp
```

## Restricting the available tools

By default every tool is exposed. To only enable some of them pass a comma separated allow-list with `--tools` or the `SVELTE_MCP_TOOLS` environment variable:

```bash
npx @sveltejs/mcp --tools list-sections,get-documentation,svelte-autofixer
SVELTE_MCP_TOOLS=list-sections,get-documentation,svelte-autofixer npx @sveltejs/mcp
```

Tools not in the list are not registered at all. The server refuses to start if the list contains an unknown tool name.
