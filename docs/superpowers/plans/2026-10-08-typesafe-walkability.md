# TypeSafe Place walkability

Objective: verify browser walking, indoor entry/exit, input recovery and shared
movement for typesafe.place; fix only reproduced defects.

Baseline: `2020849`, `main`, canonical River Oaks worktree. Existing untracked
desktop-refresh ledger and Unreal DefaultInput.ini belong to other work.
Owned files: this ledger and task-specific verification reports. No runtime edits
yet. Hosted publication is outside this verification task.

Controller: `preview/src/walking.js`, east/up/south meters, 0.35 m horizontal
collision radius, 1.68 m eye height, 1.65 m/s walking and 3.2 m/s fast walking.
Movement uses axis-separated collision queries with 120 Hz substeps, maximum
0.08 s frame duration, and a strict 0.4 m per-query height-change limit. Explicit
slope-angle limits and native CharacterMovement behavior are unsupported here.

Checks:

- `npm run agent:doctor`: passed all core prerequisites.
- Hosted `/play`: HTTP 200; `/auth/session`: unauthenticated response. POST
  `/api/multiplayer/ticket?world=river-oaks` with canonical Origin returns HTTP 401,
  `Sign in to join the town.` No authenticated hosted traversal was possible.
- `RIVER_OAKS_E2E_REPORT=walkability-experience-20261008.json npm run test:experience -- connection-required contextual-first-visit`
- `RIVER_OAKS_SHARED_REPORT=walkability-shared-20261008.json RIVER_OAKS_SHARED_JOURNEY=multiplayer npm run test:shared -- required`
- `npm run verify`: PASS, exit 0, all 11 tasks passed. Agent tests 17,
  preview 656, server 267 passed / 101 skipped, desktop 9, Python 141 passed
  with two warnings. Build, Python lint/format and secret scan passed. Offline
  demo verification returns its expected blocked exit 2; this is not real-world
  acceptance. Receipt `.runtime/agent/core.json`; console log
  `/tmp/river-oaks-walkability-core-20261008.log`.
- `git diff --check`: passed. No tracked source changes.

| Route/check | Result | Evidence and limits |
| --- | --- | --- |
| Connection loss then recovery | PASS | Eight browser assertions; offline input is blocked and walking resumes after authenticated reconnect. |
| First visit, shop entry, conversation, exit, photo dismissal | PASS | Desktop and touch journeys; 14 and 16 assertions respectively, no page errors. Destination `osm-node-8172494969`. Entry/exit uses the existing doorway action rather than physical threshold traversal. |
| Keyboard/touch input recovery | PASS | Canvas focus restored after dialogs; position changes after W; touch release clears held input and pad turns the player. |
| Shared arrival walking and reconnect | PASS | Two fixture accounts, real local server, 23 assertions, no browser errors. Peer observes server snapshot displacement exceeding 0.25 m under held walking input. |
| Physical boutique exit routes | PASS | Existing `auto-navigation.test.js` walks every published boutique exit with the actual movement solver and checks clearance at every frame. |
| Hosted signed-in walking | NOT TESTED | Public endpoint checks only; no connected browser/session. |
| Native traversal | NOT TESTED | Separate runtime, outside this web task. |

Reports: `data/reports/walkability-experience-20261008.json` and
`data/reports/walkability-shared-20261008.json`. No reproduced runtime defect and
no gameplay code changed.

Evidence limits: browser journeys use local fixture identities, the real local
server and WebGL on Apple M3 Max. No connected computer-use browser is available
for authenticated production traversal. Native, production authentication,
target GPU performance and human accessibility acceptance remain unverified.

Local verification is complete. Production walkability remains unverified until
an approved signed-in account traverses the hosted town. Full/Redis, hosted CI
and native gates were not run. No commit, push or deployment was performed.
Keep these untracked evidence files until delivered; do not remove this worktree.
Next step: authenticated hosted walking acceptance, including peer observation.
