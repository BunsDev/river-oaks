# Ribbon layout contract (#825 slice 1)

**Task:** `ribbon-layout-825-20261031`. **Branch:** `feat/ribbon-layout-825-20261031`, based on
`origin/main` `fcc72b5c`. **Owner:** Cody. **Epic:** #825 (Val's decisions of 2026-10-31).

## Objective

Give the Ribbon, the shaded canopy walk that joins the Five Rooms, a data contract and a
validator: hand-drawn path segments go in; canopy modules, edge posts, lamps, fans and
seat sockets with stable IDs come out. No rendering, no client wiring, no District placement.

## Files owned

- `shared/city-kit/ribbon-layout.js`: `RIBBON_RULES`, `validateRibbon`, `expandRibbon`.
- `preview/tests/ribbon-layout.test.js`: behavioural tests on a synthetic recipe.
- This ledger.

## Contract

- Units and frame from the city kit: metres, site-local x east, y north.
- A segment is a polyline with `width` (at least 1.2 m), `clearHeight` (at least 3 m), `style`
  (`canopy` or `arcade`) and optional `seats` (`every` n modules, `left` or `right`). Runs are
  at least 1.5 m long, and a turn is at most 90°.
- Each run is cut into equal modules as close to 3 m as it allows. Module kinds: `end`, `straight`,
  `curve` (turn under 30°), `corner`. Post pairs stand on each module boundary, mitred at turns.
- IDs: `ribbon:<segment>:module|fan|seat:<nnn>`, `ribbon:<segment>:post:<nnn>:l|r`,
  `ribbon:<segment>:lamp:<nnn>`. Numbering is per segment.
- Exclusions (`doorway`, `seat-access`, `no-go`, `step-free`) are rectangles. Any post or seat
  footprint inside one, or a seat on any segment's walk, fails with the ID and the segment to edit.
- The seed (via the city kit's `streamFor`, keyed by ID) picks only the fan finish.
- Output is rounded to the millimetre and hashed with `stableHash`.

## Checks and results

- `node --test preview/tests/ribbon-layout.test.js`: 7/7 pass. The first run failed 2/7 and
  found a real bug (posts missing at boundaries between modules), fixed before commit.
- `pnpm run verify` (2026-10-31, base `fcc72b5c` plus these three files): exit 0, `core: passed`
  (`.runtime/agent/core.json`); pytest 215 passed; gitleaks found no leaks. The `hud-token-contrast`
  entries under "failing tests" are its 35 `todo` R8 gaps (fail 0), not failures.
- Not run: `pnpm run verify full` (Redis, browser, audit). This slice has no browser surface.

## Gaps

- No real Ribbon path yet: it depends on Val's parcel ruling (#825 open questions).
- Posts are not checked against other segments' walks, and module joins between segments are
  not modelled. Both matter once two segments meet (slice 2).
- No budget check: the 657 render budget applies to slice 2.

## Next step

Slice 2: a graybox render of `expandRibbon` output under the `pink-jet-age` finish, after the
parcel ruling supplies the path.
