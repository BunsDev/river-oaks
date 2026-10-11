# World Studio implementation plan

> Execute with the coding workflow and independent spec/quality review. No commit or transport is authorized.

**Goal:** deliver a custom Three.js/Electron region authoring loop: open, select, transform, undo/redo, save/reopen, and walk through a private draft.

**Architecture:** a dedicated `/studio.html` entry uses plain ESM and the existing schema-v1 creator region contract. A document module owns bounded validation/history/persistence; a Three.js viewport owns disposable rendering and controls; the UI owns accessible object selection and numeric properties. Playtest uses the existing movement/collision functions without joining or mutating the shared world. Electron supplies navigation and narrowly scoped JSON downloads.

**Tech stack:** existing Three.js, OrbitControls/TransformControls, Vite, Electron, Node tests and Playwright fixture journeys. No additional dependencies.

## Ownership and baseline

- Owner Cody; claim `cody-world-studio-20261009` (registry record, not an atomic runtime lease).
- Worktree `/Users/buns/Documents/GitHub/BunsDev/river-oaks-world-studio-20261009`.
- Branch `cody/world-studio-20261009`; fetched canonical base `c98351ac1ba478eeb6e3c218caf5306c2471723f`.
- Primary and native SDK worktrees preserved. No credentials/private runtime copied.
- Canonical execution ledger: `/Users/buns/.coven/workspaces/familiars/cody/handoffs/river-oaks-world-studio-20261009.json`.
- Initial baseline could not import Three.js before dependencies; install with locked `npm ci`, then doctor and rerun.

## Scope and design

The first editor authors creator regions, including buildings, trees, meeting places and arrival. Existing roads, terrain and parcels survive save/reopen; broader road/terrain brushes, asset import and shared publication UI are separate increments. The document stays a region package compatible with existing server publication. Imported GIS district manifests are rejected rather than misrepresented as editable region packages.

Layout: compact top command bar; left scene list and add palette; central perspective viewport; right property inspector; bottom position/selection/status strip. Palette: graphite `#222d30`, pale sage `#e8eeea`, forest `#365b49`, mint `#a8cab7`, chalk `#f5f8f6`, muted rose `#b78b83`. System sans for controls, Georgia for the small World Studio wordmark, system monospace for measurements. Signature: the world is presented as a bounded miniature on a survey grid, with metre-based property controls. Avoid remote fonts/assets and ornamental dashboard cards.

## Tasks and acceptance

- [x] Document/history: create `preview/src/studio/document.js`, `preview/tests/studio-document.test.js`. Test real region mutations, invalid import rejection without mutation, full bounds, undo/redo branching and bounded history, save failures and newer-tab conflicts. `node --test preview/tests/studio-document.test.js` must fail before implementation and pass after.
- [x] Scene: create `preview/src/studio/scene.js` and scene tests. Terrain uses the existing height sampler; east/north metres map to x/-z. Each selectable object resolves to a stable ID. Translate/rotate/scale commit one transaction on drag completion; rejected transforms restore the old scene. Resource cleanup and imported heights tested.
- [x] UI/entry: create `preview/studio.html`, `preview/src/studio/main.js`, CSS, and Vite multipage build. Add game entry link without editing concurrent `main.js`. Inspector and keyboard must work without pointer gizmos; typing must not trigger editor shortcuts. Save on device, reopen on reload, download/import JSON, explicit unsaved-change handling.
- [x] Walkthrough: enter at draft arrival using `createWalkingEnvironment`, `createWalkingState`, `stepWalking`; WASD plus drag look, Escape returns to editor, edits disabled during preview, visibility/blur clears keys, no server commands.
- [x] Electron: delegated writer owns only `desktop/main.js`, new JSON download guard/tests, optional focused desktop journey, `docs/desktop.md`. Same-origin Studio menu/return navigation; preserve auth, sandbox/isolation and bounded blob download checks.
- [x] Acceptance: add `preview/e2e/world-studio.js` to existing experience runner. Real fixture journey verifies access, add/select/transform/undo/redo/save/reload/import/export, playtest movement and return, small viewport, error-free render and screenshot. No external paid APIs.
- [x] Run `npm run agent:doctor`, focused tests, `npm run test:experience -- world-studio`, desktop integration smoke, `npm run verify`, and `git diff --check`. Independent spec review then quality review. Fix actionable findings and rerun affected checks.

## Delivery limits

No claim of Unreal parity, public publication, custom engine, packaged release, production auth acceptance or human accessibility. The implemented local authoring loop must be complete and evidenced before handoff. Preserve the uncommitted worktree for review/integration.

## Results

The requested local authoring loop is **verified**. Final core, browser, native
and security checks completed successfully; the worktree remains uncommitted.

### Opened implementation locations

Paths are relative to the worktree above; each was opened and inspected in this task.

- `preview/src/studio/main.js` → `startStudio`: editor layout, property form, file actions and keyboard workflow.
- `preview/src/studio/document.js` → `createStudioDocument`: transactional region edits, bounded undo/redo and device persistence.
- `preview/src/studio/viewport.js` → `createStudioViewport`: Three.js controls, pointer selection, transforms and private walkthrough.
- `preview/src/studio/scene.js` → `createStudioScene`, `frameStudioObject`: disposable scene geometry, terrain registration and elevation/aspect-aware framing.
- `preview/src/studio/limits.js` → `assertStudioBudget`: reject more than 256 road segments or 8192 metres before geometry allocation, preserving the current draft.
- `desktop/main.js` → `loadGame`, `createWindow`: native navigation, unsaved-change protection and crash recovery.
- `desktop/studio-download.js` → `studioDownloadAllowed`: bounded same-origin JSON export policy.
- `server/game-assets.js` → `protectedGameAsset`: Studio documents/chunks stay gated; extracted Vite preload polyfill can load before sign-in.

### Verification results

- `UV_CACHE_DIR="$PWD/.runtime/uv-cache" TMPDIR="$PWD/.runtime/tmp" npm run verify`: passed on the final implementation. Agent tests 17/17; preview 2567 passed, 1 skipped; server 295 passed, 105 skipped; desktop 11/11; Python 141 passed. Build, lint, format, demo/expected-block verification and secret scan passed. The 106 skips are not acceptance evidence. Receipt `.runtime/agent/core.json`; log `.runtime/core-studio-final.log`.
- Doctor passed after locked npm/Python dependency setup; no new runtime dependency.
- `node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js server/tests/app.test.js server/tests/middleware.test.js`: 31 passed, no failures/skips. Red/green covers document integrity, real ground triangles, elevated maximum-zoom framing and standalone HTTP preload access.
- `RIVER_OAKS_E2E_REPORT=world-studio-browser.json npm run test:experience -- world-studio`: passed. Actual rendered gizmo drag/one-edit undo, save/reload, selection, import/export, WASD/return, anonymous access and 1440/900/390px layouts. Receipt `data/reports/world-studio-browser.json`; no page errors.
- `node desktop/studio-e2e.js`: 9 passed, including native menus, export, oversized download denial, discard/cancel, isolation, canceled close and subsequent crash recovery. Receipt `.runtime/agent/studio-desktop.json`. The test supplies the native save destination.
- `TMPDIR="$PWD/.runtime/tmp" npm run test:security:e2e`: 2 passed, no skips. Final run was serial after build/native completion. Intermediate failures: blocked extracted preload helper (fixed), a build deleting the served output during a parallel run, and concurrent Vite optimization during native smoke (rerun serially).
- Independent specification review accepted the requested loop. Independent quality review has no remaining required findings after framing, native cancellation and asset-gate fixes.
- Desktop and narrow screenshots were reopened and visually inspected after the final browser run. No temporary preview server is retained.

### Unverified scope

Full Redis/audit/browser matrix, production WorkOS, hosted CI, packaged/signed release,
manual native Save-dialog interaction, human accessibility and general hardware
performance remain unverified. Terrain/road brushes, imported asset libraries and
shared publication UI are future scope. Roads and terrain render and survive
roundtrip, subject to the documented editor resource budget. Buildings are solid
blockout volumes in the private walkthrough.

### Integration

No commit/push/merge/deployment was requested or performed. Preserve this uncommitted
worktree. Before any later integration, refresh canonical remote/main and recheck
concurrent changes to the Vite inputs, game asset gate and desktop runtime.
