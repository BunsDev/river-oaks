# Depth stack (#695 → #707), coordinator idle tick, depth burn-down

- **Goal:** Val, 2026-10-30 (goal file refreshed ~06:35Z): land #695 and #707, settle the coordinator
  idle tick, continue the depth burn-down, retire scratch copies, hand off with Decisions for Val.
- **Owner:** `claude:river-oaks-bb (4a824f53)`; window until 2026-10-30T13:00Z.
- **Register tasks:** `depth-shader-audit-20261026` (#695, claimed from ended river-oaks-3e),
  `m695-merge-scratch-20261030`, `m707-merge-scratch-20261030`, `d707-parent-scratch-20261030`,
  `d707-fixed-scratch-20261030`, the two tick snapshots, `depth-clone-callbacks-20261030` (#794),
  `cap-main-snapshot-20261030`, `cap-fix-snapshot-20261030`,
  `depth-burndown-venues-20261030` (#790), `depth-review-hardening-20261027` (#707), `depth-tick-ledger-20261030`
  (this ledger). The two tick snapshot tasks were registered with shell-split ids
  (`tick-ab-a 4557e70d before #655-20261030`, `tick-ab-b 986977ef current main-20261030`); `register patch`
  cannot rename, so their titles name the intended ids and their worktree paths are corrected.
- **Baseline:** `origin/main` `986977ef` (06:42Z).

## Status

| Item | State |
| --- | --- |
| 0. #695 | **Landed** 2026-10-30T09:40:12Z as `0d54a18d` (`pnpm run land 695`) |
| 1. #707 | Merged with main after #695 and pushed (`4e6f35ca`), core passed; baseline burn-down **blocked**, see Decision 2 |
| 2. Coordinator tick A/B | Snapshots and Redis ready; waiting for 1-min load ≤ 8 (host 17–44 all morning) |
| 3. Depth burn-down | #790 draft: Axe & Darts, 164 → 159; #794 draft: fix-forward for #695's shader-callback regression |
| 4. Retirement | pr716-merge and tick-main cancelled 10:22Z; the rest wait on 12 h windows (see Retirement) |

## Results

### 0. #695 (depth audit)

- Redid the merge of `f790ef8b` and `origin/main` `986977ef` in a detached copy. The previous session's
  semantic resolution matched the fresh conflicts and was adopted after review: #695's party walls, coping
  joints and raised membrane now sit on main's `bodyTop`, a garden roof keeps its lawn membrane, `forms` stays,
  and the owned grate texture keeps #695's −8 offset units. Both test sets in `city-kit.test.js` stay.
- Pink Jet-Age owner liveness: `pink-jet-age-r3-architecture` is delivered with no owner and no process in its
  worktree, and no matching session appears in ListAgents. The owner had ended, so the geometry fix went ahead
  under the goal's "or have ended" clause.
- **Zero depth-fight audit: 61 → 0** (all 21 city-kit neighbourhoods); the audit itself is unchanged.
  - Main's TypeSafe curtain wall caused most of them. Its dark glass stood 5 cm proud of the core wall and the
    lit panes 2 cm proud of the dark glass; a 3 m patch needs 5.7 cm to hold its order to 120 m. Each layer now
    stands 8 cm proud of the one behind, with the same boxes.
  - The crown's terrace slab lay 4 cm over #695's raised membrane; the membrane is no longer drawn under a crown.
  - A first attempt (lit/dark panes split into runs) also cleared the audit but pushed four TypeSafe Pink
    Jet-Age chunks over their estimates (+70–100 KB). It was rejected.
- **kit-finish-live:** Yale Icehouse under Pink Jet-Age measures 3,493,632 B (3.33 MiB) with #695's party walls;
  main alone measures 3,310,464 B. It gets a measured 3.35 MiB override in `HEIGHTS_FINISH_CHUNK_BYTES` (the
  existing per-finish mechanism, rounded like TypeSafe north and uptown). Classic estimates and every ceiling are
  unchanged. Re-measured table for all 36 chunk × finish pairs: scratchpad `measure-*.txt` / this session.
- Commits (all SSH-signed, `%G?` = G): `5671658e` merge, `0bbcd2e3` curtain wall + estimate, `f6a17199` IPIC.
- Local core `pnpm run verify` on `0bbcd2e3`: **passed**. Tooling 289/0/0, preview 4,685 pass / 0 fail /
  1 skip, server 1,082 / 0 / 285 optional skips, desktop 127 / 0 / 5, Python 214, secrets clean.
- Hosted depth job on `0bbcd2e3` (`123935773741`) **failed first**: "4 new pairs of surfaces fight for depth".
  The pairs were IPIC escalator-well stone/plaster joints and the lobby sign, from main's well rework `85913401`,
  which #695's list predates. This was predicted locally before the job ran. Fix `f6a17199`: stone stops at the
  well slab's underside, bay ceilings fit between their walls, and the sign hangs 8 cm off the timber. The list is
  unchanged. New regression in `ipic-model.test.js` fails before and passes after; IPIC suites 132/132. Local
  depth journey in check mode passes. Core on `f6a17199`: passed (preview 4,686 / 0 / 1; rest unchanged).
- PR comments 6516909200, 6517427151 and 6519688507. `pnpm run land 695` queued 06:57Z, took its turn about
  09:20Z, update-branch to `8e7d87c`, Verify passed and the guard merged it as `0d54a18d` at 09:40:12Z. Every
  hosted check was green on `f6a17199` beforehand. The remote branch was auto-deleted on merge; #707 and #790
  now target `main`. Register `depth-shader-audit-20261026` is delivered with that evidence.

### 1. #707 (depth review hardening)

- Detached copy of `44660d85` merged with #695 `0bbcd2e3` as signed `e544126f` (not pushed: #695 has not merged).
  - `ipic-interior.js`: `IPIC_CEILINGS.reception` together with #707's 7.5 cm wall-fit inset.
  - `reference-facades.js`: #695's one-unit offset, keeping #707's `onBeforeCompile`/`customProgramCacheKey` copy.
  - `district-depth.test.js`: both assertion sets.
  - `depth-layers-known.json`: #707's version-2 file (9,255 occurrences); #695's legacy list had gone 204 → 164.
- Focused tests 55/55 (audit, baseline, interior joins, city-kit, district depth, room clip, material finish,
  kit-finish-live); IPIC/facade/manifest/store-interior suites 233/233.
- **Burn-down record run refused** (`RIVER_OAKS_DEPTH_LAYERS_RECORD=1`): 1,086 new or enlarged occurrences
  against the 9,255 baseline. The file was not rewritten.
- Attribution, measured under one browser lock with the same #707 detector:
  - Parent geometry (`store-interiors.js`/`ipic-interior.js` from `0bbcd2e3`): 7,912 occurrences, of which
    1,104 are fresh against the baseline; 1,492 baseline entries are gone.
  - #707 geometry: 7,894 occurrences, 1,086 fresh. Against the parent it adds **0 new or enlarged** and resolves
    **18** (16 brass/leather, 1 brass/mirror, 1 IPIC plaster/timber). The count reproduced exactly.
  - The 1,086 break down as 955 enlarged within their cell (878 bounds-only, median 4.0 cm shift, from #695's
    increments 3–4 and main), 99 known pairs in new cells, and 32 new pairs (26 retail-artwork, 6 IPIC well).
  - Receipts with SHA256SUMS: scratchpad `receipts-707/`.
- After #695 landed: signed merges `f3937fa7` (#695's IPIC fix) and `4e6f35ca` (main) pushed fast-forward to
  `fix/depth-review-hardening-20261027`. Focused 57/57; local core on the merged state passed (tooling 294/0,
  preview 4,710 / 0 / 1, server 1,083 / 0 / 285 skipped, desktop 127 / 0 / 5). PR comment 6519904976. Register
  task `depth-review-hardening-20261027` (blocked).
- Hosted run on `4e6f35ca` (merge ref `d642426f`): 27 pass, 2 fail. `preview experience (depth)` (job
  123998317806) refuses "1080 new or enlarged depth occurrences" (6 fewer than locally against newer main);
  the aggregate `preview` fails with it. This is expected until Decision 2. The log is kept in the scratchpad.
- Premium-frontage visual parity: #707 carries #794's shader lines, so see #794's captures below
  (PR comment 6520363237). #707's own head was not captured separately.

### 2. Coordinator idle tick

- Snapshots `tick-a` = `4557e70d` (before #655) and `tick-b` = `986977ef` (main), installed. The Codex
  `crime-redis-audit.js` (cc29) is copied read-only and untracked. Private Redis runs on 127.0.0.1:6481.
- The wrapper takes one browser lock for A1 B1 B2 A2 and starts each arm only at 1-min load ≤ 8, under
  `caffeinate -s`. Started 06:51Z; the host has held 17–44 since then.

### 3. Depth burn-down

- #790 (draft, stacked on #695): Axe & Darts, 5 pairs, 164 → 159. The list edit only deletes lines.
  - The wall-side cage panel was buried in the plaster; it is no longer drawn, and collision is unchanged.
  - The axe rack's board now stands 8 cm proud of the wall; it had been 5.5 cm.
  - The target backboards now stand 8 cm behind the targets; they had been 2 cm.
  - Regression: 4 pass / 1 fail before, 5/5 after. Core passed on `7f0ac26a`.
- Assessed, not shipped:
  - Campus floor stack (ceiling/slab 2 cm and floor/slab 6 mm, both 15 m wide). Fixing it means recessing the
    slab core under the finishes, which would open a visible pit where a setback slab top is uncovered; it
    needs matched captures first.
  - District street markings (~33 pairs). They already carry polygon offset −2/−2; settling them means changing
    the road/decal offset policy, which is close to the shader-policy line.

### Regression from #695 on main, and fix-forward #794

- #707 had found that #695's depth-biased mass clones drop `onBeforeCompile`/`customProgramCacheKey`. With #695
  on main that is now live. A Node probe compiling each mass's patch: on `main` all 9 opaque mass materials
  (`facade-roof`, `facade-stone`, 7 `reference-*` claddings) lose their metric-UV and cladding shader; with the
  fix all 9 keep it.
- Draft #794 (`fix/depth-clone-shader-callbacks-20261030`, signed `b976c357`) carries #707's two-line fix ahead
  of its baseline work, plus a self-contained regression in `district-depth.test.js` that fails on main and passes
  with the fix. Core passed (tooling 294/0, preview 4,696 / 0 / 1, server 1,083 / 0 / 285 skipped, desktop
  127 / 0 / 5). Hosted checks: 25 pass, 3 in progress at 10:25Z.
- Matched captures of `facades.html` (1280×800, 5 views) at pre-#695 `986977ef`, main `0d54a18d` and the fix
  `b976c357`, under the browser lock. The fix sits within 0.7–1.9% changed pixels of pre-#695 on every view;
  main is up to 18.9% off (IPIC: raw rubble texture at mesh UVs in place of jointed tan panels; Cartier
  13.8%). Table in PR comment 6520361484; 15 PNGs with SHA256SUMS in scratchpad `receipts-794/`.

### 4. Retirement

- 10:22Z `project:prune --cancel-stale --apply`, after a dry run and a liveness check (no processes, clean
  apart from the untracked audit copy):
  - `river-oaks-pr716-merge` (`a0cd049f`) → `~/worktree-backups/river-oaks/cancel-detached-DXRHia`
    (tar sha256 `9996b1bd…`, 19,363 entries).
  - wave-3 `tick-main` (`39a5f302`) → `cancel-detached-rUJx3w` (tar sha256 `049776b5…`, 15,203 entries).
- `feat/support-contact-gate-292-20261027`: already retired by river-oaks-de about 02:25Z (bundle
  `retirement-TVkCoz`). Verified; skipped.
- `fix/player-blocking-ui-292-20261027` (`32f88f6e`, task `player-blocking-ui-292-711` delivered, worktree
  clean and idle): touched 00:37Z, so cancel-stale is eligible after 12:38Z.
- snap-722 and snap-695: eligible after about 12:35Z.
- `river-oaks-depth-audit` (#695's original): blocked by `dirty`, see Decision 6.
- My own snapshots (`m695`, `m707`, `d707-parent`, `d707-fixed`, `tick-a`, `tick-b`, `cap-pre`, `cap-main`,
  `cap-fix`) were made today. `project:cancel` refuses anything touched within 12 h, so they cannot be retired
  in this session. Each is registered with its path and a next action, which is to retire it with cancel-stale
  after 12 h. `m707` holds nothing that is not pushed.

## Decisions for Val

0. **Land #794 (urgent).** It fixes the live shader regression above. Landing it is outside this goal's
   authority.

1. **Yale Icehouse Pink Jet-Age estimate.** Recorded at 3.35 MiB from measurement (3,493,632 B) as a per-finish
   override. Classic is unchanged. Confirm this is the reading you want of "re-measure, never hand-edit".
2. **#707 baseline.** The 9,255-entry version-2 baseline cannot be burned down against current main + #695
   without accepting 1,104 relocated or new occurrences, mostly faces #695 moved by 4 cm. #707's own geometry
   adds none and resolves 18. Options:
   - (a) Authorize re-establishing the version-2 baseline on the parent geometry (7,912), with #707's fixes then
     burning it to 7,894. This is the same migration protocol #707 used on `3d666a29`.
   - (b) Keep #707 draft until a narrower baseline policy exists.
3. **Coordinator tick A/B.** The load ≤ 8 gate has not opened. If it stays shut through 13:00Z, choose between
   an overnight quiet window and accepting a higher gate. The 10-29 receipts (load 13–27) were inconclusive.
4. **#790.** Landing is outside this session's authority; it is ready for review after #695.
5. **Street markings and campus floors.** Choose whether the next burn-down may touch District road/decal
   polygon offsets, and whether a campus slab recess may proceed with captures.
6. **river-oaks-3e's undelivered street-markings work.** #695's original worktree `river-oaks-depth-audit`
   (`f790ef8b`) holds uncommitted edits from 2026-10-27: zebra bars follow the asphalt cells rather than the
   terrain (`sidewalks.js` +33/−4, `district-depth.test.js` +11). That is the start of the street-markings
   burn-down. It is preserved; project:prune is blocked (`dirty`). Choose between delivering it as an increment
   and archiving it with `project:cancel`.
