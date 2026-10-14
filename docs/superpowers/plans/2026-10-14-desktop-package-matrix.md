# Desktop packaging build matrix (#371), 2026-10-14

Objective: a `Desktop` workflow that packages the Electron shell on Windows, Linux and macOS runners, checks the fuse wire and asar contents of each build, runs the development desktop end-to-end suite with the loopback acceptance fixture on each, and uploads unsigned builds with SHA-256 sums for testers. The required `preview` check in `verify.yml` stays unchanged. The workflow holds no secrets.

Branch and worktree: `ci/desktop-package-matrix` in `../river-oaks-desktop-package-matrix-20261014`, started from `origin/main` at `489a60e41bfe1a6499dfb0905ada55856be99825` (#374 merged after the issue's `7cff31f4` baseline). Register task: `desktop-package-matrix` in the primary checkout's live `tasks.json`.

Files owned: `.github/workflows/desktop.yml`, `desktop/package-check.js`, `desktop/tests/package-check.test.js`, `config/agent-workflow.json` (the `desktop-package` profile), `docs/desktop.md` (CI builds section), `docs/agent-workflow.md` (profile table), this ledger.

## Assumptions rechecked against current source

- `verify.yml` uses `ubuntu-latest` only, with `actions/checkout@3d3c42e5…` (v7.0.1), `pnpm/action-setup@ea17c68d…` (v6.1.0), `actions/setup-node@949feb24…` (v7.1.0, Node 24, pnpm cache), `actions/cache@55cc8345…` (v6.1.0) and `actions/upload-artifact@cf430e03…` (v7.0.2). Browser jobs render on Linux with `xvfb-run -a` plus `LIBGL_ALWAYS_SOFTWARE=1`, `LP_NUM_THREADS=2`.
- `desktop/package.js` packages the host platform and arch into `dist/desktop/TypeSafe Place-<platform>-<arch>/`; the binary is `TypeSafe Place.app` on macOS, `TypeSafe Place.exe` on Windows and `TypeSafe Place` on Linux. It stages `DESKTOP_FILES` under `desktop/`, `DESKTOP_SHARED_FILES` at their repository paths, writes `desktop/world-design-pack.json` and a minimal `package.json`, packs them as an asar and flips `DESKTOP_FUSES` with `strictlyRequireAllFuses`.
- `desktop/e2e.js` launches the development Electron from the repository root (the packaged build has the inspector fuse off, so Playwright cannot attach to it). `--dev` starts its own Vite server on a free port with the acceptance fixture (`RIVER_OAKS_ACCEPTANCE_FIXTURE=1`, local dev auth, an in-process town on a free port, an offline `/v1` bridge), passes `--use-fake-device-for-media-stream`, and writes `data/reports/desktop-development.json` (or `RIVER_OAKS_DESKTOP_REPORT`) and `output/playwright/desktop-development*.png`.
- `@electron/fuses` exports `getCurrentFuseWire(pathToElectron)`; `@electron/asar` is only a transitive dependency of the packager, so the asar listing check parses the asar header directly.
- #370 (icon, Windows metadata, Linux executable name, Windows-aware host resolution) has no PR and has not merged. Windows and Linux failures caused by those gaps are recorded on #370, not patched here.

## Stages

Each stage is pushed and its run read with `gh run view --log-failed` before the next.

1. Unit tests on three runners: run [38625146725](https://github.com/BunsDev/river-oaks/actions/runs/38625146725) at `157fbbbf`. ubuntu-latest and macos-latest passed (54 tests). windows-latest failed 17 of 54 existing desktop unit tests (Studio agent host, designer host, skill pack and package-files suites: Unix-only executable spawning, FIFO fixtures and path separators). Recorded on #370; the later stages run on Windows with `if: !cancelled()` so packaging evidence is still produced while that job stays red.
2. Packaging: run [38625588426](https://github.com/BunsDev/river-oaks/actions/runs/38625588426) at `1a894c94`. `desktop:package` succeeded on all three runners: `dist/desktop/TypeSafe Place-win32-x64`, `TypeSafe Place-linux-x64`, `TypeSafe Place-darwin-arm64` (Electron 44.7.0). The Windows job is still red from stage 1's unit tests only.
3. Fuse and asar checks: `desktop/package-check.js` reads the fuse wire with `@electron/fuses` `getCurrentFuseWire` and compares it with `desktop/fuses.js` (flipped, missing, undecided or differently versioned fuses are drift), and lists the asar from its header (no new dependency) against `DESKTOP_FILES`, `DESKTOP_SHARED_FILES`, the world-design pack and `package.json`, failing on anything missing or extra. Unit tests in `desktop/tests/package-check.test.js` (5, synthetic asar and wires). Locally on macOS arm64: fuses match, 17 files, `ok: true`. Run [38626301451](https://github.com/BunsDev/river-oaks/actions/runs/38626301451) at `4b971b3e`: the check passed on all three runners (`fuses: []`, `missing: []`, `unexpected: []`, `ok: true`); 59 desktop unit tests on Linux and macOS.
4. Development e2e per platform: `RIVER_OAKS_ACCEPTANCE_FIXTURE=1 pnpm run test:desktop:e2e --dev` with the report at `data/reports/desktop-ci-<runner>.json`; Linux runs under `xvfb-run` with Mesa (`LIBGL_ALWAYS_SOFTWARE=1`, `LP_NUM_THREADS=2`); receipt and screenshots uploaded as `desktop-e2e-<runner>`. Run [38626826173](https://github.com/BunsDev/river-oaks/actions/runs/38626826173) at `62000621`:
   - macos-latest passed all 13 checks (ready in 79 s, 137 frame samples over 10 s, 13.7 fps mean).
   - ubuntu-latest failed at `e2e.js:60` (player never ready, 120 s): `THREE.WebGLRenderer: A WebGL context could not be created` and the "Preview unavailable: WebGL could not initialize" screen. Electron under Xvfb got no GL context because the browser jobs' Chromium flags were not passed. Fix: `RIVER_OAKS_DESKTOP_SOFTWARE=1` makes `desktop/e2e.js` launch Electron with `--use-gl=angle --use-angle=gl --ignore-gpu-blocklist` and set `VITE_SHARED_SOFTWARE_RENDERING=1` for its Vite server, as `preview/e2e/shared-runner.js` does.
   - windows-latest failed with `electron.launch: Timeout 30000ms exceeded` after the main-process debugger attached and nothing else was logged. Diagnosis push: `ELECTRON_ENABLE_LOGGING=1` and `RIVER_OAKS_DESKTOP_LAUNCH_TIMEOUT=120000` (the launch timeout in `desktop/e2e.js` is now overridable) to tell a slow cold start from a hang.
   - Stage 4b, run [38630048297](https://github.com/BunsDev/river-oaks/actions/runs/38630048297) at `0c12234c` (dispatched by hand: GitHub created no `pull_request` runs for that push, for Verify either; the earlier and later pushes triggered normally). macOS passed again (161 samples, 16 fps). ubuntu-latest now renders under Mesa: ready in 17.7 s, 173 samples at 17 fps, 9 checks passed, and failed at the native minimize check (`e2e.js:214`, `isMinimized()` stayed false) because Xvfb has no window manager. Fix: Openbox inside the Xvfb session. windows-latest still timed out at 120 s with only the debugger-attached lines, so it is a hang, not a slow start; next push adds Playwright's launch trace and a direct 30 s Electron launch probe to find where it stalls.
   - #370 now has PR #379 (`feat/desktop-platform-identity`), which renames the Linux executable to `typesafe-place` and moves the packaged binary path into `desktop/package-options.js` (`packagedBinary`). When #379 lands first, `desktop/package-check.js` must read its paths from that helper; when this PR lands first, #379 must update the check.
5. Artifacts with `SHA256SUMS`: zip of `dist/desktop/TypeSafe Place-<platform>-<arch>` as `TypeSafe-Place-<version>-<windows|linux|macos>-<arch>-unsigned.zip` (ditto on macOS, zip on Linux, 7-Zip on Windows) plus `SHA256SUMS`, uploaded under the same name for 14 days, only when the fuse and asar check passed. The shell was run locally as macOS: 129.7 MB zip, `shasum -a 256 -c SHA256SUMS` OK. Pushed with stage 4c.
6. Profile, docs, verification: pending.

## Results

(recorded per stage below)

## Gaps and next step

Next: read the stage 4c run (Openbox on Linux, Windows launch trace and probe, artifacts), then commit the `desktop-package` profile and docs.
