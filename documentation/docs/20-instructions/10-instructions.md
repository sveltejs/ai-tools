---
title: Instructions
---

To get the most out of the MCP server/skills we recommend including the following prompt in your [`AGENTS.md`](https://agents.md) (or [`CLAUDE.md`](https://docs.claude.com/en/docs/claude-code/memory#claude-md-imports), if using Claude Code. Or [`GEMINI.md`](https://geminicli.com/docs/cli/gemini-md/), if using GEMINI). This will tell the LLM which tools are available and when it's appropriate to use them.

> [!NOTE] This is already setup for you when using `npx sv add mcp`

<!-- prettier-ignore-start -->
````markdown
@include .generated/agents.md
````
<!-- prettier-ignore-end -->
