# Main Ribbon spine: the extension boundary

Data: [`config/ribbon/district-spine-boundary.json`](../../../config/ribbon/district-spine-boundary.json)
(`district-spine-boundary-v1`). `preview/tests/ribbon-spine-boundary.test.js` fails if it stops
matching the contract, so the next map increment can build against it.

## What is finished

The spine is 87.9 m long, 2.4 m wide, with 3.6 m clear and a canopy top at 4.0 m. Its route has not
changed since #865. It is `clear` in the contract because the validator confirms it against the
live site, and it has a whole-body corridor regression.

## What #740 changed

The corrections are small and nothing was removed. Tree and pit indexes still mean the same trees.

| Item | Move | Crown over the walk |
|---|---|---|
| tree-28 / pit 27 | 0.80 m | its LiDAR crown already cleared |
| tree-37 / pit 36 | none | cleared |
| tree-77 / pit 76 | 0.25 m | cleared |
| tree-84 / pit 83 | 0.72 m | cleared |
| tree-85 / pit 84 | 1.80 m | cleared |
| tree-104 / pit 103 | 0.38 m | cleared |
| tree-127 / pit 126 | 1.15 m | cleared |
| tree-153 / pit 152 | 1.90 m | cleared |
| tree-172 / pit 171 | 0.14 m | its LiDAR crown already cleared |
| Van Cleef & Arpels bench | 0.76 m (seats 0.77 m) | not applicable; its lamp moved to the bench's north end |

`preview/public/data/district-vegetation.json` is untouched: it still records what LiDAR saw.
These are design corrections, applied by the placement selectors every consumer already reads.

**Crowns.** The drawn trees carry leaves far below their measured crown base, so data alone would not
clear them. The renderer discards tree fragments in a volume as wide as the canopy and up to just past
its top. That adds no mesh, draw call or texture, and it applies at every level of detail and in both
finishes. Sun shadows still use the whole crown. The ambient occlusion pass cannot discard, so bark in the
tree batches that reach the volume is left out of it, as leaves already are. `pnpm run test:ribbon:crowns`
proves the drawn result in pixels, and checks that nothing above the canopy top changes.

## What is not finished

- **South and link-studios are still blocked and are not drawn.** Their blockers remain in
  `five-rooms.json`. The spine being clear says nothing about them.
- **The planted edge is off,** behind `clearSegmentPlanting`. Clearing a segment does not plant it; that
  choice is still Val's (#840).
- **`tree-17` at the Shade Garden** belongs to the south segment and is not addressed here.
- **Tenant retirement, new interiors, the 3x map and gameplay** are outside this boundary.

## Building on it

- Connect to the spine only at the anchors in the data file: the crossing, whose landings are 9.5 m apart
  across the side lane, and the three venue links.
- Do not move a spine point. Module, post, lamp and fan IDs are derived from them, and the corrections
  are measured against them. A changed point means a new boundary version.
- A new segment starts `blocked` with its blockers named, and becomes `clear` only when the validator
  agrees. Do not lower a clear height or shrink the walker to reach that.
- The walk's solids are read by both client and server through `preview/src/walking.js`. A finish never
  changes them.

## Rollback

Reverting the code is enough, and it is safe with someone on the moved bench. The corrections are
derived at load from unchanged source data. A checkpoint keeps a seated player at the seat's previous
spot, and restoring seats them on the moved bench, so this build and the one before it accept each
other's checkpoints. Without that rule, one person on that bench would make the whole town's checkpoint
invalid in either direction. A server test pins the saved position, and a rehearsal across both builds
passed on 2026-11-04 (see the ledger). This does not replace an occupied rollback on real services.

Two small limits remain. On a rollback, a creator object placed exactly on the seat's old spot still fails
closed, because the earlier build tests that spot. And a resident resting on the bench across a deploy
draws at the other build's seat spot until they next stand up.
