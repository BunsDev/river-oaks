# Office + IPIC #360, engineering half: baseline and executable layout contract

Task `office-ipic-engineering-baseline` · branch `docs/office-ipic-engineering-baseline-20261014` · worktree `../river-oaks-office-ipic-engineering-20261014` · owner claude-code river-oaks-dc (session 8fa1c14c) · parent #359, package #360.

The design half of #360 (brief, reference-index, asset-manifest, review-matrix, the kit inventory) is owned by session river-oaks-5d on `docs/office-ipic-baseline-20261014`, register task `office-ipic-baseline-360`, ledger `2026-10-14-office-ipic-baseline.md`. The split follows #359's "engineering captures current behavior/ownership; design audits references and numeric layout". Packet files are cross-linked by name only; neither session edits the other's files.

## Objective

Deliver G0/G1's engineering artefacts for #360: the current baseline with real check counts, the keep/reuse decisions against the open interiors stack, the physical-fit analysis of the supplied penthouse kit, and one versioned, machine-checked layout and camera contract that later packages (#361, #363, #364, #366, #367) implement from without guessing levels, openings, anchor ids or ownership. No runtime geometry, authority or activation changes.

## Pickup facts

- `origin/main` at pickup: `489a60e41bfe1a6499dfb0905ada55856be99825` (#374 dominoes merge on top of the tracker's `7cff31f4` snapshot; only `server/world.js` changed in that range, no office/IPIC source). The primary checkout still sat at `7cff31f4` and holds other sessions' uncommitted prune-tooling edits; nothing there was touched except the live register claim.
- Worktrees at pickup: 26, including the whole #349–#358 procedural-interiors stack. Register at pickup: 171 tasks, none for #359/#360.
- Load average during this round: 68 to 190 (16 Claude sessions on the machine). Timing-sensitive results below carry that caveat.

## Files owned

- `docs/design/office-ipic/layout-contract.json`: one contract, `layoutVersion office-ipic-baseline-1`, `sourceRevision 489a60e4…`, axes, geometry sources, avatar envelope, three places (`office-current` observed, `ipic` inferred, `office-penthouse-proposed` proposed), routes, transitions policy, budgets, decisions, gates.
- `docs/design/office-ipic/camera-manifest.json`: O1–O4 and T1–T3 (T2 split into mural/lounge/bar), reusing the five `IPIC_CAMERAS` photo views; eye/target/FOV/runner/receipt per camera; viewport gaps stated.
- `scripts/office-ipic-contract.mjs`: the validator. Rejects unknown schema or stale layout versions, short revisions, wrong axes, duplicate place/level/anchor/camera ids, routes to unknown anchors, anchors unreachable from the spawn, required routes that do not join the spawn through required routes, cameras on the wrong place, unresolved photos/runners/receipts, and, when the live modules are passed, any observed number that drifts from `OFFICE_ROOM`, `ARRIVAL`, `AVATAR_ENVELOPE`, `IPIC_FLIGHTS`, `IPIC_CAMERAS`, the live IPIC room or its seat ids.
- `scripts/tests/office-ipic-contract.test.js`: validates the committed packet against the live plans, walks every required office route with `findRoute` under each seated-occupancy case, and proves each rejection above with a mutated copy. Runs in the `agent-tests` task (`pnpm run verify tooling`).
- This ledger.

## Baseline evidence (G0)

Focused checks from the primary checkout at `7cff31f4`, `node --test preview/tests/office-*.test.js preview/tests/ipic-*.test.js preview/tests/workplace-room.test.js preview/tests/workplace-office.test.js server/tests/offices.test.js server/tests/offices-transport.test.js server/tests/office-desk.test.js server/tests/office-desk-transport.test.js server/tests/ipic-interior.test.js`:

| Result | Count | Note |
| --- | --- | --- |
| tests | 75 | |
| pass | 71 | |
| fail | 1 | `server/tests/office-desk-transport.test.js` memory variant, "Office command timed out" (fixed 5 s per-command timeout) at load 117–190; failed again alone at load 190. Preserved as baseline evidence, not relabelled a pass. #345's hosted evidence had desk 16/16 passing. Re-run on a quiet machine before anyone treats it as a regression. |
| skipped | 3 | the Redis variants, no `REDIS_URL` |

`pnpm run --silent agent:doctor`: exit 0 (gitleaks, node_modules, python environment present). `pnpm run --silent agent:list`: profiles tooling, web, python, security, core, browser, full, preview, server, desktop, build.

Captures: no new captures were taken this round. The reproducible views are frozen in `camera-manifest.json` with their existing runners and receipts (`data/reports/office-arrival-acceptance.json`, `office-shared-experience.json`, `office-desk-final-experience.json`, `docs/ipic-review/review.json`). Before-captures with avatars for O1–O3/T1–T3 are the first #363/#364 action, not a G0 deliverable rebuilt here under load.

### Observed geometry

- Office: `planWorkplaceRoom()` 9 × 7 m, `ROOM_HEIGHT` 3.9, door half-width 0.85 and height 2.6, spawn `[0, 1.25]`, speed 2.6 m/s, stations `station-1`/`station-2` (seats `[-3.15, 2.2]`/`[-3.15, 4.6]`, approaches at x −2.05), review socket `[1.65, 3.4]`, obstacles desk-station-1/2, review-table, storage-wall, planter-east, chairs r 0.4. Arrival: lift car stop d −1.45, lobby width 5.2, facade offset 9.5, office elevation 24.3 m, cinematic 10.6 s. Server authority: `server/offices.js` imports `officeFree`/`officeSegmentFree` from the same module the client renders from; grants/requests/visits are in checkpoint version 6.
- IPIC: mapped bay on `osm-way-625330798` gives width 13.03 m (aMin −6.30, aMax 6.73), depth 34, height 10.4, floor 18.49 m; `floorAt` 0 / 3 / 6 m across flights d 6–12 and 14–20; 57 fixtures and obstacles, 10 seats (`bench:ipic-lounge-sofa:0/1`, `bench:ipic-recliner-r-c:0`), auditorium doorway at a −4.7, d 26. GLB 12.39 MB. Lift doors decorative.
- Avatar envelope: `AVATAR_ENVELOPE` 0.505 / 0.888 / 2.45 / 1.27 measured 2026-10-11 at `eb628626` over 22 looks. `SHARED_APPEARANCES` at `489a60e4` lists the same 22 ids, and `git log eb628626..origin/main` touches none of `preview/public/assets/characters`, `avatars.js`, `shared-appearances.js`, `angel-wings.js` (only `player-avatar.js` pose code), so the measurement is current. A fresh fixture run is deferred until a rig changes (contract decision `envelope-remeasure`).

### Physical fit of the kit (G1 input, Val decision)

`osm-way-625330785` (the office building) is 80.41 × 40.69 m in plan with an estimated 28 m height (`district.json` height_source: street-level photographs). The kit's 30 × 20 m main floor plus 8 m terrace (38 × 20 m) fits the plan. Its 7.6 m clear volume on top of the authored 24.3 m lift rise tops out at 31.9 m, 3.9 m above the modelled roof. Options recorded in the contract: lower the office floor (at or below 20.4 m, changing the lift rise and arrival timing), keep level 6 and drop to about 3.7 m clear (no mezzanine as proposed), or raise the modelled building (a visible street change). This is not resolved here.

### Keep / reuse / avoid

- `#349` (procedural building levels, draft, base `main`): bumps the private checkpoint to version 7, adds `preview/src/building-interiors-plan.js` with levels `<building>/l<n>`, portals of kind `entrance`/`stairs` with `toLevelId`, `approvedLevelRoom` in `store-rooms.js`, and touches `docs/offices.md` and the office transport tests (protocol 3). **Reuse** that level/portal shape for #361's penthouse levels; **avoid** a second level schema and a second checkpoint bump; **do not assume** #349 is merged (it is queued behind #375 in the local lander, owned by a Codex session).
- `#357`/`#358` (creator-interior docs, gallery AO mask): touch `render-pipeline.js`, `main.js` and shared plans. **Avoid** editing scene roots or AO lifecycle in #363 until those land or are closed; coordinate with their owners when the office scene needs the shared pipeline.
- `#214`/`#221` workplace slice: **reuse** its authority and privacy rules (owner predicate, no owner field in commands, desk text never in snapshots); **keep** `RIVER_OAKS_WORKPLACE`/`VITE_WORKPLACE` default-off; five rendered computers do not authorise five agents.
- Prior kit review by Cody (`~/Downloads/jevica-office-scale-review`, 2026-10-13/14): **keep** the double-height identity and stair width; **adopt** the east passing bay as the only two-avatar passing point on the 2.4 m gallery; library/terrace density is a design decision.

## Acceptance checks

- [x] `node --test scripts/tests/office-ipic-contract.test.js`: 7/7 pass.
- [x] `pnpm run verify tooling`: agent-tests 83/83 (inside the core run).
- [x] `pnpm run verify` core: the aggregate run failed once on an unrelated voice flake, then every core task passed on a focused retry (see results). The failed aggregate is kept on record; the retry does not relabel it.
- [x] Draft PR #381 opened against `main` at `c1b7fabf` (created over REST while GraphQL was rate-limited); cross-linked from #360.

## Results

Worktree at `489a60e4` plus the files above, 2026-10-14 19:55–20:10Z, load average 68–150:

| Gate | Result |
| --- | --- |
| `pnpm run verify` (core aggregate) | **failed** at server-tests: `server/tests/voice-reconcile.test.js` "the standalone town stamps voice identities on its players and revokes a departed tab" asserted "the identity reaches the snapshot" false after 3.5 s; agent-tests 83/83 and preview-tests 3012/3013 (1 skip) had passed; desktop, build, python, secrets not run by the aggregate. Receipt `.runtime/agent/core.json` status failed. |
| `pnpm run verify server` (retry) | passed: 626 tests, 486 pass, 0 fail, 140 skipped (Redis variants, no `REDIS_URL`) |
| `pnpm run verify desktop` | passed: 54/54 |
| `pnpm run verify build` | passed |
| `pnpm run verify python` | passed: ruff clean, 141 pytest passed, 66 warnings |
| `pnpm run verify security` | passed (worktree secrets plus history scan) |
| `node --test scripts/tests/office-ipic-contract.test.js` | 7/7 |

No change in this branch touches `server/` runtime code or voice; the voice failure matches the load pattern of the desk transport baseline failure and is recorded, not explained.

## Gaps and unverified scope

- No new captures, no browser runs, no envelope re-measurement this round; the machine was at load 117–190.
- The desk transport memory test failure is unexplained beyond the load correlation.
- IPIC camera viewports are not recorded in `docs/ipic-review/review.json`; the manifest says so and freezes them at the next capture.
- `office-penthouse-proposed` geometry is the kit's `layout.json` by hash; it governs nothing until #361 imports a versioned copy. Its 46 colliders and 32 placements are not duplicated into the contract to avoid a second truth.

## Decisions for Val

1. **Penthouse volume fit** (contract decision `penthouse-volume-fit`): choose lower floor, lower clear height, or taller building before #361 fixes level elevations.
2. **IPIC step-free access**: this increment keeps the lift decorative; the escalator slope is the only upper-level route. Accept that for #364, or scope a fixed-endpoint server-validated lift route.

## Next action

Run the tooling and core gates, commit signed, push, open the draft PR, update the register, and hand #361/#366 the contract's `layoutVersion` and transition policy. Engineering can start #361 (reusing #349's level/portal shape) or #366 (authoritative screening timeline) in separate owned scopes once Val's volume-fit decision lands; #366 does not depend on it.
