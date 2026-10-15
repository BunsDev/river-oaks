# Penthouse graybox: glazed curtain wall

- **Task:** `office-penthouse-glazing` (live register), owner `claude:river-oaks-penthouse (7a57e655)`.
- **Branch / worktree:** `feat/office-penthouse-glazing-20261015` in `../river-oaks-office-glazing`,
  from `origin/main` `9d83cd31`.
- **Issues:** #363 (graybox fallback until #362's modules), #362 (window-module A19 and the kit
  blockout shell are the reference). No kit file is imported; R19 is still Val's.

## Objective

Replace the penthouse graybox's opaque plaster walls with the kit blockout's glazed curtain wall, so
the room reads as an enclosed glass penthouse rather than a plaster box, without changing what the
server lets a body walk through.

## Files owned

- `preview/src/office-penthouse-graybox.js`: shell section, the terrace-wall line of the obstacle
  loop, and the new `glazeCurtainWall` helper. The chair section belongs to the #363 seat stack.
- `preview/tests/office-penthouse-graybox.test.js`: per-instance part bounds and the glazing cases.
- `docs/offices.md`: one sentence in the graybox bullet.
- This ledger; own register entry.

## Decisions

1. **Where the glass goes.** This follows the kit blockout (`buildArchitecture`, read only). The street
   front (d 0) has a mullion every 3 m. The east side (x 15) has one every 2 m. The terrace side (x −15)
   glazes the plan's three wall obstacles in their own footprints and keeps their collision, with
   transoms over the two portals. The back wall (d 20) stays solid.
2. **A solid arrival core, x ±3 m, full height, around the doorway.** The cabin (±1.73 m) and the lobby
   (±2.78 m) rise with the office stage and stay outside the entrance wall during the visit. A glass
   header over the door would show them, so the core stays solid and its edges sit on the 3 m mullion
   rhythm. This departs from the kit, which glazes over its 3.6 m arrival opening. The doorway itself
   (x ±0.85, 2.6 m) is unchanged.
3. **Transom underside 3.0 m** (the kit's value). It is 0.55 m above the measured 2.45 m body, and the
   portals stay walkable at full height.
4. **Two draws.** Panes and frames (mullions, sills, head bands, transom bars) are one `InstancedMesh`
   each over a shared unit box. Each instance carries its own zone in `userData.zones`, so the tests
   hold every pane and mullion to its plan zone instead of to the batch's overall bounds.
5. **Glass handled like the district's.** It reuses `thinStorefrontGlass()`, the material the storefronts
   use. That is Schlick alpha with no depth write. The batch sets `aoExclude` (#351/#358's rule:
   thin glazing is hidden from the AO geometry pass) and casts no shadow. The guard and terrace rails
   keep their existing glass finish.

## Checks

| Check | Result |
| --- | --- |
| New tests written first (`office-penthouse-graybox.test.js`) | red: curtain wall and two-draw cases failed (6/8), then green 8/8 |
| `node --test preview/tests/office-*.test.js` | 74/74 |
| Graybox draw calls / triangles (counting script, one draw per mesh) | before 53 / 976 (4 transparent); after 51 / 1,564 (5 transparent) |
| `pnpm run verify` (worktree, dirty tree at `9d83cd31`) | core passed (`.runtime/agent/core.json`): preview 3,095/3,096 (1 skipped), server 534/681 (147 skipped: Redis and live services), agent 109/109, desktop 69/69, Python 141 passed, build, ruff, secrets |
| `node preview/e2e/office-penthouse-runner.mjs` (browser lock) | not run. Queued 7th on the shared browser lock at 08:22Z. When it reached the front (about 08:37Z), the fixture exited with `Cannot find package 'vite'`: the primary checkout's `node_modules`, which this worktree symlinks, had been deleted after core verify passed (08:21Z), apparently by an external disk cleanup. No browser or visual evidence. |

## Gaps

- **Expected merge conflict.** The edits touch the import line and the terrace-wall line of the obstacle
  loop, and the #363 seat stack (#400) edits lines next to both. Resolve by keeping both changes.
- **Outside the glass.** The street is hidden upstairs, so the glass shows the sky backdrop (or the
  standalone office scene's flat backdrop). The skyline prototype (`office-skyline-prototype`) is
  supposed to fill it.
- **The lobby is still outside the front.** Past the core's edges, at oblique angles, the lobby's
  stone side returns stay visible through the front glass. Hiding the arrival lobby after arrival
  belongs to the scene lifecycle (`office-world-scene.js`), not the shell.
- **Not final art.** No kit modules, PBR maps or LODs; #362 still delivers those.

## Next

Once the primary's dependencies are restored, run the penthouse browser smoke and look at the arrival
and mezzanine captures. Rebase onto the #363 seat stack, or onto main once #400 lands, keeping both sides of the
two neighbouring lines. Design review of the glazing against #362's window module.
