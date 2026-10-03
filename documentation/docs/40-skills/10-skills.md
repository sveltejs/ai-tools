---
title: Overview
---

This is the list of available skills provided by Svelte. Skills are sets of instructions that AI agents can load on-demand to help with specific tasks.

Skills are available in the Claude Code plugin, the Codex CLI plugin, the GitHub Copilot CLI plugin, and the OpenCode plugin (`@sveltejs/opencode`). They can also be manually installed in your `.claude/skills`, `.copilot/skills`, or `.opencode/skills` folder.

You can download the latest skills from the [releases page](https://github.com/sveltejs/ai-tools/releases) of the repo, or find them in the [`tools/skills`](https://github.com/sveltejs/ai-tools/tree/main/tools/skills) folder.

## Opt-in autofixer feedback

The `svelte-mcp-feedback` skill tells the agent to check for opportunities to improve the MCP autofixer when you correct a Svelte or SvelteKit mistake an agent made. It creates an issue in [`sveltejs/ai-tools`](https://github.com/sveltejs/ai-tools) using the GitHub CLI, or opens a prefilled issue form for you to submit when the CLI is unavailable.

Since we want this to be completely opt-in it's not bundled with any plugin and you must install it separately. To do it, download the standalone `svelte-mcp-feedback` skill from the releases page, copy `tools/skills/svelte-mcp-feedback` into your client's skills directory or use your favorite skills manager.

@include .generated/skills.md
