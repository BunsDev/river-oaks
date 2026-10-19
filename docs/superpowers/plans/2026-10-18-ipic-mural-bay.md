# IPIC: the walled-in mural landing (photo review P18, P2)

- **Task:** `ipic-mural-bay` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/ipic-mural-bay-20261018` in `../river-oaks-mural-bay`, from main `a00a4d19`.
- **Decisions (Val, 2026-10-18):**
  - "Wall in the landing".
  - On the mural placement: "Keep it large, in the bay". It is not head-on, because the in-line runs leave no wall
    facing arriving riders.

## Before

An in-world probe (scratch `probe.mjs`: Metal; 7 landing views; 144 `pickAt` samples each) found outside surfaces
in every view: facades, roofs, the street and the sky in both side bays, and the district's grass under both runs.
- **The bays:** the landing (d 12–14) spans the full room width, but only the thin stone walls beside the runs were
  drawn. The bays had no front, back or outer faces.
- **The runs:** nothing was drawn between or beside the lanes.

## Change

- **`preview/src/ipic-interior.js`:**
  - stone walls on each bay's front (d 11.91), back (d 14.09) and outer end (at the room edge), from the landing
    to its 6.7 m ceiling, each outside the walkable floor;
  - sloped steel decks on both runs, between the lanes (±0.65) and beside them (2.15–2.63).
- **`preview/src/ipic-plan.js`:** the `mural` review camera stands at the top of the first run's east lane and looks
  into the bay. The design packet's T2a follows.
- **Exports**, regenerated through the JS master: the GLB, and the Blender file (64 meshes, 131,708 triangles).
- **Captures:** the review views, and T1–T3 recaptured on Metal at `d6f3471f`.

## Checks

| Check | Result |
| --- | --- |
| New agreement test: every sight line from the runs and the landing (16 level and 8 downward per walkable point) meets an opaque part of the interior, unless it leaves through the glass frontage | Failed first with 2,027 (by the bays' sides and under the runs); passes now |
| `node --test preview/tests/ipic-*.test.js server/tests/ipic*.test.js scripts/tests/office-ipic-contract.test.js` | 64 pass, 1 Redis skip |
| In-world probe after | The bay, mural and second-run views have 0 outside samples (15–26 before). The views back down the first run see the reception and its glass frontage, as intended. |
| `node preview/e2e/ipic-exterior-culling.mjs` | Passed; seated frame 5.3 ms with culling against 8.6 ms without |
| `node preview/e2e/ipic-runner.mjs` | Passed 8 checks |
| `pnpm run verify` | Passed: agent 112, preview 3369, server 753 with Redis skips, 76/76 |
