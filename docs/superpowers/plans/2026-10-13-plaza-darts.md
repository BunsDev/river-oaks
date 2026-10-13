# Plaza games: darts on the south wall — 2026-10-13

**Objective:** darts, from c2's queue (Val authorized landing when green; Val said
"pls proceed", so it was built while Go and cribbage landed).

**Branch / worktree:** `feat/plaza-darts-20261013` in
`../river-oaks-plaza-darts-20261013`, merged with main d4ad7d7 (Go).

## Change

- **`preview/src/darts-rules.js`** (new, pure):
  - The standard board in millimetres: `scoreAt` and `targetPoint` for every bed
    and both bulls.
  - 501 double out, three darts a turn. A bust restores the turn's start.
  - `checkout()` finds finishes within the darts left, favourite doubles first.
  - Games replay exactly from their landing points.
- **`preview/src/darts-opponent.js`** (new): aims at its checkout's first bed
  when it can finish, otherwise at the treble 20. A seeded 24 mm wobble, mixed
  with `Math.imul`.
- **`preview/src/plaza-salon-plan.js`:**
  - The board at (-2791.0, -1303.5), facing north. It's backed by the south
    wall, with a clear lane to the 2.37 m line, chosen by a scan of footprints,
    trunks, seats and the Dior corridor.
  - Its post footprint, plus `dartsStand`, `atDartsLine` and `dartSpot`. On the
    board the thrower's right is west.
- **`preview/src/plaza-salon.js`:** the post, backboard and board face, painted
  from `scoreAt`. The turn's darts stand in it (`userData.darts`).
- **`preview/src/plaza-darts.js` + `.css`** (new): the standing sheet.
  - The SVG board with its numbers.
  - The two-stop line, slower under reduced motion. Focus stays on Throw
    (`aria-disabled`).
  - The turn's darts, busts, and the checkout suggestion.
  - The regular or pass-and-play.
- **`preview/src/main.js`:** a `playProviders` line, the update, and the
  `__riverPlazaDarts` debug hook (`holdAt(mm)` and `goTo()`).
- **Salon Guide:** a darts chapter with board, throw and checkout pictures. The
  checkout picture matches what the sheet suggests from 81 (T19 D12).
- **Journeys:** `plaza-darts` (new). Docs: `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `darts.test.js` | 4/4. The board (bulls, every sector and ring, misses); 501 double out and busts; checkouts (170, finishes ending on a double, impossible scores refused); the regular's aim, determinism and finished games. |
| `plaza-salon.test.js` | 8/8 with the post. |
| `plaza-games-mirror.test.js` | The line 2.37 m out; darts where they landed; the thrower's right to the west. |
| `salon-guide.test.js` | 16/16. |
| All `preview/tests` | 2925 pass, 0 fail |
| Journeys | `plaza-darts` passed: walk to the line, X, three T20s through the two-stop line (180, 321 left), the sheet's marks, the regular's three, the wall board showing them, focus kept, Escape, walk away. `plaza-salon` passed. |

## Gaps

- Practice only.
- The camera doesn't turn to face the board after the debug walk.
- No cricket or other variants.
