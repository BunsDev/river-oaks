# Desktop cross-platform identity (#370)

**Objective.** Give the packaged desktop app an icon on every platform, Windows file
metadata and an app user model ID, a decided Linux executable name, and Studio host
executable resolution that works or declines clearly on Windows. No installer,
signing or CI changes (#371, #372).

**Branch / worktree.** `feat/desktop-platform-identity` in
`../river-oaks-desktop-platform-identity-20261014`, from `origin/main` 489a60e4.
Register task `desktop-platform-identity`.

## Assumptions rechecked against source (2026-10-14)

- `desktop/package.js`: packager call passes no `icon` and no `win32metadata`;
  `name` and `executableName` are both `TypeSafe Place` on every platform;
  `appBundleId` and `extendInfo` present. Confirmed.
- `desktop/main.js`: `app.setName('TypeSafe Place')` only; no
  `app.setAppUserModelId`. Confirmed.
- `resolveExecutable` (`desktop/studio-agent-host.js`): joins `PATH` dirs and
  `~/.local/bin`, `/opt/homebrew/bin`, `/usr/local/bin`, then `access(X_OK)`;
  no PATHEXT handling. Confirmed. The designer host repeats the same extra
  directory list for the spawned process `PATH`. Confirmed.
- Icon assets: none committed. The only `.icns` files are Electron's default
  inside `dist/` and the Unreal project's, both unrelated. Confirmed.
- Native menu: there are no agent or designer menu items in `main.js`; the
  Studio page reaches both hosts over IPC. "Gate the menu items off" therefore
  means: the host catalog reports the provider unavailable and `send` fails with
  a message that says why. Issue wording adjusted accordingly.
- `runStudioCommand` spawns with `shell: false`. Node refuses to spawn `.cmd`
  and `.bat` files without a shell (EINVAL), and a shell would expose prompt
  text to `cmd.exe` parsing, so Windows resolution accepts only `.exe`/`.com`.

## Files owned

`desktop/package.js`, `desktop/package-options.js`, `desktop/identity.js`,
`desktop/icon/**`, `desktop/main.js` (identity line only),
`desktop/studio-agent-host.js` (`resolveExecutable`, extra dirs, not-found text),
`desktop/studio-designer-host.js` (extra dirs only), `desktop/package-files.js`,
`desktop/tests/package-options.test.js`, `desktop/tests/package-files.test.js`,
`desktop/tests/studio-agent-host.test.js`, `docs/desktop.md`, this ledger.

## Checks

- `pnpm run test:desktop`
- `pnpm run build`
- `pnpm run verify`
- `pnpm run desktop:package` then `pnpm exec electron-fuses read --app "dist/desktop/TypeSafe Place-darwin-arm64/TypeSafe Place.app"`
- `RIVER_OAKS_ACCEPTANCE_FIXTURE=1 RIVER_OAKS_DEV_TOWN_PORT=8797 pnpm run test:desktop:e2e --dev`

## Results

| Check | Result |
| --- | --- |
| `pnpm run test:desktop` before changes | 54 pass, 0 fail, 0 skipped |
| `pnpm run test:desktop` after changes | 61 pass, 0 fail, 0 skipped (6 packaging-option tests, 1 Windows resolution test added) |
| `pnpm run build` | exit 0 |
| `pnpm run verify` (core) | exit 0, `.runtime/agent/core.json` status passed. Suites: scripts 76 pass; preview 3012 pass / 1 skipped of 3013; server 486 pass / 140 skipped of 626 (Redis and live-service gates); desktop 61 pass; pytest 141 passed; secrets scan clean |
| `pnpm run desktop:package` + `electron-fuses read` | exit 0; the bundle's `Resources/electron.icns` is byte-identical to `desktop/icon/typesafe-place.icns`; `CFBundleIdentifier` works.jev.river-oaks; all nine fuses read back exactly as `desktop/fuses.js` sets them (RunAsNode, NodeOptions, NodeCliInspect, CookieEncryption, V8Snapshot, FileProtocolExtraPrivileges disabled; AsarIntegrity, OnlyLoadAppFromAsar, WasmTrapHandlers enabled). Packager warning about the optional `.icon` (Icon Composer) format is expected |
| `RIVER_OAKS_ACCEPTANCE_FIXTURE=1 RIVER_OAKS_DEV_TOWN_PORT=8797 pnpm run test:desktop:e2e --dev` | exit 0, report status passed, errors []; `data/reports/desktop-development.json` refreshed by the run |
| `node scripts/agent.mjs verify desktop` | passed; receipt `.runtime/agent/desktop.json` (the issue names `desktop-tests.json`; `desktop-tests` is the task inside the `desktop` profile, and the receipt is named after the profile) |

## Gaps

- Windows and Linux packaging are proven by #371, not here.
- Finder icon check is visual; recorded by hand.

## Next step

Finish verify, package, fuse read and e2e; commit; open PR; comment on #370.
