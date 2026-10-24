# Desktop on Windows, Linux and macOS: release readiness (#369–#373)

Goal ledger for the 2026-10-24 desktop goal. Owner `claude:river-oaks-7c (0cd79998)`. Started 19:28Z against `origin/main` `67203a6a`. Every increment is a separate branch and PR; this ledger lives on the docs branch so the code PRs do not conflict over it.

## Objective

Make the desktop app release-ready on all three platforms without Val's hands: fix the Desktop workflow's recurring failures where they originate, measure or fix the Linux crash-recovery delay, build a fresh unsigned candidate with a human rehearsal packet, and package Val's open decisions. No merge, tag, release, environment or Azure change.

## Tasks and files owned

| Task | Branch | Worktree | Files |
| --- | --- | --- | --- |
| `desktop-macos-e2e-371-20261024` | `fix/desktop-macos-e2e-371-20261024` | `river-oaks-desktop-macos-e2e` | `desktop/e2e.js`, `preview/src/render-quality.js`, `preview/tests/render-quality.test.js` |
| `desktop-electron-cache-371-20261024` | `ci/desktop-electron-cache-371-20261024` | `river-oaks-desktop-electron-cache` | `.github/workflows/desktop.yml`, `desktop/package.js`, `desktop/package-options.js`, `desktop/tests/package-options.test.js` |
| `desktop-linux-crash-370-20261024` | `fix/desktop-linux-crash-370-20261024` | `river-oaks-desktop-linux-crash` | `desktop/main.js` (recovery), `desktop/tests/`, `docs/desktop.md` (Rendering and recovery) |
| `desktop-platform-release-373` | `docs/desktop-release-packet-373-20261024` | `river-oaks-desktop-release-packet` | this ledger, the rehearsal ledger, `docs/desktop.md` (CI and release sections), `docs/agent-workflow.md` |

## Baseline (19:28Z)

- Desktop on `main`: run 40095303144 (`339c438c`) failed on macOS, "render loop keeps advancing"; run 39960884564 (`22403e0d`) failed on Windows packaging, `ConnectTimeoutError` to `github.com:443`.
- No GitHub `desktop-signing` environment; no repository variables at all (`gh api .../actions/variables` returned `[]`), so Windows signing is skipped.
- Last release v0.2.1 (macOS only). `package.json` 0.2.1, Electron 44.9.1.
- Register: no desktop task before this goal; `desktop-installers` retired 10-24.
- Peers at 18:45Z held #586, #517, #288/#290, #510/#512, iOS #292, #637/#640 and Commons; no Codex rollout claimed a desktop task (two days of rollouts searched; desktop mentions were reads and hash lists).

## Increment 1: macOS e2e (#371)

### Evidence: every retained macOS receipt

`collect.mjs` (session scratchpad) downloaded `desktop-e2e-macos-latest` from every completed Desktop run it could list since 10-10: 173 macOS legs from 10-14 on, 168 with receipts, 138 passed and 30 failed. Failures by signature:

| Signature | Legs | Runs |
| --- | ---: | --- |
| `W moves the player: 0.00 m` | 16 | 10-15 ×3, 10-18 ×13 (#392's game-time hold; none after 10-18) |
| `render loop keeps advancing` (`samples > 100`) | 5 | 38700833828, 38739898094 (10-15), 39094286379 (main, 10-18), 39909607795 (10-23), 40095303144 (main `339c438c`, 10-24) |
| close-settings `locator.click` timeout, 120 s | 5 | 39150037572, 39150680457 (10-18), 39195791736 (main dispatch), 39296698925 (10-19), 39835841214 (10-22) |
| `Expected values to be strictly deep-equal` | 2 | 39158853173 (10-18), 39196382550 (diag, 10-19) |
| other | 2 | 39140169211 (window closed, 10-18), 38834887531 (fullscreen wait, 10-16) |

#371's 10-22 status attributed 39195791736 and 39296698925 to the frame or walk assertions; both receipts are the close-settings timeout.

**Frame counts against Auto's state.** Every `render loop` failure had AO still on (`occlusion: true`, about 1,450–1,500 calls, 5.2–5.4 M triangles) at scale 0.61–0.72. Passing legs with AO on cluster at 104–160 frames in 10 s, just over the line; legs where Auto had dropped AO draw 175–400 frames (about 1,006–1,026 calls, 3.7–3.8 M triangles).

**Cause.** `createRenderScaleGovernor` decides once per 45-frame window. Selecting Auto calls `reset()` (scale 1, AO on). From 1 it needs four slow windows to reach the 0.6 floor (1 → 0.85 → 0.72 → 0.61 → 0.6), one more at the floor, and a second at the floor to drop AO: 270 frames, about 27 s at 10 fps and 45 s at 6 fps. The e2e clicked Auto, slept 5 s, then counted frames for 10 s, so on a slow runner it measured Auto's descent rather than the loop. The macOS leg is the only one without the CPU scene budget (`RIVER_OAKS_DESKTOP_SOFTWARE=1`); giving it the budget would hide the descent instead of waiting for it.

**Close-settings timeout.** `connect()` in `preview/src/multiplayer-client.js` shows the access gate while it connects, and `setStatus` closes an open `#settings-dialog` so the gate can make the app inert. After `page.reload()` the e2e waited only for `#loading` to hide, then opened Settings and clicked Auto; the reconnect closed the dialog, so the close button never became visible. The failure screenshot (run 39296698925) shows the Map and People panels with Settings closed.

### Fix (branch `fix/desktop-macos-e2e-371-20261024`)

- `render-quality.js`: the governor counts `steadyWindows`, the consecutive decision windows that changed neither scale nor AO; `reset()` and `resetMeasurements()` zero it. `stats.steadyWindows` publishes it for Auto (`null` for manual modes) through the existing `#canvas-host[data-quality]`. No decision changes.
- `desktop/e2e.js`: after the reload it waits for the same readiness as at startup and, in a shared town, for `data-multiplayer = joined` before opening Settings. After selecting Auto it waits for `steadyWindows >= 2` instead of sleeping 5 s, and records `autoSettledMs`. `samples > 100` is unchanged.

Local: `node --test preview/tests/render-quality.test.js` 21/21 (3 new tests failed first, then passed); with `baseline-580-protocol` and `character-quality` 27/27; `pnpm run test:desktop` 115 passed, 3 skipped (Windows PowerShell), 0 failed; `pnpm run verify desktop-package` passed; `pnpm run verify` core passed (tooling 237/237, preview 4,016 + 1 skipped, server 888 + 225 Redis skips, desktop 115 + 3 skipped, Python 156). Signed `4756d593`, draft [#651](https://github.com/BunsDev/river-oaks/pull/651).

### Ten-run diagnostic at the fix head

`diag/desktop-macos-e2e-371-20261024` at `a74baa04` (fix + a ten-job macOS workflow, three at a time), run 40127265022. First eight legs:

| Leg | Result | Frames | Median | Auto settled after | Auto at measurement |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | pass | 125 | 81 ms | 34.7 s | 0.6, AO off |
| 2 | pass | 118 | 82 ms | 40.3 s | 0.6, AO off |
| 3 | pass | 165 | 65 ms | 23.6 s | 0.6, AO off |
| 4 | pass | 230 | 48 ms | 21.7 s | 0.6, AO off |
| 5 | **fail** | — | — | — | click on `[data-quality=auto]` timed out: Settings closed again after the Graphics tab opened |
| 6 | pass | 167 | 52 ms | 24.9 s | 0.6, AO off |
| 7, 8 | pass | | | | |

The frame check now measures Auto at its floor without AO, but on the slowest runners that is only about 12 fps (118–125 frames), so its margin over the unchanged 100-frame line is thin. Leg 5 shows the close-settings signature is not fully explained: the e2e had already waited for `joined`. Vite's town WebSocket proxy logged `write EPIPE` 0.8 s before the join check passed, but passing legs log the same proxy errors around each reload, so that is not evidence. The other closers are the access gate (`setStatus`), `dismissOnOutsideClick`, Escape and the staleness watchdog (`lost(…, 4901)` after 8 s and five quiet checks). A diag-only commit (`af776bab`) records `data-multiplayer` changes, every `dialog.close()` with its stack, `close` and `cancel` events, town socket opens and closes, long tasks over 1 s and pointer-downs into each receipt; its ten-leg run waits for the first run to finish so no more than three diagnostic macOS jobs run at once.

## Increment 2: Electron download (#371)

**Cause.** Run 39960884564 failed inside `node desktop/package.js`. `@electron/packager` downloads Electron through `@electron/get` 5.1.0, which validates even a cached zip and, without caller-supplied `checksums`, downloads `SHASUMS256.txt` from github.com every time (`cacheMode: Bypass`, "Never use the cache for loading checksums"). CI restores the pnpm store ("Done in 2.7s"), so Electron's postinstall does not run and the runner's Electron cache is empty: every leg downloaded the zip and the checksum file from github.com.

Local demonstration (warm cache copied from `~/Library/Caches/electron`): `downloadArtifact` without checksums logged `Cache hit`, then `Downloading https://github.com/electron/electron/releases/download/v44.9.1/SHASUMS256.txt`. The new packaging path logged `Cache hit` and no download, and `desktop:package:check` passed. A truncated cached zip logged `Artifact in cache didn't match checksums` and fell back to a download, which an offline stub refused: verification is still enforced.

### Fix (branch `ci/desktop-electron-cache-371-20261024`)

- `package-options.js`: `download.checksums` is the installed electron package's `checksums.json` (pinned by `pnpm-lock.yaml`, the same list Electron's `install.js` verifies with); packaging refuses up front if it lacks the zip being packaged. `download.cacheRoot` follows `electron_config_cache` when set.
- `package.js`: `withNetworkRetry` retries the packager twice (10 s, 30 s) on connection failures and HTTP 429/5xx only; a checksum mismatch or 404 fails at once.
- `desktop.yml`: the `desktop` and `sign-windows` jobs cache `${{ runner.temp }}/electron-cache`, keyed by runner OS, arch and the exact Electron version, and log `@electron/get` debug lines on the package step.

Local: `node --test desktop/tests/package-options.test.js` 10/10 (new tests failed first on the missing exports); `pnpm run test:desktop` 119 passed, 3 skipped; `verify desktop-package` passed; core passed (tooling 237, preview 4,013 + 1, server 888 + 225, desktop 119 + 3, Python 156). Signed `20344eca`, draft [#652](https://github.com/BunsDev/river-oaks/pull/652).

## Increment 3: Linux crash recovery (#370)

**Kernel probe** (`diag/desktop-linux-crash-370-20261024`, run 40127339568, ubuntu-24.04, systemd 255, kernel 6.17, `core_pattern` `|/usr/lib/systemd/systemd-coredump …`, `suid_dumpable` 2): a child holding 1.2 GB of incompressible memory called `process.abort()`. Left alone, `/proc/<pid>/status` read `CoreDumping: 1` at 302 ms and the process was gone at 19,157 ms (SIGABRT; `coredumpctl` lists a 1.1 G core). With `SIGKILL` on first sight of `CoreDumping: 1` (222 ms) it was gone at 225 ms, and no second core was listed.

**Fix** (`fix/desktop-linux-crash-370-20261024`, signed `b0a70d14`, draft [#653](https://github.com/BunsDev/river-oaks/pull/653)): `desktop/core-dump-watch.js` reads the game renderer's status once a second on Linux and ends a renderer that is writing a core, once; `main.js` starts it on Linux; `package-files.js` packages it (the import walker failed first). The Linux CI leg keeps `systemd-coredump` (no `core_pattern=core`, no `ulimit -c 0`), so the unchanged 60 s recovery check covers the path. The e2e receipt records `crashRecovery` timings. Docs: "Rendering and recovery", the CI paragraph, and the Linux matrix row (`kill -SEGV`). Losing that crash's core is a proposal for Val in the PR.

First failure kept: an earlier version failed 2 of 12 parallel runs of its test file with `[77855, 77855]` (the renderer ended twice while it still read as dumping). A once-only rule, with a deterministic test written first, fixed it; 24 parallel runs then passed. Local: watch tests 5 passed, 1 skipped (needs `/proc`); `test:desktop` 120 passed, 4 skipped; `verify desktop-package` passed; core passed (tooling 237, preview 4,013 + 1, server 888 + 225, desktop 120 + 4, Python 156).

Pending: #653's Desktop Linux leg and the e2e diagnostic `diag/desktop-linux-crash-370-e2e-20261024` (`29c46136`): "before" restores `main`'s `main.js` and widens only the crash wait to 420 s on that branch; "after" is the fix head.

## Increment 4: candidate and rehearsal (#373, #372)

Desktop dispatched on `main` once at 19:29Z: run 40125506138 at `67203a6a7a4eb75888e01ade1301f9411f382b4e` (no signing variables, no `desktop-signing` environment, checked 19:28Z). Every job passed; signing skipped. The five unsigned installers verified with `shasum -a 256 -c SHA256SUMS`, and the [rehearsal ledger](2026-10-24-desktop-release-rehearsal.md) holds their digests (checked against the downloaded `SHA256SUMS` by script) and the per-row human steps. Finding: the documented Linux crash row (`kill <pid>`, SIGTERM) writes no core dump, so it cannot show the #370 delay; the rehearsal adds `kill -SEGV`.

The same run's macOS e2e passed on pre-fix code at 153 frames with Auto still at `{scale: 0.6, occlusion: true, fps: 10}`: the marginal state #651 stops measuring.

Docs: `docs/desktop.md` now says which pull requests get all three runners and the installers and which get the Linux leg alone (`scope` job, since 3313f010), and that a newer push cancels an older pull-request run. The artifact names and the `desktop-package` profile in `docs/desktop.md` and `docs/agent-workflow.md` match what the workflow uploads today; no other change was needed.

## Increment 5: decisions (#370, #372, #373)

Drafted for one comment each. Correction to the goal prompt: #372 has two open decisions, not three. Windows-only cookie encryption was settled when 0.2.1 turned `EnableCookieEncryption` on for every platform (`docs/security-review.md`; installers ledger 2026-10-15); the 10-22 status still listed it.

## Pull requests

| PR | Branch | Head | State |
| --- | --- | --- | --- |
| [#651](https://github.com/BunsDev/river-oaks/pull/651) | `fix/desktop-macos-e2e-371-20261024` | `4756d593` | draft; core passed locally; diagnostic series found a remaining close-settings failure (leg 5); not ready |
| [#652](https://github.com/BunsDev/river-oaks/pull/652) | `ci/desktop-electron-cache-371-20261024` | `20344eca` | draft; core passed locally; hosted pending |
| [#653](https://github.com/BunsDev/river-oaks/pull/653) | `fix/desktop-linux-crash-370-20261024` | `b0a70d14` | draft; core passed locally; hosted and diag pending; proposal for Val |

## Results

Recorded per increment above as each arrives.

## Gaps

- A CI pass is not a human matrix row.
- The governor's frame-count windows still make Auto slow to shed load on a GPU below 10 fps; this goal does not change that decision rule.
- The Linux fix is proven on CI's unsandboxed e2e renderer; the sandboxed renderer on a real Ubuntu desktop is a rehearsal row.

## Next action

Read the instrumented macOS run's timelines and fix the close-settings closer at its seam; collect #652's cache miss and hit; collect the Linux before/after timings; then post the decision comments.
