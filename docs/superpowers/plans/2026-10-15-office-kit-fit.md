# #362: read-only desk fit check for the supplied kit

- **Task:** `office-kit-fit-362` (live register), owner `claude:office-seats-363 (928f5d63)`.
- **Branch / worktree:** `feat/office-kit-fit-362-20261015` in `../river-oaks-office-kit-fit-362`, stacked on
  `feat/office-seat-claims-20261015` (#400), which supplies seats and occupied-seat collision.
- **Issue:** #362 ("Coding familiar confirms importability and an initial in-engine fit check"); feeds #363's
  final desk collision and #361's occupied-route acceptance.

## Objective

The plan has no desk footprints: #362 must supply measured ones, and the import contract posted on #362 says
each must keep its approach anchor clear for the turning body (0.888 m) and leave every required route
walkable. `scripts/office-kit-fit.mjs <kit-dir>` overlays a kit's own proposed desk colliders on the plan
and applies those rules with every other seat occupied, so design and Val can decide on evidence. It reads
`layout.json` only; nothing is copied, imported or published (R19 stays open).

## Result on the supplied kit (2026-10-15, local, not committed)

- Kit `~/Downloads/jevica-office-kit/layout.json`, sha256 `ccd7e275…` (the contract's recorded kit).
- **Passes:** every station resolves to a floor desk collider at its kit desk centre (one executive desk, two
  shared benches); each approach is at least 2.7 m clear; 12/12 required walk routes are walkable with every
  other seat occupied.
- Coordinates stay in the local kit; this ledger and the PR do not reproduce them.

**This is not an approval.** It shows the kit's numbers would satisfy the posted rules. Val (R19) and design
decide whether they become the plan's measured footprints; only then does the plan gain desk obstacles and
the graybox desks.

## Checks

| Check | Result |
| --- | --- |
| `node --test scripts/tests/office-kit-fit.test.js` (synthetic desks) | 2/2: a passing layout; a crowded approach, a missing desk and a route-closing desk each named. Written right after the script, not before it. |
| `node scripts/office-kit-fit.mjs ~/Downloads/jevica-office-kit` | ok: 5/5 desks, 12/12 routes |

## Next

PR stacked on #400; ask Val/design to approve or reject the kit desk footprints (R19 scope).
