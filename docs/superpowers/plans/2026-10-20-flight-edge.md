# Flight building-edge snag

Objective: prevent valid flight movement from being cancelled at walls and roofs.
Owner: codex-flight-edge-20261020. Branch: fix/flight-edge-20261020.
Baseline: 65896c72. User screenshot: ScreenShot Tool -20261020062705.png (flight above a roof).
Owned files: preview/src/flight.js, preview/tests/flight.test.js, this ledger.

Investigation: flight checks combined horizontal displacement and zeros both velocities on any obstruction. It also checks horizontal motion at a proposed descending height before rejecting that height at the current position. Walking already resolves horizontal axes independently. Server world.js validates swept submitted poses through the same canFly query; preserve it.
Contract: browser meters, X east/Y up/Z south, camera 1.68m above feet; flight disk radius 1.3m, roof clearance includes 3.1m equipment/bubble margin, cruise 4.5m/s and fast 14m/s, dt capped at .08s. No capsule/step/slope solver in flight. Keep dimensions and speed limits unchanged.

Checks: add failing wall-slide and roof-descent escape tests using createWalkingEnvironment; verify walls still block and roofs remain solid. Run focused suite, core gate, relevant browser coverage if available.
GitHub status reconciliation unavailable: gh is unauthenticated. Other worktree preserved.
Status: investigating; no runtime reproduction of the exact screenshot location yet.
Next: reproduce failures, patch resolution, record checks and acceptance gaps.

## Patch and regression evidence

The five new behavioral cases failed before the patch (no tangential progress / unable to leave roof). Resolve vertical clearance at the current position first; then keep valid horizontal movement components instead of resetting both. Preserve canFly geometry, flight ceiling and authoritative server validation.

| Synthetic route (real walking environment queries) | Result |
| --- | --- |
| Diagonal contact with a 10m x 60m building, both directions, cruise and fast | Pass; slides without entering footprint clearance |
| Descend over an 8m roof while moving toward its edge | Pass; leaves roof, then descends |
| Tall roof crossing and attempted landing through roof | Pass; existing test |
| Boundary, rotated footprint and mapped roof clearance | Pass; existing tests |
| Exact screenshot rooftop / two-client reconnect traversal | Not tested |

Commands so far:
- `node --test preview/tests/flight.test.js`: 13 passed, 0 failed.
- `pnpm test`: 3704 passed, 1 skipped, 0 failed.
- `pnpm run build`: passed (existing chunk-size warning).
- `pnpm run agent:doctor`: passed after `uv sync --locked`.
- First `pnpm run verify`: failed in unrelated archive tooling because system Python lacks tarfile.extractall(filter=...). Rerun with `PATH="$PWD/.venv/bin:$PATH"` in progress; tooling now passes.
- First browser attempt blocked by missing Chromium; installed via `pnpm exec playwright install chromium`, retry in progress.

## Final verification and handoff

- `PATH="$PWD/.venv/bin:$PATH" pnpm run verify`: PASS, all 11 phases; `.runtime/agent/core.json`. Counts: tooling 160 passed / 3 skipped; preview 3704 / 1; server 727 / 217; desktop 115 / 3; Python 145 passed. Redis-dependent tests remain skipped in core; full gate not run.
- `pnpm run test:experience render-budget`: FAILED on its initial district readiness wait (90 seconds), before flight controls. Browser receipt retained at `.runtime/flight-edge-browser.json`; generated tracked report restored. No exact rooftop, visual or two-client reconnect acceptance claim.
- `git diff --check`: passed.
- Dedicated sibling worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-flight-edge`. Main and the vite-env worktree preserved; local worktrees increased from 2 to 3.

Source patch complete with focused regression proof; live rooftop acceptance outstanding. No commit, push, merge or deployment performed. GitHub reconciliation remains unavailable without CLI authentication.
Next action: review patch, run the exact rooftop in a functioning district fixture, then commit/integrate with authorization. Preserve this checkout and its uncommitted files.

## Goal continuation review

Reclaimed existing branch for full acceptance. Expanded tests exposed two gaps in the first patch: a 45-degree wall cannot reliably slide using world axes, and rising diagonally across a roof edge can have clear endpoints but blocked authoritative sweep samples. Added mapped-wall contact normals and .15m sampled segment validation; all 50 focused cases pass, including 0/45/90-degree walls, both directions, cruise/fast, 144Hz/30Hz/.08s frames, corners, direct wall stop/reverse and rising-edge sweep.

New owned module: preview/src/walking.js (flight wall normal query). Collision dimensions and server rules unchanged. Full core receipt above predates these additions and must be rerun.

Browser diagnosis underway: observed 503s are /v1/settings/elevenlabs and /v1/settings/jev (optional bridge); 404 is /api/world-data?world=river-oaks. The default-world loader explicitly handles a missing manifest with the default district. Need final settled connection/store-people state; an inspection interrupted by source HMR is not valid evidence. No acceptance claim yet.

### Readiness root cause and independent review

Settled browser diagnostics at normal and UHD sizes confirm joined town, player ready, 88/88 store people, 199 placed trees and two planted beds. The old render-budget wait demanded 201 trees from raw branch_supports, ignoring treeSupports removal of Hopdoddy and Harry Winston duplicate supports. Updated its expectation using the same existing placement selector, without relaxing readiness. Optional bridge 503s and default-world manifest 404 are unrelated; no Vite envDir integration needed.

Independent review reproduced authoritative 200ms chord rejection while rounding a corner, despite individually clear render steps. Flight now validates candidates against pending/acknowledged origins, and submits one explicitly acknowledged pose at a time using the existing requestId protocol at the same200ms cadence. Origin receipts have identity (A-B-A cannot alias); callbacks are fenced by flight-state instance, pending work bounded. Walking/riding raw pose cadence and server validation unchanged. Server test matrix covers cadence phases and 0/200/500ms response delays.

First live mapped-roof route reached and held above building osm-way-625330792 but could not exit west while landing. A focused regression reproduced it with falling terrain under a roof: fixed above-ground altitude lowers world height into the roof. Horizontal candidates may now preserve current world height when original clearance fails, and still require the full authoritative sweep; this does not raise the world height over a wall.

Current focused command: `node --test preview/tests/flight.test.js server/tests/flight-path.test.js`: 65 passed. Final gates and two-client route still in progress. Earlier final verification section is superseded for the current expanded diff.

### Final review and acceptance preparation

Independent review now reports no remaining blocking findings and independently ran 67 focused tests, all passed. Review findings were resolved: authoritative send-cadence chords, receipt identity/lifecycle, one-outstanding-request backpressure, and steep-terrain vertical-speed compensation. Terrain fallback makes at most eight shortened attempts and retains 3m/s vertical motion.

- Mapped two-client flight-edge journey passed after final compensation bound, including wall sliding, roof landing contact, roof escape, landing, no movement corrections, and reconnect preserving position. Final durable route receipt being captured separately.
- render-budget passed after correcting tree placement expectations and closing the actual settings dialog before flight interaction. Local UHD rendering only, not a target-GPU performance claim.
- flight-pose-transport passed with real fixture HTTP/WebSocket: delayed response, snapshot traffic while acknowledgment held, real 8-second request timeout and bounded retry, return to normal walking transport, reconnect. Its movement provider is stubbed; the mapped route separately exercises the actual controller.
- multiplayer-lifecycle passed existing disposal/connect/reconnect invariants.
- `.runtime/flight-render-transport-final.json` and `.runtime/flight-transport-browser.json` retain those browser receipts.
- GitHub CLI now authenticates as BunsDev; refreshed origin/main equals base 65896c72. Final core is running with project Python PATH. Draft PR delivery is authorized; merge/deploy/retirement are not.

## Verified delivery candidate

- Final `PATH="$PWD/.venv/bin:$PATH" pnpm run verify`: PASS, all11 phases; `.runtime/agent/core.json`. Tooling160 passed/3 skipped, preview3743/1, server742/217, desktop115/3; Python145 passed. Redis-dependent skips remain excluded; no full gate, native or production-auth claim.
- `node --test preview/tests/flight.test.js server/tests/flight-path.test.js`:67 passed,0 failed/skipped; independently reviewed.
- `pnpm run test:experience render-budget flight-pose-transport`: both PASS; `.runtime/flight-render-transport-final.json`.
- `pnpm run test:experience flight-pose-transport multiplayer-lifecycle`: both PASS; `.runtime/flight-transport-browser.json` (before the additional successful timeout assertion run).
- `RIVER_OAKS_E2E_REPORT=flight-edge-20261020.json pnpm run test:experience flight-edge`: PASS on final controller code and strengthened assertions. Durable evidence: `data/reports/flight-edge-20261020.json`; mapped building osm-way-625330792 near Equinox, normal keyboard traversal, authoritative and guest positions at seven milestones, zero corrections. Both clients confirm altitude0 before disconnect; reconnect remains grounded at the same location. Screenshot: `output/playwright/flight-edge-roof.png` (local, ignored).
- `git diff --check`: PASS.

Implementation, independent review and local acceptance are complete. Signed commit and draft PR identifiers are recorded in the live register at handoff. This is a delivery candidate, not a merged/deployed change. No worktree retirement or unrelated task reconciliation was performed. Main and other agents' worktrees are preserved.
