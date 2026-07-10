# Packaging And Testing

## Local Configuration

Server plugin in `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["./plugins/server.ts", ["package-name", { "key": "value" }]]
}
```

Server files under `.opencode/plugin/` or `.opencode/plugins/` are also auto-discovered. Relative configured paths resolve from the config file that declared them.

TUI plugin in `tui.json`:

```json
{
  "$schema": "https://opencode.ai/tui.json",
  "plugin": [["./plugins/tui.tsx", { "key": "value" }]],
  "plugin_enabled": {
    "acme.demo": true
  }
}
```

`plugin_enabled` uses the resolved plugin ID, not its package or file spec. Persisted runtime enablement can override config.

After editing plugin or config-time files, restart OpenCode; the running session keeps its loaded configuration and modules.

## npm Package Shape

Publish separate target-only entrypoints:

```json
{
  "name": "@acme/opencode-plugin",
  "type": "module",
  "exports": {
    "./server": {
      "import": "./dist/server.js",
      "config": { "serverOption": true }
    },
    "./tui": {
      "import": "./dist/tui.js",
      "config": { "tuiOption": true }
    }
  },
  "engines": {
    "opencode": "^1.0.0"
  },
  "peerDependencies": {
    "@opencode-ai/plugin": "^1.0.0"
  }
}
```

- Server resolution prefers `exports["./server"]` and may fall back to `main`.
- TUI resolution requires `exports["./tui"]`; it does not use `main`.
- A package supporting both targets needs separate source and output files.
- `exports[target].config` may provide default options written during first install.
- Use `engines.opencode` to declare tested compatibility.
- npm compatibility is checked; local file plugins bypass the engine check.
- Pin package versions when reproducibility matters.
- Plugin package install runs with lifecycle scripts disabled, so do not require `postinstall`.
- Keep resolved entrypoints and theme paths inside the package directory.

Theme-only TUI packages may use `oc-themes`; consult `packages/opencode/specs/tui-plugins.md` for path and synchronization rules.

## Resolution And Identity

- npm declarations deduplicate by package name; higher-precedence/later declarations win.
- File server and TUI specs have target-specific resolution behavior.
- External modules may resolve/import in parallel, but activate sequentially.
- IDs must not collide with built-ins or other loaded plugins.
- Dynamic import failures are effectively permanent for the current process because Bun caches them.
- `--pure` or `OPENCODE_PURE` skips external plugins.

Read `packages/opencode/src/plugin/shared.ts`, `loader.ts`, and `install.ts` before changing packaging behavior.

## Test Locations

Server plugin coverage:

- `packages/opencode/test/plugin/trigger.test.ts`: hook sequencing and failures.
- `packages/opencode/test/plugin/loader-shared.test.ts`: resolution and module validation.
- `packages/opencode/test/plugin/shared.test.ts`: shared target rules.
- `packages/opencode/test/plugin/install.test.ts`: package install and config patching.
- `packages/opencode/test/plugin/install-concurrency.test.ts`: concurrent writes.
- `packages/opencode/test/plugin/auth-override.test.ts`: auth precedence.
- `packages/opencode/test/tool/registry.test.ts`: schemas, results, and attachments.

TUI plugin coverage:

- `packages/opencode/test/cli/tui/plugin-loader.test.ts`: loading and ordering.
- `packages/opencode/test/cli/tui/plugin-loader-entrypoint.test.ts`: target entrypoints.
- `packages/opencode/test/cli/tui/plugin-lifecycle.test.ts`: rollback and cleanup.
- `packages/opencode/test/cli/tui/plugin-toggle.test.ts`: persisted enablement.
- `packages/opencode/test/cli/tui/plugin-add.test.ts`: runtime addition.
- `packages/opencode/test/cli/tui/plugin-install.test.ts`: installation.
- `packages/opencode/test/cli/tui/plugin-loader-pure.test.ts`: pure mode.

Use fixture helpers under `packages/opencode/test/fixture/` rather than reimplementing the loader in tests.

## Verification Commands

Run from the owning package, never the repository root:

```sh
cd packages/opencode
bun typecheck
bun test test/plugin/trigger.test.ts
bun test test/cli/tui/plugin-lifecycle.test.ts
```

Select the smallest relevant tests first, then broader plugin suites. For interactive TUI verification, follow `packages/opencode/AGENTS.md`: run `bun dev` in detached `tmux`, capture output, and explicitly stop the session.

## Publishing Checklist

- Build output is ESM-compatible and contains no source-only path aliases.
- Every advertised target has the correct package export.
- Each target module exports only its own target shape.
- Peer/runtime dependencies are classified correctly.
- `engines.opencode` matches tested versions.
- Default options are backward-compatible and validated at runtime.
- Local file, pinned npm, and bare npm specs have been considered.
- Loading, failure, cleanup, and upgrade behavior are tested.
- README examples match the exported API and config target.
