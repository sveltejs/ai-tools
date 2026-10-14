# Server Plugins

## Contract And Lifecycle

The public contract is `packages/plugin/src/index.ts`:

```ts
type Plugin = (input: PluginInput, options?: Record<string, unknown>) => Promise<Hooks>
```

`PluginInput` provides the SDK `client`, `project`, `directory`, `worktree`, `serverUrl`, Bun shell `$`, and experimental workspace registration.

The server runtime is `packages/opencode/src/plugin/index.ts`.

- Built-in plugins initialize before external plugins.
- External modules may resolve concurrently, but activation is sequential for deterministic hook order.
- `config` hooks run sequentially against the mutable merged config.
- `event` subscribes to location-filtered events and is fire-and-forget.
- Ordinary hooks run sequentially and share a mutable output object.
- Ordinary hook failures propagate and stop later hooks for that trigger.
- Initialization, config, and disposal failures are isolated and logged by the host.
- `dispose` runs when the per-directory plugin scope closes.

Mutate hook output in place. Preserve values contributed by earlier plugins: append arrays, merge maps, and change only fields the plugin owns.

## Hook Selection

Use the narrowest hook that expresses the behavior:

| Goal                               | Hook                              |
| ---------------------------------- | --------------------------------- |
| Observe SDK events                 | `event`                           |
| Modify merged configuration        | `config`                          |
| Add tools                          | `tool`                            |
| Add provider authentication        | `auth`                            |
| Add or change provider models      | `provider`                        |
| Modify incoming user message       | `chat.message`                    |
| Modify LLM parameters or headers   | `chat.params`, `chat.headers`     |
| Modify command parts               | `command.execute.before`          |
| Validate or rewrite tool arguments | `tool.execute.before`             |
| Transform tool presentation/result | `tool.execute.after`              |
| Modify model-facing tool schemas   | `tool.definition`                 |
| Add shell environment variables    | `shell.env`                       |
| Influence permission decisions     | `permission.ask`                  |
| Customize compaction               | `experimental.session.compacting` |

Read the complete `Hooks` interface before using experimental hooks.

## Custom Tools

Use `tool()` and Zod schemas from `tool.schema`:

```ts
import { type Plugin, tool } from "@opencode-ai/plugin"

export default (async () => ({
  tool: {
    lookup_issue: tool({
      description: "Look up one issue by numeric ID",
      args: {
        id: tool.schema.number().int().positive().describe("Issue ID"),
      },
      async execute(args, context) {
        await context.ask({
          permission: "lookup_issue",
          patterns: [String(args.id)],
          always: ["*"],
          metadata: { id: args.id },
        })
        context.metadata({ title: `Issue ${args.id}` })

        return {
          title: `Issue ${args.id}`,
          output: "Result",
          metadata: { id: args.id },
        }
      },
    }),
  },
})) satisfies Plugin
```

Tool rules:

- Write descriptions for the model, including when to use the tool and important constraints.
- Describe arguments individually and constrain them in the schema.
- Use `context.directory` and `context.worktree` for path resolution.
- Pass `context.abort` into cancellable I/O.
- Call `context.ask()` before performing work covered by a permission boundary.
- Use `context.metadata()` for in-progress presentation; return final metadata in the result.
- Return attachments only as declared file attachments with a MIME type and URL.
- Keep output useful and bounded. The host may truncate large results and add truncation metadata.

Plugin tools with built-in IDs take precedence, but overriding built-ins should be explicit and tested.

## Auth And Providers

Use existing built-ins as references rather than inventing OAuth behavior:

- `packages/opencode/src/plugin/azure.ts`: simple API-key prompt.
- `packages/opencode/src/plugin/xai.ts`: OAuth, refresh, and custom fetch behavior.
- `packages/opencode/src/plugin/openai/codex.ts`: auth plus chat parameter hooks.
- `packages/opencode/src/plugin/github-copilot/copilot.ts`: full auth/provider integration.

Do not log credentials, tokens, authorization codes, provider headers, or raw auth responses. Preserve provider identity and refresh semantics defined by `AuthHook`.

## Useful Examples

- `.opencode/plugins/model-task.ts`: custom subagent tool with permission, abort, metadata, and SDK calls when present in the worktree.
- `packages/plugin/src/example.ts`: minimal package example.
- `packages/opencode/test/fixture/agent-plugin.ts`: config mutation fixture.
- `packages/opencode/src/plugin/*.ts`: built-in auth/provider implementations.

## Common Failures

- Exporting constants beside legacy plugin functions: every exported value may be treated as a plugin.
- Using `process.cwd()` in a multi-directory process.
- Replacing a shared output map or array and deleting earlier plugin contributions.
- Forgetting that `event` is not awaited like ordinary hooks.
- Assuming thrown hook errors are isolated.
- Installing a missing dependency after a dynamic import failed and expecting the same process to recover; Bun caches failed imports.
- Trusting options without validation.
