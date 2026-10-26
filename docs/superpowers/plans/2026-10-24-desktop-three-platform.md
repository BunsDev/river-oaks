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
| `desktop-e2e-settings-drop-371-20261026` | `fix/desktop-e2e-settings-town-drop-371-20261026` | `river-oaks-desktop-settings-drop` | `desktop/e2e.js` |
| `desktop-ci-electron-scope-20261026` | `ci/desktop-electron-scope-20261026` | `river-oaks-desktop-electron-scope` | `.github/workflows/desktop.yml` (scope job), `scripts/tests/desktop-workflow-scope.test.js`, `docs/desktop.md` (CI builds), `docs/testing.md` (Desktop workflow), this ledger |

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

Two series of ten macOS legs, three at a time: run 40127265022 on `diag/desktop-macos-e2e-371-20261024` at `a74baa04` (the fix plus the diag workflow, legs 1–10), then run 40128720845 at `af776bab` (plus diag-only instrumentation, legs 11–20). 18 of 20 passed.

| Legs | Result | Frames | Median | Auto settled after | Auto at measurement |
| --- | --- | --- | --- | --- | --- |
| 1–4, 6–16, 18–20 | pass | 118–425 (median 165) | 17–82 ms | 10.6–40.3 s | 0.6, AO off, every leg |
| 5 | **fail** | — | — | — | click on `[data-quality=auto]` timed out: Settings closed again after the Graphics tab opened |
| 17 | **fail** | 177 (frame check passed) | 52 ms | 33.7 s | later: "Execution context was destroyed" in the hot-reload check |

The frame check now measures Auto at its floor without AO in every leg, and none of the 19 legs that reached it came near failing it, but on the slowest runners Auto's floor is only about 12 fps (118–125 frames), so the margin over the unchanged 100-frame line is about 20%.

**Leg 17, a third harness race.** Vite logged `page reload desktop-hmr-5476.css`: the hot-reload check created its probe file and then imported it, and on this slow runner Vite's watcher reported the new file first and reloaded the whole page during `page.evaluate`. Fixed at the origin in `b3127a6b`: the probe file exists before Vite starts, so the check only edits a file Vite already serves.

**Leg 5 is not explained.** The e2e had already waited for `joined`. Vite's town WebSocket proxy logged `write EPIPE` 0.8 s before the join check passed, but passing legs log the same proxy errors around each reload, so that is not evidence. The instrumented legs 11–20 (every `dialog.close()` with its stack, `close`/`cancel` events, town socket opens and closes, `data-multiplayer` changes, long tasks over 1 s, pointer-downs) did not reproduce it: in every leg the only Settings close was the e2e's own button click, the town joined once and stayed joined, and the main thread ran long tasks of 1–6 s after the reload. Candidate closers left: the access gate (`setStatus`), `dismissOnOutsideClick`, Escape and the staleness watchdog (`lost(…, 4901)` after 8 s and five quiet checks). `b3127a6b` keeps a failure-only trail in the e2e (dialog closes with their caller, town state changes) so the next occurrence names its closer. Third series at `b3127a6b` (`diag/desktop-macos-e2e-371-b-20261024`, run 40131153906, legs 21–30): **10 of 10 passed**, 124–211 frames (median 178), Auto settled after 19.9–34.6 s, every leg at `{0.6, AO off}`.

**Independent review** (a fresh reviewer given only the diff): no correctness bug; `steadyWindows` is computed after every branch of `sample()` and reset where needed, and the wait cannot pass vacuously. Its risks, fixed in `d0be556f`: gitignore `preview/desktop-hmr-*.css` (the probe now exists before launch, so a launch timeout could leave it); the settle comment claims only "stopped stepping down" (a later step-up happens only on fast frames, so two windows stay); the settle wait fails with the quality state instead of a bare timeout below 4 fps; the failure trail runs only in the top frame and stops polling after 120 s. Fourth series at the final head `d0be556f` (`diag/desktop-macos-e2e-371-c-20261024`, run 40132633458, legs 31–40): **10 of 10 passed**, 123–349 frames (median 191), Auto settled after 14.4–34.3 s, every leg at `{0.6, AO off}`. #651's own Desktop and Verify passed on `4756d593`, `b3127a6b` and `d0be556f`.

## Increment 2: Electron download (#371)

**Cause.** Run 39960884564 failed inside `node desktop/package.js`. `@electron/packager` downloads Electron through `@electron/get` 5.1.0, which validates even a cached zip and, without caller-supplied `checksums`, downloads `SHASUMS256.txt` from github.com every time (`cacheMode: Bypass`, "Never use the cache for loading checksums"). CI restores the pnpm store ("Done in 2.7s"), so Electron's postinstall does not run and the runner's Electron cache is empty: every leg downloaded the zip and the checksum file from github.com.

Local demonstration (warm cache copied from `~/Library/Caches/electron`): `downloadArtifact` without checksums logged `Cache hit`, then `Downloading https://github.com/electron/electron/releases/download/v44.9.1/SHASUMS256.txt`. The new packaging path logged `Cache hit` and no download, and `desktop:package:check` passed. A truncated cached zip logged `Artifact in cache didn't match checksums` and fell back to a download, which an offline stub refused: verification is still enforced.

### Fix (branch `ci/desktop-electron-cache-371-20261024`)

- `package-options.js`: `download.checksums` is the installed electron package's `checksums.json` (pinned by `pnpm-lock.yaml`, the same list Electron's `install.js` verifies with); packaging refuses up front if it lacks the zip being packaged. `download.cacheRoot` follows `electron_config_cache` when set.
- `package.js`: `withNetworkRetry` retries the packager twice (10 s, 30 s) on connection failures and HTTP 429/5xx only; a checksum mismatch or 404 fails at once.
- `desktop.yml`: the `desktop` and `sign-windows` jobs cache `${{ runner.temp }}/electron-cache`, keyed by runner OS, arch and the exact Electron version, and log `@electron/get` debug lines on the package step.

Local: `node --test desktop/tests/package-options.test.js` 10/10 (new tests failed first on the missing exports); `pnpm run test:desktop` 119 passed, 3 skipped; `verify desktop-package` passed; core passed (tooling 237, preview 4,013 + 1, server 888 + 225, desktop 119 + 3, Python 156). Signed `20344eca`, draft [#652](https://github.com/BunsDev/river-oaks/pull/652).

Hosted: PR run 40127767202 (`20344eca`) missed the new cache on all three runners, downloaded each zip once, logged `artifact validated` and never fetched `SHASUMS256.txt`. A dispatch on the branch (40129100222) missed too (a branch cannot read PR-scoped caches) and saved on Linux and Windows but not macOS, because `actions/cache` saves only when the whole job succeeds and that leg's e2e hit the old render-loop flake (96 frames at `{0.61, AO, 10 fps}`, pre-#651 code). `eff2fbbc` splits the step into `actions/cache/restore` before packaging and `actions/cache/save` right after a successful package on a miss (both jobs). PR run 40130144121 at `eff2fbbc`: "Cache restored from key: electron-<OS>-<arch>-44.9.1" and `@electron/get` `Cache hit` on all three runners, no download at all, whole run green. Independent review: the packager passes `download` through, cached zips are re-validated, a partial download never enters the cache, and the retry is bounded and transient-only. Fixed in `04228bec`: a failed unit-test step skipped the unconditioned version and restore steps while packaging still ran, and the save wrote an unversioned key (both steps now run on `!cancelled()`, and the save needs a version); `sign-windows`, which holds `id-token: write` and the signing environment, no longer restores or saves a cache; keys end in `-zip` so a prefix match cannot cross versions; a behavioural test runs the packager's own `@electron/get` against a local mirror (one zip request, no `SHASUMS256.txt`, warm cache with no network, tampered zip replaced, mismatch refused and not retried); without `checksums` the same call requests `/v44.9.1/SHASUMS256.txt`. Local on `04228bec`: package-options 11/11, `verify desktop` 120 + 3 skipped, `verify tooling` 237/237. `eff2fbbc`'s Verify failed once in `preview experience (campus-traversal)` ("One resident on B12 stands over the other on the street"), a Garden campus journey this PR cannot reach; first log kept in the session scratchpad; the one rerun passed.

## Increment 3: Linux crash recovery (#370)

**Kernel probe** (`diag/desktop-linux-crash-370-20261024`, run 40127339568, ubuntu-24.04, systemd 255, kernel 6.17, `core_pattern` `|/usr/lib/systemd/systemd-coredump …`, `suid_dumpable` 2): a child holding 1.2 GB of incompressible memory called `process.abort()`. Left alone, `/proc/<pid>/status` read `CoreDumping: 1` at 302 ms and the process was gone at 19,157 ms (SIGABRT; `coredumpctl` lists a 1.1 G core). With `SIGKILL` on first sight of `CoreDumping: 1` (222 ms) it was gone at 225 ms, and no second core was listed.

**Fix** (`fix/desktop-linux-crash-370-20261024`, signed `b0a70d14`, draft [#653](https://github.com/BunsDev/river-oaks/pull/653)): `desktop/core-dump-watch.js` reads the game renderer's status once a second on Linux and ends a renderer that is writing a core, once; `main.js` starts it on Linux; `package-files.js` packages it (the import walker failed first). The Linux CI leg keeps `systemd-coredump` (no `core_pattern=core`, no `ulimit -c 0`), so the unchanged 60 s recovery check covers the path. The e2e receipt records `crashRecovery` timings. Docs: "Rendering and recovery", the CI paragraph, and the Linux matrix row (`kill -SEGV`). Losing that crash's core is a proposal for Val in the PR.

First failure kept: an earlier version failed 2 of 12 parallel runs of its test file with `[77855, 77855]` (the renderer ended twice while it still read as dumping). A once-only rule, with a deterministic test written first, fixed it; 24 parallel runs then passed. Local: watch tests 5 passed, 1 skipped (needs `/proc`); `test:desktop` 120 passed, 4 skipped; `verify desktop-package` passed; core passed (tooling 237, preview 4,013 + 1, server 888 + 225, desktop 120 + 4, Python 156).

**Before and after on the real e2e** (`diag/desktop-linux-crash-370-e2e-20261024`, `29c46136`, run 40128884470, `ubuntu-latest`, `systemd-coredump` active):

| Variant | Renderer reported gone | Reload finished | Playable | `coredumpctl` |
| --- | ---: | ---: | ---: | --- |
| before: `main`'s `main.js`, crash wait widened to 420 s on that branch only | 218,431 ms (`crashed`) | 218,705 ms | 224,588 ms | SIGTRAP, truncated, 97.3 M |
| after: the fix | 153 ms (`killed`) | 430 ms | 6,249 ms | interrupted, 7.5 K |

The after log reads `Game renderer 3548 is writing a core dump; ending it so the game can recover`. #653's own Desktop run on `b0a70d14` (40128917674): Linux leg passed under `systemd-coredump` with the unchanged 60 s check (gone 231 ms, playable 6,363 ms); macOS passed; Windows' e2e passed but its unit tests failed `null !== 'SIGKILL'` (Windows reports an exit code, not a signal). `a690592a` makes that test check the process ended on every platform and SIGKILL off Windows; `verify desktop` 120 passed, 4 skipped; 16 parallel runs passed. Hosted on `a690592a`: macOS first failed with the old render-loop flake (90 frames at `{0.61, AO, 10 fps}`, pre-#651) and passed on its one rerun; Linux passed under `systemd-coredump` (gone 244 ms, playable 5,052 ms); Windows passed.

**Independent review**: no blocking bug (`getOSProcessId()` never returns the GPU or browser process; ordering with the recovery is sound; no leak; no sandbox, fuse or origin change). Fixed in `2a2d9d11`: the PID is checked again after the status read and a read finishing after `stop()` kills nothing (PID reuse); an unreadable status other than a gone process is reported once (`hidepid`); on Linux with a piped `core_pattern` the e2e asserts `reason === 'killed'`; the SIGKILL test no longer asserts inside the swallowed reader and its wait is bounded; the real `/proc` reader runs through the watch on Linux; docs say the CI renderer is unsandboxed. Accepted: other crashes during the CI e2e now also go through `systemd-coredump`. Local on `2a2d9d11`: watch tests 7 + 2 skipped, 16 parallel runs passed, `verify desktop` 122 + 5 skipped, `verify desktop-package` passed, `verify tooling` 237/237. Core `verify` failed twice in its first stage on `scripts/tests/land-pr.test.js` "a queued lander wakes on release…" (once niced, once not, load about 13); this branch changes nothing in `scripts/`, the suite passed 29/29 three times in isolation, and core stops at its first failure, so its other stages did not run on this head; logs kept in the session scratchpad.

## Increment 4: candidate and rehearsal (#373, #372)

Desktop dispatched on `main` once at 19:29Z: run 40125506138 at `67203a6a7a4eb75888e01ade1301f9411f382b4e` (no signing variables, no `desktop-signing` environment, checked 19:28Z). Every job passed; signing skipped. The five unsigned installers verified with `shasum -a 256 -c SHA256SUMS`, and the [rehearsal ledger](2026-10-24-desktop-release-rehearsal.md) holds their digests (checked against the downloaded `SHA256SUMS` by script) and the per-row human steps. Finding: the documented Linux crash row (`kill <pid>`, SIGTERM) writes no core dump, so it cannot show the #370 delay; the rehearsal adds `kill -SEGV`.

The same run's macOS e2e passed on pre-fix code at 153 frames with Auto still at `{scale: 0.6, occlusion: true, fps: 10}`: the marginal state #651 stops measuring.

Docs: `docs/desktop.md` now says which pull requests get all three runners and the installers and which get the Linux leg alone (`scope` job, since 3313f010), and that a newer push cancels an older pull-request run. The artifact names and the `desktop-package` profile in `docs/desktop.md` and `docs/agent-workflow.md` match what the workflow uploads today; no other change was needed.

## Increment 5: decisions (#370, #372, #373)

Posted 2026-10-24 ~20:40Z: [#370](https://github.com/BunsDev/river-oaks/issues/370#issuecomment-6389040777) (four identity confirmations, with #653 for the crash finding), [#372](https://github.com/BunsDev/river-oaks/issues/372#issuecomment-6389040987) (Azure setup steps by variable name, `.deb` Maintainer, desktop shortcut) and [#373](https://github.com/BunsDev/river-oaks/issues/373#issuecomment-6389041177) (candidate, version, machines, blockers). Correction to the goal prompt: #372 has two open decisions, not three. Windows-only cookie encryption was settled when 0.2.1 turned `EnableCookieEncryption` on for every platform (`docs/security-review.md`; installers ledger 2026-10-15); the 10-22 status still listed it.

## Increment 6: Settings closed by a town drop (#371, 2026-10-26)

Task `desktop-e2e-settings-drop-371-20261026`, branch `fix/desktop-e2e-settings-town-drop-371-20261026`, worktree `river-oaks-desktop-settings-drop`.

The failure trail from #651 caught the cause in Desktop job 121709518224 (Dependabot #678, run 40361899066). Timeline after the reload:

| t (ms) | Event |
| --- | --- |
| 4,471 | town `connecting` |
| 22,300 | town `joined` |
| 59,062 | `settings-dialog` closed via `setStatus` ← `show` ← `lost` ← the WebSocket `close` handler |
| 59,159 | town `disconnected` |
| 60,153 | town `joined` |

Nothing reopened Settings, so the Auto click waited 120 s for a hidden button. Vite logged `ws proxy error: write EPIPE` about 2 s before the close. Leg 5's unexplained close (1 of 40) failed the same way, before the trail existed.

[#683](https://github.com/BunsDev/river-oaks/pull/683) changes only `desktop/e2e.js`. `chooseQuality(mode)` waits for the town, opens Settings → Graphics and chooses. If that fails with the dialog closed, it rejoins, reopens and chooses again, at most twice, recorded in `report.qualityRetries`. The final close is skipped when a drop already closed the dialog.

Results:

- **Local:** core `verify` passed at `68c6fc55`.
- **#683's own runs:** 29 checks passed, 2 skipped.
- **Forced-drop run 40389088261** (`ac00e1c6`): the town socket was closed before the Auto choice and after it. All ten legs recovered with exactly one retry and nine passed. Leg 43 failed the 100-frame check at 9.4 fps on the floor. Its scene counts match main's passing legs exactly, so the runner was slow, not the change.
- **Head run 40396746242** (`d1eb78b6`): 10 of 10 passed, with no natural drop. Frames ranged 108–405.
- **Comment posted:** [#371](https://github.com/BunsDev/river-oaks/issues/371#issuecomment-6427022352).

## Increment 7: Electron bumps get every platform (#371, 2026-10-26)

Task `desktop-ci-electron-scope-20261026`, branch `ci/desktop-electron-scope-20261026`, worktree `river-oaks-desktop-electron-scope`. Val authorized it on 2026-10-26, with landing.

The Desktop `scope` job gave the full matrix and installers only to pull requests that change `desktop/` or the workflow. An Electron bump changes only `package.json` and the lockfile, so it got the Linux leg alone: #619 moved Electron 44.8.0 → 44.9.1 that way, and Dependabot #681 (44.9.1 → 45.0.0) would have too. The step now reads each file's patch from the same API call. It also gives every platform when a changed line in `package.json`, `pnpm-lock.yaml` or `pnpm-workspace.yaml` names `electron`, `electron-winstaller` or an `@electron` package, or when GitHub leaves out a `package.json` or lockfile patch as too big. `pnpm-workspace.yaml`, which decides whether Electron's postinstall download runs, joins the workflow's paths. `electron-to-chromium`, a browserslist dependency, does not count.

An independent review found no correctness bugs. It confirmed:
- API and jq errors fail the step instead of downgrading it.
- The regex matches all 43 lockfile and 6 `package.json` lines that mention Electron, and no unrelated line.
- The test passes with bash 3.2 and with dash as `sh`.

Its doc findings are fixed: the wording now names lines, not "packaging tools", and the too-big rule includes `package.json`. Two gaps remain, both as before: a bump to an Electron tool's own dependency (such as `postject` or `resedit`) and a `package.json` `version` bump still get Linux only on a pull request, while `main` and tags build everything.

Results:

- **`scripts/tests/desktop-workflow-scope.test.js`:** runs the step's own script from `desktop.yml` with a stand-in `gh` that serves fixture patches. It needs bash and jq, as on ubuntu-latest. 5 of 5 pass; against `main`'s workflow, the three tests that need every platform from `package.json`, the lockfile or `pnpm-workspace.yaml` fail, and the other two pass.
- **Real pull requests:** the step, run locally with the real `gh` against 11 merged or open pull requests, gives every platform to #681 and #619 where `main`'s rule gave Linux only. It keeps every platform for #554 and #652, and Linux only for #679, #628, #629, #621, #611, #548 and #671.

## Pull requests

| PR | Branch | Head | State |
| --- | --- | --- | --- |
| [#651](https://github.com/BunsDev/river-oaks/pull/651) | `fix/desktop-macos-e2e-371-20261024` | `d0be556f` | merged 2026-10-25 00:32Z (see Delivery); 10 of 10 diag legs at `b3127a6b` and at `d0be556f`; independent review addressed |
| [#652](https://github.com/BunsDev/river-oaks/pull/652) | `ci/desktop-electron-cache-371-20261024` | `04228bec` | merged 2026-10-25 01:55Z (see Delivery); the `-zip` keys missed and were saved by the explicit save step on all three runners, macOS included; independent review addressed |
| [#653](https://github.com/BunsDev/river-oaks/pull/653) | `fix/desktop-linux-crash-370-20261024` | `2a2d9d11` | draft, review-ready; Desktop and Verify green on first attempt; Linux leg asserted `killed` with the pipe on (gone 815 ms, playable 7.5 s); independent review addressed; core-dump trade-off is Val's decision |
| [#654](https://github.com/BunsDev/river-oaks/pull/654) | `docs/desktop-release-packet-373-20261024` | this branch | draft; docs; hosted green |
| [#683](https://github.com/BunsDev/river-oaks/pull/683) | `fix/desktop-e2e-settings-town-drop-371-20261026` | `68c6fc55` | draft, review-ready; Desktop and Verify green; forced drops recovered in 10 of 10 legs; 10 of 10 legs green at the head |

## Delivery

Val authorized landing #651 and #652; river-oaks-71 landed both through `pnpm run land` and the merge guard. This session confirmed each merge on freshly fetched `origin/main`, recorded it in the register and released the task at its exact local tip; river-oaks-e9 retired the local branch and worktree through `project:prune`. GitHub deleted each PR's head branch two seconds after its merge (the repository has `delete_branch_on_merge` on; `head_ref_deleted` events at 00:32:20Z and 01:55:30Z); the `diag/*` refs are untouched.

| PR | Local tip | Reviewed head (lander update-branch) | Merge | Tree | Hosted at reviewed head |
| --- | --- | --- | --- | --- | --- |
| #651 | `d0be556f` | `12ae37ac` (+ main `2da76e1f`) | `4122fe07` | `f390e64b` | 29 success, 2 skipped; `preview` success |
| #652 | `04228bec` | `65aef4ac` (+ main `4122fe07`) | `7ad9ffc6` | `db531070` | 29 success, 2 skipped (Windows signing); installers and SHA256SUMS success; the first attempt at 01:06Z was refused as unstable while Windows installers ran, and the relanding waited for every check |

Desktop on main after #651 (run 40147087966, `4122fe07`): all three e2e legs, both installer legs and SHA256SUMS passed; macOS passed on the first attempt.

Desktop on main after #652 (run 40152491598, `7ad9ffc6`): every leg passed. As expected on main's first run, each runner logged `Cache not found for input keys: electron-<OS>-<arch>-44.9.1-zip`, downloaded only the zip (no `SHASUMS256.txt` request) and logged `Cache saved with key: electron-Linux-X64-44.9.1-zip`, `electron-Windows-X64-44.9.1-zip` and `electron-macOS-ARM64-44.9.1-zip`. Later main runs, and PRs (which can read main's caches), should restore these keys.

Retirement archives (bundle restore-tested by the guard; ignored evidence verified by extraction):

- #651: bundle `~/worktree-backups/river-oaks/retirement-T00qVG/history.bundle` (sha256 `0e1ddadc…093cb`, tag `archive/worktree-prune/c6baca16-…`); `.runtime/agent` receipts and `data/generated/demo` in `~/worktree-backups/river-oaks/evidence-landing-steward-20261024/desktop-macos-e2e/evidence.tar`.
- #652: bundle `~/worktree-backups/river-oaks/retirement-M02i7C/history.bundle` (sha256 `0a0c88ad…cb533`, tag `archive/worktree-prune/d7802250-…`); four `.runtime/agent` receipts and `data/generated/demo` in `~/worktree-backups/river-oaks/evidence-landing-steward-20261024/desktop-electron-cache/evidence.tar`.

## Results

- **macOS e2e (#371):** both measured causes fixed and a third harness race found and fixed; 20 consecutive green legs across the two final heads. One Settings close (leg 5, 1 of 40) was unexplained then. The trail later showed the same failure caused by a town drop; #683 recovers from it.
- **Windows packaging (#371):** the github.com fetch on every package run is gone (zip-only on a miss, nothing on a hit), proven on three runners in both states.
- **Linux crash recovery (#370):** 218,431 ms to 153–815 ms on the CI runner with `systemd-coredump` active; asserted on every Linux leg from now on.
- **Candidate and rehearsal (#373):** unsigned set from `67203a6a` verified; per-row human steps in [the rehearsal ledger](2026-10-24-desktop-release-rehearsal.md).
- **Decisions packaged and evidence map posted:** [#370](https://github.com/BunsDev/river-oaks/issues/370#issuecomment-6389040777), [#372](https://github.com/BunsDev/river-oaks/issues/372#issuecomment-6389040987), [#373](https://github.com/BunsDev/river-oaks/issues/373#issuecomment-6389041177), [#369](https://github.com/BunsDev/river-oaks/issues/369#issuecomment-6389751828).
- This session merged, tagged, released and deployed nothing; #651 and #652 were landed by river-oaks-71 under Val's authorization. No environment, variable or Azure change.

## Gaps

- A CI pass is not a human matrix row.
- The governor's frame-count windows still make Auto slow to shed load on a GPU below 10 fps; this goal does not change that decision rule.
- Some macOS runners stay below 10 fps even at Auto's floor (`{0.6, AO off}`): forced-drop leg 43 drew 95 frames. The e2e's 100-frame check can therefore still fail on a slow runner. Lowering the floor or the threshold is Val's decision.
- The Linux fix is proven on CI's unsandboxed e2e renderer; the sandboxed renderer on a real Ubuntu desktop is a rehearsal row.

## Next action

#651 and #652 are delivered and their worktrees retired. Handed off to Val: review and, if authorized, land #683 and #654; decide #653's core-dump trade-off and the slow-runner floor; answer #370's four identity confirmations, #372's two decisions and the Azure setup, and #373's version. After those merges, retire the remaining three worktrees with `project:prune` (dry run, then `--apply`); the diag branches' local refs retire with them, and their remote branches stay unless Val authorizes deletion.
