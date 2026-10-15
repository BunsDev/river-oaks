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
  shared benches). Each approach is at least 2.7 m clear, no desk covers a plan chair, each desk has a height
  under 1.2 m, and 12/12 required walk routes are walkable with every other seat occupied. The report lists
  the 32 other floor colliders it did not check.
- **Stronger local probe (scratchpad, not committed):** with all 23 non-chair kit floor colliders added as
  obstacles (desks, sofas, tables, trees, lift sides, columns, glass) and every other seat occupied, 12/12
  required routes stay walkable.
- Coordinates stay in the local kit; this ledger and the PR do not reproduce them.

**This is not an approval.** It shows the kit's numbers would satisfy the posted rules. Val (R19) and design
decide whether they become the plan's measured footprints; only then does the plan gain desk obstacles and
the graybox desks.

## Independent review (subagent, 2026-10-15, at `2e877177`)

Fixed: a desk could cover a chair and pass (desks are now held 0.4 m from every plan chair); a collider
with no height passed (now fails); floor colliders other than desks were ignored silently (now listed as
`unchecked`); and the test used the kit's real desk centres (now invented ones). Accepted as a limit: a desk
modelled as several boxes is checked only where it holds the desk centre. The probe above covers the rest
for this kit.

## Checks

| Check | Result |
| --- | --- |
| `node --test scripts/tests/office-kit-fit.test.js` (synthetic desks) | 2/2: a passing layout; a crowded approach, a missing desk, a route-closing desk, a desk over a chair and a desk with no height each named. First version written right after the script; the review cases were written first and failed. |
| `node --test scripts/tests/*.test.js` | 111/111 before the review fixes |
| `node scripts/office-kit-fit.mjs ~/Downloads/jevica-office-kit` (after fixes) | ok: 5/5 desks, 12/12 routes, 32 unchecked listed |

## Next

PR stacked on #400; ask Val/design to approve or reject the kit desk footprints (R19 scope).
