# TUI Plugins

## Contract And Loading

The public contract is `packages/plugin/src/tui.ts`; technical behavior is documented in `packages/opencode/specs/tui-plugins.md`.

```ts
type TuiPlugin = (api: TuiPluginApi, options: Record<string, unknown> | undefined, meta: TuiPluginMeta) => Promise<void>
```

- Import from `@opencode-ai/plugin/tui`.
- Export one default `{ id?, tui }` object. Named exports are ignored by the loader.
- File plugins require an explicit non-empty ID.
- Configure TUI plugins explicitly in `tui.json`; there is no directory auto-discovery.
- JSX uses OpenTUI Solid, normally with `/** @jsxImportSource @opentui/solid */`.
- TUI packages resolve only `exports["./tui"]`; they do not fall back to package `main` or root exports.

## API Routing

| Need                             | API                                        |
| -------------------------------- | ------------------------------------------ |
| Commands and shortcuts           | `api.keymap.registerLayer(...)`            |
| Temporary input context          | `api.mode.push(...)`                       |
| Full-screen UI                   | `api.route.register(...)`, `navigate(...)` |
| Host dialogs and toast           | `api.ui.dialog`, `Dialog*`, `toast(...)`   |
| Reuse the host prompt            | `api.ui.Prompt`                            |
| Inject host UI                   | `api.slots.register(...)`                  |
| Theme tokens and switching       | `api.theme`                                |
| Synced sessions/providers/status | `api.state`                                |
| SDK operations                   | `api.client`                               |
| TUI event stream                 | `api.event.on(...)`                        |
| Persistent shared values         | `api.kv`                                   |
| Host-mediated notification/sound | `api.attention`                            |
| Extra cleanup                    | `api.lifecycle.onDispose(...)`             |

Do not use deprecated `api.command` in new plugins. Register commands and bindings through keymap layers.

## Commands And Modes

```tsx
api.keymap.registerLayer({
  mode: "base",
  commands: [
    {
      name: "acme.demo.open",
      title: "Open demo",
      category: "Plugin",
      namespace: "palette",
      slashName: "demo",
      run() {
        api.route.navigate("acme.demo")
      },
    },
  ],
  bindings: [{ key: "ctrl+shift+m", cmd: "acme.demo.open", desc: "Open demo" }],
})
```

Built-in modes are `base`, `modal`, and `autocomplete`. A layer without `mode` remains active across dialogs and autocomplete, so omit mode only for intentionally global behavior.

For plugin-owned full-screen interaction, push a namespaced mode inside the component and dispose it with Solid cleanup:

```tsx
import { onCleanup } from "solid-js"

const pop_mode = api.mode.push("acme.demo")
onCleanup(pop_mode)
```

## Routes, Dialogs, And Slots

- Reserve `home` and `session` for host routes.
- Namespace route names; duplicate routes are last-registration-wins.
- Unknown routes render fallback UI rather than throwing.
- Use host dialog components for standard interactions and `api.ui.dialog.replace()` for custom dialog content.
- Use route params for serializable navigation state; keep component-local transient state in Solid primitives when appropriate.
- `api.slots.register(...)` returns an assigned ID, not an unregister function.
- Slot registration and other host API resources are scope-tracked automatically.
- Read current slot names and props from `TuiHostSlotMap`, not copied lists.

## State And Persistence

- `api.tuiConfig` and `api.state` are live views, not initialization snapshots.
- `api.kv` is shared by all plugins. Prefix every key with the plugin ID.
- Check readiness where the API exposes it.
- Persist only user preferences or durable plugin state, not derived host state.
- Runtime enablement in KV overrides `tui.json` on startup.

`meta.state` is `first`, `updated`, or `same`. Use it for bounded migration or asset synchronization, not normal rendering behavior.

## Lifecycle

The host automatically scope-tracks commands, keymap resources, routes, event subscriptions, slots, pushed modes, and sound packs.

- `api.lifecycle.signal` aborts before cleanup begins.
- Use `api.lifecycle.onDispose()` for timers, sockets, file watchers, workers, or other plugin-owned resources.
- Initialization failure rolls back tracked resources and does not prevent later plugins from loading.
- Cleanup is reverse-order, awaited, idempotent, and constrained by a total five-second budget.
- Keep cleanup fast and independently safe after partial initialization.

## UI Quality

- Use `api.theme.current` tokens instead of hard-coded colors.
- Use `api.keys` to display shortcuts according to host formatting.
- Make routes responsive to terminal dimensions and usable with keyboard-only input.
- Avoid taking over global shortcuts without a strong reason.
- Prefer host dialogs, prompts, and slots over visually inconsistent reimplementations.
- Send attention through `api.attention.notify()` so the host owns focus, notification, and sound policy.
- Keep notification text privacy-safe.

## Useful Examples

- `.opencode/plugins/tui-smoke.tsx`: broad API smoke implementation.
- `packages/tui/src/feature-plugins/system/which-key.tsx`: focused keymap UI.
- `packages/tui/src/feature-plugins/system/notifications.ts`: attention behavior.
- `packages/tui/src/feature-plugins/system/diff-viewer.tsx`: route/UI integration.
- `packages/tui/src/feature-plugins/home/tips.tsx`: host slot usage.
- `packages/tui/src/feature-plugins/sidebar/context.tsx`: sidebar extension.

## Common Failures

- Expecting `.opencode/plugins` auto-discovery for TUI modules.
- Exporting `{ server, tui }` from one module.
- Omitting the default export, or relying on named exports.
- Omitting an ID for a file plugin.
- Registering an ungated keymap layer accidentally active in modal/autocomplete modes.
- Treating KV as plugin-private.
- Treating `slots.register()` as returning a disposer.
- Expecting `plugins.install()` to activate a plugin; installation and runtime addition are separate.
- Leaking timers or network resources because host tracking only covers host registrations.
