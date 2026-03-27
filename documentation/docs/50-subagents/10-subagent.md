---
title: Overview
---

Since creating, editing or analyzing a Svelte file is an atomic operation we recommend creating a sub-agent that your main agent can invoke whenever it needs to interact with a Svelte component. You can write your own or take inspiration from the one available in the [`ai-tools`](https://github.com/sveltejs/ai-tools/tree/main/tools/agents) repository: a specialized subagent called `svelte-file-editor` designed for creating, editing, and reviewing Svelte files.

<details>
	<summary>View subagent definition</summary>

<!-- prettier-ignore-start -->
````markdown
@include .generated/subagent.md
````
<!-- prettier-ignore-end -->

</details>

## Benefits

The subagent has access to its own context window, allowing it to fetch the documentation, iterate with the `svelte-autofixer` tool and write to the file system without wasting context in the main agent.

The delegation should happen automatically when appropriate, but you can also explicitly request the subagent be used for Svelte-related tasks.
