# Creative photo mode

Objective: let players compose clean world screenshots and save/share them through a deliberate preview flow.

User-confirmed scope: browser and desktop photo mode using the shared renderer. Preserve native edits and the existing agent-workflow patch.

- [x] Inspect camera/render/input ownership and UI conventions.
- [x] Implement photo mode, framing/crop controls, clean canvas capture and preview/export.
- [x] Cover capture failures, camera restoration and output framing with behavioral tests.
- [x] Run build, targeted tests and a real browser journey; record limitations.

No automatic posting/uploading. Native Unreal and real OS sharing remain separate acceptance scopes.

## Delivered

- Photo mode in Commands and the play rail: pan/tilt/roll, lens movement/FOV,
  five crop formats, three looks, rule-of-thirds grid, compact composition controls.
- Final-frame canvas capture, bounded PNG preview/download, opt-in native file
  sharing where supported, encoding/timeout failure recovery and stale-session fences.
- Camera/lens/HUD restoration; no shared-world pause or avatar teleport.
- Desktop photo-download exception validates trusted initiating origin, window,
  user gesture, photo filename, PNG MIME and size. Other downloads stay blocked.
  Packaging includes the new policy module.

## Verification

- Focused camera, keyboard, render lifecycle and desktop unit suites: 17 passed.
- Production web/landing build: passed (existing chunk-size warning).
- `RIVER_OAKS_E2E_REPORT=photo-mode.json npm run test:experience -- photo-mode rail-navigation`:
  both journeys passed. Includes rendered image pixels, PNG dimensions/download,
  failed encoding, late callbacks, sharing cancellation, mobile crops and control layout.
- `npm run test:desktop:photo`: passed in development Electron with an actual
  joined loopback shared town. Saved a square PNG through the real download handler;
  a non-photo blob remained blocked. The test sets a temporary destination instead
  of interacting with the native Save dialog. No provider calls or external sharing.
- `git diff --check` and JS syntax checks: passed.
- Receipts: `data/reports/photo-mode.json`, `data/reports/photo-mode-desktop.json`.
  Screenshots: `output/playwright/photo-mode-{preview,mobile,desktop}.png`.

## Limits and handoff

Native Save dialog interaction, completed OS sharing, packaged Electron release,
live auth and human accessibility review remain unverified. Unreal is outside the
confirmed scope. No deploy, commit or push; changes remain in `chore/agent-workflow`
alongside the earlier agent-workflow work. Keep the worktree until delivery.

## Delivery preparation

Val authorized commit, push and merge. The change is rebased onto main `297d9bb`;
independent review found no important issues and confirmed Blob preview compatibility
with the updated content security policy. Browser/Electron acceptance is rerun on
that integrated tree; the checked-in receipts record the results. See the repository
PR for final commit, CI and merge status. Unrelated native work remains untouched.

## Shared-only main integration

Integrated main `772cab2` after PR #170 removed the solo runtime. Photo mode now
requires a connected, non-traveling shared session; account landmarks and removed
solo controls remain as on main. Independent integration review found no important
issues. Fresh `npm run verify` passed: 10 tooling, 650 preview, 267 server (101
Redis skips), 9 desktop and 139 Python tests, build, Ruff, offline pipeline and
secret scan. Named photo-mode, rail-navigation and connection-required browser
journeys passed. Development Electron photo acceptance passed again. The checked-in
photo receipts record these new runs; manual acceptance limits above still apply.
