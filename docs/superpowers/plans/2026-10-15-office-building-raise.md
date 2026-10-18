# Office: raise the penthouse tower to 33 m

- **Task:** `office-building-raise` (live register), owner `claude:river-oaks-penthouse (7a57e655)`.
- **Branch / worktree:** `feat/office-building-raise-20261015` in `../river-oaks-office-building-raise`, from `origin/main` `f72a173e`.
- **Decision:** Val, 2026-10-14 (`docs/design/office-ipic/brief.md`, "Physical fit"; contract `fit.decision`): raise the modelled building, keeping level 6, the 24.3 m lift ride and the arrival film.
- **Merge is held** for Val's authorization of the activation deploy, because deploying it migrates the production town checkpoint.
- **Update 2026-10-18:** the hold above is out of date. Val authorized the deploy on 2026-10-15; #432 merged as `7a3b8bcf` and its production deployment succeeded at 16:27Z. Production's `RIVER_OAKS_OFFICE_LAYOUT=office-penthouse-1` was set the same day, so the penthouse has been active in production since then.

## Objective

The penthouse's 31.9 m ceiling (24.3 m floor plus 7.6 m clear) stood above the mapped 28 m Equinox tower (`osm-way-625330785`). Raise the tower to 33 m, with its curtain wall to 32.85 m, so the penthouse fits inside it. Carry every existing town checkpoint across the new world fingerprint with an explicit, fail-closed, height-only migration.

## Decisions

1. **Provenance stays honest.**
   - `REFERENCE_HEIGHTS` keeps the photographed 28 m.
   - A new `AUTHORED_HEIGHTS` in `scripts/build_district.py` overrides it with 33 m and its own `height_source`: "authored 5 m above the photographed 28 m to fit the penthouse office (#363)".
   - This departs from the brief's wording ("change REFERENCE_HEIGHTS to 33"), which would have labelled an authored height as photographic.
2. **`district.json`** changes only that building's `size[2]` and `height_source`, edited in place without reserializing the file.
3. **Facade** (`reference-blocks.js`):
   - `TOWER_TOP` goes from 27.85 to 32.85 m, so the coping sits 0.15 m above the roof line, as before.
   - The floor lines stay at 16.6, 20.45 and 24.3 m: one double-height band above the office floor, with no line at the 28.1 m mezzanine.
   - The U.S. Capital Advisors crest and name are now placed relative to `TOWER_TOP`, so they stay "at the top of the curtain wall" as authored instead of being stranded mid-wall.
4. **Migration** (`server/district-tower-checkpoint-migration.js`, `recoverDistrictTowerCheckpoint`):
   - The target is pinned: the tower at exactly 33 m with the authored source. Any other height, or the unraised district, is rejected. The Redis two-level test caught an earlier draft that, with the unraised district as current, claimed the levels migration as its own.
   - It rebuilds the pre-raise district and checks the recorded digest `b1cf4b8c…` (the full `loadDistrictData()` at `f72a173e`).
   - It restores the checkpoint there, or chains through `recoverDistrictLevelsCheckpoint`, and through it the interior and height links.
   - It re-signs for the raised district and requires a successful restore there.
   - A flight that the taller roof now encloses fails closed rather than being moved, as the earlier height migration decided. Deploy precondition: land any flight over the tower.
   - `redis-room.js` tries the tower link first and logs `district_tower_checkpoint_migrated` (`to: penthouse_tower_33m`) once.
5. **Tests of older links** now use `server/tests/district-history.js` `beforeTowerRaise()` wherever they treat today's file as the district their link targets. The helper's values are independent of the migration code. Changed files: district-checkpoint-migration, district-gallery-levels, district-building-interiors, office-world-lifecycle (one line) and redis-room (two fixtures).
6. **No world-checkpoint version bump:** the payload shape is unchanged; only the fingerprint changes. Flight clearance follows `size[2] + 3.1` automatically (`walking.js`).

## Checks

| Check | Result |
| --- | --- |
| New facade test (`preview/tests/office-tower-raise.test.js`), real `blockFacades` geometry recorded through stubs | red first (tower 28 m), now 2/2. Asserts: wall above the penthouse ceiling; coping at the roof line; floor lines exactly 16.6, 20.45 and 24.3; crest just under the top. |
| New migration tests (`server/tests/district-tower-checkpoint-migration.test.js`) | red first (module missing), now 4/4. Covers: pre-raise town keeps players, chat and wishes with an unchanged payload; one-level gallery town chains (`from: gallery_plan_v1`); enclosed flight fails closed; other worlds, other geography, the unraised district, a 40 m tower, corruption and laundering all refused. |
| New Redis test (`redis-room.test.js`: raised tower commits once) | passed against an isolated `redis-server --save ''` on 127.0.0.1:16497 |
| `node --test preview/tests/*.test.js` | 3207/3209 (1 skipped, 1 todo) |
| `REDIS_URL=… pnpm run test:server` | 776/776 against the isolated Redis (none skipped), including the tower Redis test and the re-fixtured older migration tests |
| `pnpm run verify` | core passed (`.runtime/agent/core.json`): agent 111/111, preview 3207/3209 (1 skipped, 1 todo), server 584/734 (150 skipped: need Redis, covered by the run above), desktop 69/69, Python 141 passed, build, ruff lint and format |
| Street captures (`pnpm run test:experience office-arrival-visual`) | passed; stage `raised` (8 stations). The facade view matches the `O0-street-facade` baseline at street level and the podium. The curtain wall runs higher, with the U.S. Capital Advisors crest at its new top; the approach view is unchanged at street level. Local Metal ANGLE. Not committed: `output/playwright/office-arrival-raised-*.png`, archived with the task. |

## Gaps

- **The pre-raise digest is pinned to `f72a173e`.** Any other change to `district.json`, the vegetation or the gallery plan that lands on main first must update `PREVIOUS_DISTRICT_SHA256` and the fixture assertion.
- **No production checkpoint was read.** The chain is proven only from the recorded historical revisions in fixtures.
- **Deploy precondition:** land any flight over the tower before deploying.
- **Visuals:** street captures are local Metal ANGLE, not device proof.

## Next

Independent review. Keep the PR open but unmerged until Val authorizes the activation deploy. That deploy should also switch on `RIVER_OAKS_OFFICE_LAYOUT=office-penthouse-1`, and in production once Val approves.
