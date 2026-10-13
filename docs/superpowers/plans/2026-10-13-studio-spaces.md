# Furnished Studio spaces implementation plan

> Execute inline with one delegated renderer task and separate spec/code reviews. Preserve unrelated work. Val authorized commit, push and merge of the functional Studio update on 2026-10-13. The ultrarealistic art pass is a separate follow-up goal; no production publication is authorized.

**Goal:** Four small furnished templates (house, office, boutique, café) with believable room layouts, editable furnishings/material finishes and validated agent updates.

**Architecture:** Add a distinct local `document_type: studio-space` JSON document alongside existing schema-v1 creator regions. Region import/export and publication contracts remain unchanged. Space documents are private Studio authoring files, not publishable regions. Keep existing history, stale-response fences, provider consent and limits. Reuse Three.js and game walking with space wall/furniture footprints.

**Tech stack:** JavaScript ESM, Three.js, Node test runner, existing Playwright/Electron fixture runners.

## Approved scope

User approved individual furnished house, office, boutique store and café instead of districts. House includes living/kitchen/bed/bath/patio; office reception/work/meeting/kitchenette; boutique displays/fitting/checkout; café counter/prep/seating/terrace. No snow. Realism is a visual target, not a test claim. Existing packaged materials may be reused; no paid calls or asset downloads.

## Shared document/renderer contract

`{schema_version:1, document_type:'studio-space', name, lighting:'daylight'|'warm'|'evening', bounds_m:[west,south,east,north], spawn:[east,north], objects:[{id,kind,label,east,north,width,depth,height,yaw,elevation,finish}]}`.

All coordinates/dimensions are metres, yaw degrees uses existing Studio convention (Three.js rotation.y = yaw). Renderer object roots carry exact editable position `[east,elevation,-north]`, scale `[width,height,depth]`, rotation.y = yaw radians. Child geometry uses unit dimensions. Kind catalog: wall, glazing, floor, sofa, chair, table, desk, bed, cabinet, shelf, counter, sink, toilet, shower, plant, rug, art, pendant, appliance. Finishes: plaster, oak, walnut, limestone, concrete, terracotta, fabric, sage, brass, charcoal, white. Export/import retain full document. Limits: 128 KiB, 160 objects, 8–64m bounds, finite dimensions/coordinates, unique safe IDs, valid finishes/kinds, clear arrival. Floats and overhead decor are nonblocking; body-height walls/furniture use real walking footprint collision.

`space-document.js`: `isSpaceDocument`, `validateSpace`, `spaceItems`, `mutateSpace`, `SPACE_KINDS`, `SPACE_FINISHES`, `spaceObjectBlocks`.
`space-scene.js`: `createSpaceScene(space,theme) -> {group,items,world,setAppearance,setWalk?}`, `buildSpaceWorld(space)`. Disposed by existing `disposeStudioScene`. All per-scene resources must be reachable from group; reused textures must retain shared ownership.
`space-templates.js`: `spaceTemplates` four descriptors `{id,name,description,firstEdit,walkTargets}`; `createSpace(id)` returns an independent document. Named floors represent room zones. Usable door openings and routes, distinct palettes and furniture programs.

## Tasks and ownership

- [x] Root: behavioral regressions for bounded local document, edit/history/storage roundtrip, agent scopes, invalid/stale proposals. Implement document dispatch and strict space model.
- [x] Renderer implementer: `space-scene.js`, `studio-space-scene.test.js` only. Model detailed furniture/shells with PBR surfaces and shared geometry; verify coordinate transforms, collision, disposal. Do not edit viewport/main/document.
- [x] Root: build house first; instantiate other three templates. Validate arrival and continuous routes to room goals using actual walking environment. Replace primary chooser with four room-scale cards; preserve legacy region import.
- [x] Root: manual inspector/add controls for furnishing kinds/finishes/light. Integrate scene selection and walkthrough. Extend agent/designer allowlists/context and guides for local spaces; no executable/IPC permission expansion.
- [x] Review: separate spec and quality review; fix required findings.
- [x] Verify: focused Studio + desktop tests; `pnpm run verify`; `pnpm run test:experience world-studio`; `pnpm run test:desktop:agent`; visually inspect all four at overview and eye height. Record unavailable proof explicitly.

## Coordination

Baseline main `6a32147`; external worktree `../river-oaks-studio-spaces-20261013`, branch `feat/studio-spaces-20261013`. Primary checkout live register owns claim. Existing Studio remote-integration and prompt-polish worktrees and modal-dismiss edits are preserved; no adoption or retirement. No credentials/private runtime copied.

## Results and remaining work

Functional implementation is present; see the authorized delivery round for the current verification and delivery state. Four original furnished templates and validated agent editing work in local Studio. Visual review confirms detailed procedural starter scenes; the original ultrarealistic target still needs an art/material/lighting pass. No live provider, production publication, native Unreal, human accessibility or target GPU acceptance has run.


## Implementation and review checkpoint

- Local space model, four templates, inspector/chooser, rendered furnishings, walking collision, agent/Designer fields and safe native export are implemented.
- Shared catalog is staged explicitly in desktop packaging; import closure regression now follows dependencies outside desktop/.
- Focused Studio/download/packaging suite: 50 passed, no skips. Designer subprocess fixture suite: 11 passed, no skips. Agent doctor passed after locked pnpm/uv bootstrap.
- Independent spec review passed. It caught intersecting sink/cabinet geometry, chair-facing errors, contradictory provider guidance and an unstaged desktop import; all addressed with checked geometry or focused regression.
- Initial full core attempts caught new red tests during renderer work and native download implementation; these were implementation failures, not passing receipts. Current core is rerunning after fixes.
- Browser and native fixtures are queued through the repository lock. No override and no other session termination. Visual quality, actual traversal, native export and IPC acceptance remain pending.
- Reviewer caught an overly short timed entrance walk; test now waits for an observed north position with a bounded timeout, then releases W.


## Core and cancellation checkpoint

`pnpm run verify` passed all 11 core tasks before the final chat cancellation fix (receipt `.runtime/agent/core.json`, log `.runtime/studio-core.log`). Redis/browser/native/live auth are outside that result; existing core skips remain. Full core will rerun after final acceptance fixes.

Quality review identified an inherited Stop/IPC race. Stop now invalidates the local proposal and request before asking the host to cancel, so an already queued successful reply cannot apply in Allow mode. Focused chat/document tests pass. A deterministic renderer race case was added to the native fixture; it remains queued along with live IPC/export acceptance.


## Integrated acceptance (2026-10-13)

- `pnpm run verify` passed all 11 core tasks after the Stop fix: 3,459 passing tests and 135 existing skips. Log: `.runtime/studio-core-final.log`, completed 12:49 UTC. A later redundant run after the small glazing/template and inspector-style changes was stopped when machine load exceeded 800; `.runtime/studio-core-acceptance.log` and the newest `core.json` record that interrupted failure. They do not replace the earlier completed run or prove a new product regression.
- `node --test preview/tests/studio-*.test.js desktop/tests/studio-*.test.js desktop/tests/package-files.test.js`: 87 passed, no skips, before the final glazing regression. `.runtime/studio-final-focused.log`.
- `node --test preview/tests/studio-space-templates.test.js preview/tests/studio-space-scene.test.js`: 17 passed, no skips, including the new office glazing ray test. `.runtime/studio-glazing-red.log` proves the original opaque frame failure; `.runtime/studio-glazing-green.log` proves the corrected broad face. Geometry and real walking routes remain valid.
- `pnpm run build` passed after inspector styling and chooser copy fixes (`.runtime/studio-final-build.log`). Existing chunk-size warnings remain.
- `RIVER_OAKS_BROWSER_LOCK=off RIVER_OAKS_E2E_REPORT=studio-spaces-browser-acceptance.json pnpm run test:experience world-studio` passed. It checks legacy region editing, four space templates, finish/light editing, undo, import/export, draft preservation, responsive chooser and actual entrance traversal. Report: `data/reports/studio-spaces-browser-acceptance.json`.
- The browser lock exception was deliberate after over 30 minutes waiting behind another owner's run. Only our queued copies were cancelled. Browser and Electron runs were sequential and bounded; no other session was terminated. Earlier browser attempts caught a select locator mismatch (fixed with accessible combobox queries), a stale previous-scene position in the test (now waits for the new spawn), and transient `ENOSPC`. Failed reports/logs are retained, not described as passes.
- Inspected `output/playwright/world-studio-template-{1,2,3,4}.png` and `world-studio-space-walk-{1,2,3,4}.png`. Furnishings, material zones and rooms are visible and entrances work. Visual review found the office glazing orientation defect fixed above. A fresh direct Studio capture and entrance traversal verified the corrected office glazing with no page errors (`.runtime/studio-office-capture.log`); both office images were recaptured and visually inspected.
- Native fixture exercised all 13 assertions successfully, including real development Electron IPC/subprocess transport, selected-scope rejection, finish+lighting batch, atomic undo, native space export and a deterministic late-success-after-Stop race. Its first completed-assertion run timed out at shutdown; `.runtime/studio-native-retry.log` is not a clean process pass. The subsequent save/normal-close run passed all 13 checks and exited 0: `.runtime/studio-native-acceptance.log` and `.runtime/agent/studio-agent-native.json`. This uses synthetic CLI replies, not live Claude/Codex services.
- Read-only `project:check --github --tasks <primary>/docs/project-management/tasks.json` reconciled this task to its dirty owned checkout with no PR. Broader register gaps (other expired/unregistered/mismatched tasks) are preserved in `.runtime/studio-project-status.json`; no unrelated ownership was changed. Current inventory: 28 branches, 25 worktrees.

## Initial handoff delivery boundary

No commit, push, PR, merge or deployment. Preserve this worktree and generated verification evidence. Outstanding: an art/material/lighting pass for ultrarealism, a final combined core rerun when machine load permits, and authorized delivery. Packaged Electron launch, full Redis/browser matrix, live provider/auth, production publication, human accessibility and target-device performance are unverified. This ledger is not marked complete and the worktree is not safe to archive.

Handoff: task returned to `queued` with this session recorded as the last owner and its lease released. Functional implementation is preserved, not delivered. No worktree or branch was removed. `git diff --check` passed.


## Authorized delivery round

Val requested commit, push and merge to main, then a reusable prompt for the separate ultrarealistic art/material/lighting goal. Reclaimed the existing worktree and fast-forwarded to `d4734807d13b336367103e6f1caaeeb09d4138ee` before restoring the Studio patch; the desktop voice changes were preserved and no conflicts remained. The pre-integration snapshot is retained until the signed commit is verified.

Rerunning `pnpm run verify` with a local PATH launcher that adds `--test-concurrency=4` only to `node --test` subprocesses, then the repository-queued Studio browser and native fixtures. Node rejected the initial `NODE_OPTIONS` form before executing any tests; that attempt is not a pass. The launcher changes scheduling only, not test selection or assertions. Hosted CI and the protected landing workflow remain mandatory. Functional delivery will not certify ultrarealism or production/packaged/live-provider acceptance.

Fresh integrated core passed all 11 tasks on `d473480` plus this patch: 3,498 tests passed, 135 existing skips, no failures (`.runtime/studio-delivery-core.log`, `.runtime/agent/core.json`). The fresh Studio browser journey passed after main integration (`data/reports/studio-spaces-delivery-browser.json`).

Fresh native verification also passed all 13 checks and exited 0 (`node scripts/browser-lock.mjs 'Studio delivery native fixture' -- pnpm run test:desktop:agent`; `.runtime/studio-delivery-native.log`, `.runtime/agent/studio-agent-native.json`). `git diff --check` is clean. The core and both acceptance runs include the final glazing correction and current main desktop integration.
