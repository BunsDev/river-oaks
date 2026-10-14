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
3. Fuse and asar checks: `desktop/package-check.js` reads the fuse wire with `@electron/fuses` `getCurrentFuseWire` and compares it with `desktop/fuses.js` (flipped, missing, undecided or differently versioned fuses are drift), and lists the asar from its header (no new dependency) against `DESKTOP_FILES`, `DESKTOP_SHARED_FILES`, the world-design pack and `package.json`, failing on anything missing or extra. Unit tests in `desktop/tests/package-check.test.js` (5, synthetic asar and wires). Locally on macOS arm64: fuses match, 17 files, `ok: true`. Pushed as stage 3.
4. Development e2e per platform: pending.
5. Artifacts with `SHA256SUMS`: pending.
6. Profile, docs, verification: pending.

## Results

(recorded per stage below)

## Gaps and next step

Next: read the stage 3 run, then add the development e2e per platform (xvfb and Mesa on Linux).
