# IPIC: the lounge passage, recliner colliders, a closed atrium, and the photo review

- **Task:** `ipic-passage-recliner-colliders` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `fix/ipic-passage-recliner-colliders-20261015` in `../river-oaks-ipic-colliders`, from
  main `83025a0b`.
- **Scope:** #364 items moved to #359 when #364 closed.

## Decisions (Val, 2026-10-15, asked in session river-oaks-39)

1. **Lounge passage:** "Nudge planter 5 cm". The passage between the upper-lounge planter and the sofa's west
   arm was 1.005 m, against the 1.01 m widest accepted body.
2. **Recliner footrests and bases:** "Add colliders".
3. **Front-row aisle:** "Match the art". With the footrests solid and the back row seated, the aisle in front of
   the first row is 0.891 m. That is below the 1.01 m bind-pose bound and above the 0.80 m widest posed body.
   The widest accepted body sits the front row from the side aisles, within the server's 3.6 m sit reach.

## Change

- **`preview/src/ipic-plan.js`:**
  - The planter moves from a = −5.6 to −5.65; the passage is now 1.055 m.
  - Recliners get `ipic-recliner-base` colliders at both base ends and an `ipic-recliner-footrest` collider, sized
    from `recliner()` in `ipic-interior.js`: base ends ±0.575 × 0.175 m at d ± 0.6125, and a footrest of
    0.82 × 0.468 m centred at d + 0.72. Cushion centres stay more than 0.35 m from every box.
  - Each recliner names `stand` and `approach` at d + 1.4, in the aisle in front of the footrest. That is 0.45 m
    from the footrest and from the back row's seated bodies. `ipicSeatSites` publishes that approach, so
    townspeople can still use recliners.
- **`preview/src/ipic-circulation.js`:** `seatApproach` uses a seat's named approach.
- **`preview/src/ipic-interior.js`:** ceilings over both escalator runs, at the landing's 6.7 m and the lounge's
  10.3 m. Photo review P1 had found open sky above the runs.
- **`scripts/ipic-review-data.mjs`:**
  - adds `reclinerSitSpots`: per recliner, the nearest spot the widest accepted body walks to from the doorway,
    with the other nine seats held, that is within the sit reach and sees the cushion as the server's sit check
    does;
  - adds `frontRowAisle`;
  - labels the pinch from the plan.
- **Exports, regenerated through the JS master:**
  - `preview/public/assets/ipic/ipic-interior.glb` (`node scripts/export-ipic.mjs`);
  - `assets/ipic/ipic-interior.blend` (Blender 5.2.2: 60 meshes, 131,552 triangles, 13 packed images);
  - the five review views and receipts in `docs/ipic-review/`.
- **Docs:**
  - `docs/ipic-interior.md`: the circulation table and the defect list (passage, footrests and atrium fixed);
  - `docs/ipic-review/photo-review.md`: new, 18 differences between the runtime and the photos, by photo ID.

## Checks

| Check | Result |
| --- | --- |
| New tests, written first | All four failed: the passage (1.005 m), the sit spots (no data), the front-row aisle record (none), and a walker passing a footrest (`walkable just past recliner-0-0's footrest`). The ceiling test failed with 368 walkable points seeing the sky. |
| `node --test preview/tests/ipic-*.test.js server/tests/ipic*.test.js` | 49 pass, 1 Redis skip, 0 todo. The passage `todo` is now a passing test. |
| `server/tests/ipic-routes.test.js` | Every recliner is reached, held, stood from and left with every other seat occupied. A pose onto a footrest is refused. |
| `node scripts/export-ipic.mjs` and the Blender export | Passed. Draw calls rose by one in four views (the ceiling); the auditorium is unchanged at 12. |
| `node preview/e2e/ipic-runner.mjs` (IPIC visit journey) | Passed 8 checks. It sits from the seat menu, taps Stand up at 390 px onto the new stand spot, and walks out. |
| Visual | The export's mural view shows the ceiling closing the run where the void was. In-world on Metal
(`ipic-photo-views.mjs`), the T2a sky is gone, but the street shows past the mural panel; that is now P18 in the
photo review. The first capture run saved its frames, then failed writing its receipt (`spawnSync git ENOBUFS`:
the dirty-diff hash included its own new PNGs). The runner is fixed in `9b22f088`.
The rerun at `9b22f088` passed and replaced T1–T3 and the receipt, with no errors. Its dirty-patch hash covers
only the docs edits committed alongside it. |
| `pnpm run verify` | Passed: agent 112, preview 3325, server 753 with Redis skips, 69/69. Load spiked to about 600 from another session's iOS Simulator. |

## Not done here

The other 17 photo differences are art direction or layout work. They include P18 (the street past the mural
panel), stadium risers, the screen size, the reception desk form and the lounge orientation.
