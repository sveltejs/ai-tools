---
title: Overview
---

Since creating, editing or analyzing a Svelte file is an atomic operation we recommend creating a subagent that your main agent can invoke whenever it needs to interact with a Svelte component. Subagents use a separate context window, allowing them to fetch documentation, iterate with [`svelte-autofixer`](tools#svelte-autofixer) and write to the filesystem without wasting context in the main agent.

Delegation should happen automatically when appropriate, but you can also explicitly request the subagent be used for Svelte-related tasks.

You can write your own or take inspiration from the one available in the [`sveltejs/ai-tools`](https://github.com/sveltejs/ai-tools/tree/main/tools/agents) repository: a specialized subagent called `svelte-file-editor` designed for creating, editing, and reviewing Svelte files.

<details>
	<summary>View subagent definition</summary>

<!-- prettier-ignore-start -->
````markdown
@include .generated/subagent.md
````
<!-- prettier-ignore-end -->

</details>
