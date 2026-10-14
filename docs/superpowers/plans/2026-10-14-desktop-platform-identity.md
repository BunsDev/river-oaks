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
Windows unit-test pass (2026-10-14, session river-oaks-97): also
`desktop/tests/fixture-command.js`, `desktop/tests/studio-designer-host.test.js`,
`desktop/tests/studio-skill-pack.test.js`.

## Checks

- `pnpm run test:desktop`
- `pnpm run build`
- `pnpm run verify`
- `pnpm run desktop:package` then `pnpm exec electron-fuses read --app "dist/desktop/TypeSafe Place-darwin-arm64/TypeSafe Place.app"`
- `RIVER_OAKS_ACCEPTANCE_FIXTURE=1 RIVER_OAKS_DEV_TOWN_PORT=8797 pnpm run test:desktop:e2e --dev`
- `pnpm run test:desktop` on `windows-latest`, `ubuntu-latest` and `macos-latest`
  through a temporary push-only workflow on `diag/desktop-tests-matrix` (deleted
  after use, never merged; #377's `desktop.yml` is not touched)

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


### Windows unit tests (2026-10-14, session river-oaks-97)

Each failure from #371 run 38625146725 (17 of 54 on `windows-latest`) was
confirmed against its log and source before changing anything. A baseline diag
run at this branch's head before the fixes, 38651982154 (`c8af4a6f`), failed 18
of 61 on Windows: the same 17 plus one regression #379 had introduced.

| Test (file) | Windows cause, confirmed | Fix |
| --- | --- | --- |
| the packaged app includes every desktop module main.js loads (`package-files`) | `path.join` gave `scripts\studio-skill-pack.js`; the staged set uses `/` | Walk specifiers with `path.posix` |
| 5 agent-host tests: Claude path, Codex path, declined consent/errors/cancellation, scene context allowlist, rate limit (`studio-agent-host`) | The `.mjs` fixture was spawned directly; Windows `spawn` without a shell refuses a script (`EFTYPE`), reported as "CLI failed" | Tests pass `runFixtureCommand` (`desktop/tests/fixture-command.js`): `process.execPath` + script on win32, direct spawn elsewhere |
| 5 designer-host tests plus the restart test and its restart/disconnect/cancel subtests (`studio-designer-host`) | Same `spawn EFTYPE` at `studio-command.js` | Same wrapper, including the tests that wrapped `runStudioCommand` themselves |
| FIFO skill files and receipt (`studio-skill-pack`) | Git Bash's `mkfifo` made an MSYS emulation that Node reads as a regular file, so verification saw a hash mismatch, not `unsafe-path` | FIFO case kept where the OS has FIFOs, now asserting `isFIFO()`; a directory case runs on every platform. Windows has no file-system FIFO (named pipes live only in `\\.\pipe\`), so no workspace path can block an open there |
| retries an interrupted owned install (`studio-skill-pack`) | Not `O_WRONLY`: the hook matched `target.endsWith(pack.files[1].path)`, and the installer's Windows path has backslashes | Compare resolved paths. Run 38652621873 passed on Windows with the `O_WRONLY` check unchanged, which shows the flag is present there |
| executable lookup searches PATH and extra user install directories (`studio-agent-host`, new in #379) | #379's Windows rule accepts only `.exe`/`.com`, so the `.mjs` fixture is correctly refused on a Windows host | Expectation follows the host; the win32 synthetic test now also covers extra install directories. Depends on Val's open `.exe`-only decision |

No production code changed: `studio-command.js`, both hosts, `scripts/studio-skill-pack.js`,
fuses, asar staging and renderer isolation are untouched by these commits.

| Diag run | Tree | windows-latest | ubuntu-latest | macos-latest |
| --- | --- | --- | --- | --- |
| [38651982154](https://github.com/BunsDev/river-oaks/actions/runs/38651982154) | `c8af4a6f` (before) | 43 pass, 18 fail of 61 | 61 pass | 61 pass |
| [38652621873](https://github.com/BunsDev/river-oaks/actions/runs/38652621873) | `babe4007` (test fixes) | 61 pass | 61 pass | 61 pass |
| [38652827284](https://github.com/BunsDev/river-oaks/actions/runs/38652827284) | `c2480227` (fixes, docs, hook note) | 61 pass | 61 pass | 61 pass |

Every row: 0 skipped, 0 cancelled, 0 todo. The diag tree is this branch's tree plus
`.github/workflows/desktop-tests-diag.yml` only. The pushed head adds this ledger
update to `c2480227`; no test or source file differs.

Local, macOS arm64, at `c2480227`:

| Check | Result |
| --- | --- |
| `pnpm run test:desktop` | 61 pass, 0 fail, 0 skipped |
| `pnpm run verify` (core) | exit 0; `.runtime/agent/core.json` status passed at `c2480227`, all 11 tasks. Scripts 76 pass; preview 3012 pass, 1 skipped of 3013; server 486 pass, 140 skipped of 626 (Redis and live-service gates, no `REDIS_URL`); desktop 61 pass; build; Ruff lint and format; pytest 141 passed; demo; secrets scan |

## Gaps

- **Windows unit tests: proven by diag run 38652827284** (see Results). Not yet
  proven by #371's own Desktop workflow, which has not run on this head.
- **#377's `package-check.test.js`** fails on Windows in run 38635174724 with the
  same separator problem (`\r\dist\...` vs `/r/dist/...`). It lives on
  `ci/desktop-package-matrix` (#371), not on this branch.
- **New Windows finding, production, not fixed here.** Both hosts pass the whole
  prompt as one argument, and Windows caps a command line at 32,767 characters.
  Measured locally: the designer's Codex argv is 21,000 to 26,000 characters for
  the tests' briefs and 45,500 for a brief that routes every skill; the agent host's
  scene context may reach 160 KiB. Such a request fails at spawn on Windows and
  reaches the page as a generic local error ("Claude CLI failed. Check that it is
  signed in" for the agent). Passing the prompt on stdin would avoid the limit; it
  needs checking against the real CLIs.

- Windows and Linux packaging are proven by #371, not here.
- Finder icon check is visual; recorded by hand.

## Next step

PR #379 carries the Windows unit-test fixes (signed, not merged), proven on all
three runners by diag run 38652827284; the diag branch and workflow are deleted.
Val's four decisions remain open: Linux executable name, `.exe`-only Windows lookup
(the lookup test's Windows expectation depends on it), company string, icon art.
Landing is with the #371 phase-2 session (`pnpm run land 379`, authorized on #371);
the lander updates the branch from `main` before merging. Do not merge from this session.
