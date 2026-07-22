---
title: AGENTS.md
---

To get the most out of the [MCP server](mcp) and [skills](skills) we recommend including the following prompt in your [`AGENTS.md`](https://agents.md) (or [`CLAUDE.md`](https://docs.claude.com/en/docs/claude-code/memory#claude-md-imports) or [`GEMINI.md`](https://geminicli.com/docs/cli/gemini-md/), if using Claude Code or Gemini). This will tell your agent which tools are available and when it is appropriate to use them.

> [!NOTE] This is already setup for you when using `npx sv add ai-tools`

<!-- prettier-ignore-start -->
````markdown
@include .generated/agents.md
````
<!-- prettier-ignore-end -->
