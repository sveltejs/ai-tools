---
name: writing-opencode-plugins
description: OpenCode plugins, @opencode-ai/plugin, @opencode-ai/plugin/tui, plugin hooks, custom tools, TUI routes, slots, keymaps, and packaging. Use when creating, editing, reviewing, testing, or publishing server or TUI plugins for OpenCode.
metadata:
  internal: true
---

# Writing OpenCode Plugins

Use this skill to implement production-quality OpenCode plugins. Treat the repository's exported types and runtime as authoritative because plugin APIs are evolving and public docs may lag.

## Start Here

1. Decide which runtime owns the feature.
2. Read the relevant public type before writing code.
3. Find one focused in-repository example using the same API.
4. Implement the smallest target-specific module.
5. Test loading, behavior, failure, and cleanup in the owning package.

| Need                                                                 | Plugin target               | Import                         | Configuration                                                    |
| -------------------------------------------------------------------- | --------------------------- | ------------------------------ | ---------------------------------------------------------------- |
| Hooks, tools, auth, providers, model parameters, shell environment   | Server                      | `@opencode-ai/plugin`          | `opencode.json` or auto-discovered `.opencode/plugins/*.{ts,js}` |
| Commands, keybindings, routes, dialogs, slots, themes, notifications | TUI                         | `@opencode-ai/plugin/tui`      | Explicit `tui.json` `plugin` entry                               |
| Both                                                                 | Two target-only entrypoints | Both imports in separate files | Package exports `./server` and `./tui`                           |

Never export `server` and `tui` from the same module. Do not use server event hooks as a substitute for interactive TUI APIs.

## Verify The Current Contract

Read these files before implementing unfamiliar behavior:

- `packages/plugin/src/index.ts`: authoritative server plugin and hook types.
- `packages/plugin/src/tool.ts`: custom tool schema, context, permission, metadata, attachments, and result types.
- `packages/plugin/src/tui.ts`: authoritative TUI API and module types.
- `packages/opencode/specs/tui-plugins.md`: TUI loading, packaging, lifecycle, and API semantics.
- `packages/opencode/src/plugin/shared.ts`: target validation, IDs, and entrypoint resolution.
- `packages/opencode/src/plugin/loader.ts`: install, compatibility, and import behavior.

If these disagree with examples or website docs, follow exported types and runtime behavior, then update stale documentation when appropriate.

## Choose A Module Shape

Prefer the explicit module object for new server plugins:

```ts
import type { Plugin, PluginModule } from '@opencode-ai/plugin';

const server: Plugin = async ({ client, directory }, options) => ({
	dispose: async () => {},
});

export default {
	id: 'acme.example',
	server,
} satisfies PluginModule & { id: string };
```

Legacy server-only local plugins may export a plugin function directly. In a legacy module every distinct named export is interpreted as a plugin, so do not export unrelated constants. Prefer a default module object for new code.

TUI plugins always use a default module object:

```tsx
/** @jsxImportSource @opentui/solid */
import type { TuiPlugin, TuiPluginModule } from '@opencode-ai/plugin/tui';

const tui: TuiPlugin = async (api) => {
	api.ui.toast({ message: 'Plugin loaded' });
};

export default {
	id: 'acme.example-tui',
	tui,
} satisfies TuiPluginModule & { id: string };
```

File plugins require a stable, non-empty `id`. npm plugins may derive the ID from the package name, but an explicit namespaced ID makes state, diagnostics, and collision handling clearer.

## Engineering Rules

- Use TypeScript and `satisfies` against the public plugin type.
- Parse and validate `options`; they arrive as unvalidated `Record<string, unknown>`.
- Namespace plugin IDs, command IDs, route names, modes, slot names, and shared KV keys.
- Use the directory supplied by the plugin or tool context, not `process.cwd()`.
- Honor `AbortSignal` for long-running or cancellable work.
- Use `client.app.log()` for structured server logging instead of `console.log`.
- Request permission before sensitive or consequential custom-tool work.
- Keep notifications privacy-safe; do not expose prompts, secrets, paths, commands, or raw errors.
- Register only needed hooks and UI resources. Avoid broad event subscriptions when a specific hook exists.
- Make cleanup bounded, idempotent, and safe after partial initialization.
- Do not depend on undocumented load order to resolve ownership conflicts.

## Testing Workflow

Server plugin tests belong under `packages/opencode/test/plugin/` or the closest owning subsystem. TUI runtime tests belong under `packages/opencode/test/cli/tui/`; component-level TUI tests may belong in `packages/tui`.

Test at least:

- valid loading and target/entrypoint selection;
- configured options and malformed options;
- the observable behavior, not a duplicate of implementation logic;
- abort, failure, and partial-initialization behavior;
- cleanup or disposal;
- duplicate IDs or registrations when relevant;
- local file and npm packaging behavior when publishing.

Run tests from the package directory, never the repository root. Use `bun typecheck` from the owning package for type checking.

## Review Checklist

- The feature is in the correct server or TUI runtime.
- Module shape and import path match the target.
- Server and TUI entrypoints are separate.
- IDs and persistent keys are stable and namespaced.
- Options and external data are validated.
- Hook output mutation preserves other plugins' changes.
- Tools use context directory, permission, metadata, and abort correctly.
- TUI keybindings are mode-gated unless intentionally global.
- TUI resources and custom side effects are disposed.
- Package exports, `engines.opencode`, and config target are correct.
- Tests cover behavior and lifecycle.

## References

- [Server plugins](references/server-plugins.md): hooks, custom tools, lifecycle, and examples.
- [TUI plugins](references/tui-plugins.md): keymaps, routes, dialogs, slots, state, and lifecycle.
- [Packaging and testing](references/packaging-testing.md): config, package exports, compatibility, and test locations.
