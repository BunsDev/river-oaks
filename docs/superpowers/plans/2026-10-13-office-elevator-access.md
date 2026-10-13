# Private office elevator and traversal

Objective: connect the approved futuristic office to the playable district with an avatar-specific elevator cinematic, walking controls, and server-enforced visit permission. Jevica's authenticated admin accounts are the only initial owners. Approved accounts additionally need ownership, an owner invitation, or an accepted request.

Owner: codex:office-elevator-access-20261013. Branch: feat/office-elevator-access-20261013. Baseline: 6a32147. Primary checkout has unrelated live task-register edits; implementation is isolated in sibling river-oaks-office-elevator-20261013.

**Current status:** fresh verification on current main passed. Signed commit, PR and protected landing authorized and in progress.

## Plan and ownership

1. Inspect existing account, world command, persistence, avatar and movement seams.
2. Add authoritative office grants, request approval/revocation and entry/exit; validate on memory and Redis transport.
3. Place an office entrance in the district without displacing a mapped tenant; add elevator walk-in/ride/reveal cinematic, skip/reduced motion and fail-closed loading.
4. Reuse finished office geometry and actual avatar; bound walking against walls/furniture, support pointer/keyboard/touch, return to the street and fence stale transitions.
5. Run focused regressions, core verification and browser/shared journeys; inspect rendered arrival and traversal.

Files: new office modules/tests; narrow integrations in world.js, main.js and transport validation as needed. The stage agent owns its separate main.js provider integration. No production state, paid media generation, credential copying or native changes.

## Evidence

- Initial inspection: office is currently fixture-only; existing Jevica identity uses explicit WorkOS account IDs, separate from appearance.
- Task register inspected: no overlapping office implementation; world.js stage work and main.js stage provider are isolated in another worktree.
- Source implementation is complete; browser verification remains in progress. No delivery claim.

## Remaining

Reverify the implementation, integrate current main and land through the protected PR queue. Live WorkOS, production deployment, human accessibility and target-device performance remain separate acceptance scopes. Commit, push and merge are now authorized; deployment is not part of this delivery.

## Implementation and checks in progress

- Added `office` world commands (list, request, invite, approve, deny, revoke, enter, move, leave) through the existing authenticated world transport. Guest lists and requests are returned only to Jevica. No new auth bypass or provider call.
- Checkpoint version 6 fences older writers. Existing v1–v5 fixtures upgraded; migration retains grants/requests for retained offices. Current visits use separate office coordinates, swept collision and speed budgets; district interactions are refused while upstairs.
- Reused the existing Equinox-block lobby and finished office. Added the avatar elevator sequence, skip/reduced motion, first-person walking, touch controls, owner management inside the office, contextual guest requests, and voice controls/spatial coordinates.
- Baseline: existing world/workplace suites 60/60 passed. New focused memory and Redis HTTP/WebSocket tests passed with zero skips. Geometry/lifecycle/spatial-voice checks passed. Legacy checkpoint checks 17/17 passed after updating prior-version fixture construction.
- Reviewer findings addressed: checkpoint writer fence/migration, full avatar turning clearance, spatial voice and reachable controls, visible denied-entry/request flow.
- First core run: preview 2754 pass / 1 pre-existing skip; server 602 pass / 2 legacy-version assertions failed. Fixtures corrected; full rerun running.
- Browser office and shared suites wait their turn in the common repository queue; do not claim cinematic/traversal visual acceptance until they execute.
- Dependencies installed with `pnpm install --frozen-lockfile` and `uv sync --locked`. Test Redis is an owned no-persistence server on loopback port 16391; production Redis is not used.

## Verification update

- `REDIS_URL=redis://127.0.0.1:16391 pnpm run verify`: core passed at 13:01 UTC. Agent 76/76; preview 2761 pass / 1 pre-existing skip; server 605/605 with Redis enabled; desktop 49/49; Python 141/141; build/lint/format/secrets passed. Receipt `.runtime/agent/core.json`; log `/tmp/river-oaks-office-verify-complete.log`.
- Redis writer lease is `v6`, matching the new checkpoint; takeover of an active v5 writer and refusal of a future v7 writer passed in the 27/27 Redis/office regression run.
- Follow-up UI regressions reproduced and fixed pending-permission entry, duplicate scene creation while failed-load exit is pending, and request dialog closure on approval.
- Boarding now begins outside the through-car elevator and closes both portals for the ride; contract and lifecycle tests passed after the path update.
- First office browser attempt failed at the boarding wait with its local fixture connection refused; no playback acceptance. This overlapped a source change watched by Vite. Retry queued against stable sources.
- Shared-town browser run has passed multiplayer-dev; remaining journeys are still running.

- Full shared run completed: **17/19 passed**; `shared-seating` timed out joining its guest and `world-map` failed the departed-player status assertion. These are unresolved checks, not proven baseline failures. Focused retries queued. Receipt: `data/reports/office-shared-experience.json`.
- Read-only `project:check --github --tasks <primary>/docs/project-management/tasks.json` exited 1 with existing register/retirement gaps outside this task; no gap named `office-elevator-access`. Receipt `.runtime/office-project-status.json`.
- Final review found cinematic actor initialization used office spawn before boarding; initial local position now matches the outside-car boarding frame, avoiding interpolation through closed doors. Latest focused office/UI/voice tests 16/16 and build passed; final core rerun running.

## Rendered scene and final core

- Final stable-source core rerun passed (`/tmp/river-oaks-office-final-core.log`): agent 76, preview 2762 pass / 1 existing skip, server 605, desktop 49, Python 141; total 3633 passing tests. All build/lint/format/secrets steps passed.
- Added `preview/e2e/fixtures/office-elevator.html` to isolate the real office scene and real Jevica avatar. A small SwiftShader-only run deliberately ran outside the full-world queue, without GPU rendering or a town session. It rendered boarding, closing, ascent, arrival and first-person office successfully; screenshots inspected at `output/playwright/office-render-*.png`, receipt `output/playwright/office-render.json`. This proves sampled scene framing only, not full-world UI/transport playback.
- The full-world office and two failed shared checks remain queued behind another task's browser run.

## Integrated acceptance

- Stable office browser journey passed in 67.85 seconds on Chromium/Apple M3 Max Metal: all six cinematic phases, WASD movement, wall/storage collision, exit focus, reduced-motion entry, denied uninvited guest, owner acceptance from upstairs, guest entry and live revocation. Screenshots inspected: `output/playwright/office-elevator-boarding.png`, `office-elevator-ride.png`, `office-walking.png`, `office-guest.png`. Receipt `data/reports/office-experience.json`.
- The test explicitly requests normal motion for the cinematic, records phase history rather than depending on a narrow polling window, and tests reduced motion separately. No normal-F bypass was reproduced in independent snapshot-before-ack lifecycle review.
- Both shared failures passed focused retries: `RIVER_OAKS_SHARED_JOURNEY=shared-seating pnpm run test:shared development` and `RIVER_OAKS_SHARED_JOURNEY=world-map pnpm run test:shared development-world`. Retain the original 17/19 receipt and both passing retry receipts; do not rewrite the original run as green.
- After inspecting the guest screenshot, added a first-person proximity visibility rule so an overlapping arrival avatar does not fill the camera. This does not change movement or permissions. Regression reproduced the clipping predicate and now passes. Final office/UI/scene/voice focused checks: 17/17. Core and office browser are rerunning for this final visual correction.
- Full-world office retries used a deliberate bounded queue exception after the preceding task repeatedly stalled in a 100%-CPU page script while its GPU process was almost idle. Each run was capped at 360 seconds and owned fixtures were stopped by the runner; no other task process was interrupted.

## Final handoff

- Final `REDIS_URL=redis://127.0.0.1:16391 pnpm run verify` passed at 13:40 UTC: **3634 tests passed**, one existing Vince glass-approach skip (already obstructed approach), zero failures. Agent 76, preview 2763, server 605, desktop 49, Python 141. Build, Python lint/format and secret scan passed. Receipt `data/reports/office-core.json`; log `/tmp/river-oaks-office-verified.log`.
- Final `pnpm run test:experience office-visit` passed after the overlapping-avatar visibility correction; updated guest screenshot inspected and camera is clear. Receipt `data/reports/office-experience.json` (13:39 UTC). The bounded wrapper exited 0.
- Shared acceptance: original `pnpm run test:shared` was 17/19; both focused retries passed. Evidence stays separate in `data/reports/office-shared-experience.json`, `office-seating-retry.json`, and `office-map-retry.json`. No remaining failed shared journey after retry.
- Independent review findings addressed: persistence/writer fence, measured turning clearance, voice coordinates/controls, visible access requests, permission-fetch race, failed-load fencing, initial cinematic actor position.
- No live WorkOS, production, native Unreal, target-device performance or human accessibility acceptance was performed. No commit, push, PR, merge or deployment was requested or made.
- Task released to queued for review/delivery; branch/worktree and all source/receipts/screenshots preserved. Do not archive or retire this worktree while its edits remain undelivered.

- Handoff `project:check --github --tasks <primary>/docs/project-management/tasks.json` completed: 17 unrelated reconciliation gaps, none for this task. Current inventory: 24 worktrees, 27 local branches; this task added one isolated worktree/branch and retired none. Owned no-persistence Redis on port 16391 is stopped; browser runners closed their owned fixtures.

## Authorized delivery

- User requested commit, push and merge to main, plus a grounded roadmap for productive and enjoyable office work. Reclaimed the existing feature branch and live task; no new worktree.

- Integrated current main `846a0aa` before delivery. Resolved the shared world projection/command/checkpoint conflicts by preserving both office visits and the newly delivered stage performance. Preserved both plan-index entries.
- Independent integration review approved: 37 focused tests passed, zero skips; a combined office/stage checkpoint probe retained the office visitor, restored the performer offstage, preserved permissions and separated voice spaces. No review blockers.
- Fresh `RIVER_OAKS_E2E_REPORT=office-delivery-experience.json pnpm run test:experience office-visit` passed all nine checks in 61.379 seconds through the normal browser queue. Boarding, office walking and guest screenshots inspected. Receipt `data/reports/office-delivery-experience.json`.
- Landing uses the standard shared queue and a local REST adaptation of the installed merge guard. It preserves check, merge-state and verified-signature requirements, and pins the merge to the reviewed head SHA. No protection override.

- Fresh integrated core passed: `REDIS_URL=redis://127.0.0.1:16391 pnpm run verify`, **3686 passed, one existing geometry skip, zero failures** (agent 76, preview 2807, server 611, desktop 51, Python 141). Redis tests ran with no skips. Build, lint, format, synthetic pipeline and secret scan passed. Receipt `data/reports/office-delivery-core.json`; log `/tmp/river-oaks-office-delivery-core-20261013.log`.

## Cycling merge integration

- PR #317 opened with signed commit `29fc2aa`. While queued, cycling PR #315 landed at `2642eda`; merged it locally and preserved both office departure and borrowed-bike release in player cleanup. Independent read-only review found no blockers and exercised bike → lobby → office, blocked cycling upstairs, checkpoint coexistence and disconnect cleanup.
- Integrated core passed again: `REDIS_URL=redis://127.0.0.1:16391 pnpm run verify`, **3719 passed, one existing geometry skip, zero failures** (agent 76, preview 2820, server 631, desktop 51, Python 141). Receipt `data/reports/office-cycling-integration-core.json`.
- First integrated browser retry timed out at reduced-motion reentry after exit; five earlier checks passed, with no page exception and two HTTP 503 console entries. Retained `data/reports/office-cycling-integration-experience.json`. A diagnostic rerun passed all nine checks with the elevator enabled at reentry (`data/reports/office-reentry-diagnostic.json`); the original timeout was not proven to be a product regression.
- Replaced synthetic elevator-button clicks with Playwright clicks that wait for visible, enabled controls. This removes the test's opportunity to silently click a still-disabled control while leave acknowledgement/render state settles. Product code and permissions are unchanged by this test adjustment.

- Final readiness-aware browser run passed all nine checks: `RIVER_OAKS_E2E_REPORT=office-cycling-integration-retry.json pnpm run test:experience office-visit`. Receipt `data/reports/office-cycling-integration-retry.json`. Integrated source and focused browser changes verified before signing the merge commit. Hosted CI and protected merge remain pending.

## Studio and cycling menu integration

- Integrated main `ca7c6f7` (Studio spaces and cycling leaderboard). The only source conflict was the Play menu initialization; retained both the cycling leaderboard panel and office UI. Independent read-only integration review approved without blockers.
- `RIVER_OAKS_E2E_REPORT=office-menu-integration-experience.json pnpm run test:experience office-visit` passed all nine checks in 67.989 seconds. Receipt `data/reports/office-menu-integration-experience.json`.
- First core run passed agent 76/76 and preview 2841 with one existing skip, then the isolated Homebrew Redis 8.10.2 process crashed with SIGSEGV in `dictSdsKeyCompare` at 15:35 UTC. Interrupted the waiting server suite; no core pass claimed. Preserved `data/reports/office-menu-integration-core-redis-crash.json` and local Redis crash log. Started fresh no-persistence Redis and reran core verification.

- Fresh core retry passed: `REDIS_URL=redis://127.0.0.1:16391 pnpm run verify`, **3747 passed, one existing geometry skip, zero failures** (agent 76, preview 2841, server 635, desktop 54, Python 141). All Redis server tests ran without skips; build, lint, format, synthetic pipeline and secret scan passed. Receipt `data/reports/office-menu-integration-core.json`; log `/tmp/river-oaks-office-menu-integration-core-retry.log`.
