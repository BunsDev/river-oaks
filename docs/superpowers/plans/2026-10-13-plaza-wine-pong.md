# Plaza games: wine pong at the café — 2026-10-13

**Objective:** Val asked to start wine pong after Jenga landed, and authorized
landing it when green. It completes the plaza games on Val's original list.

**Branch / worktree:** `feat/plaza-wine-pong-20261013` in
`../river-oaks-plaza-wine-pong-20261013`, from main f272cb0 (Jenga #320).

## Change

- **`preview/src/wine-pong-rules.js`** (new, pure):
  - A 2.4 m table, with six glasses racked 3-2-1 at each end.
  - A throw is an aim and a power, mapped to a direction (±0.12 rad) and a carry
    of 2.2–3.1 m.
  - `resolve()` decides each throw: into a glass, a rim rattle in or out (seeded
    per throw), a table bounce that can still drop in, or a miss.
  - Two throws a turn, and clearing the far rack wins.
  - `aimAt()` inverts `landing()`.
  - `trajectory()` gives the flight for drawing.
  - Games replay exactly from their throws.
- **`preview/src/wine-pong-opponent.js`** (new): the regular picks a glass
  (seeded, slightly favouring the front of the rack) and aims at its centre with
  a seeded wobble. The draws use `Math.imul` mixing. Tuned to sink 32% of throws;
  a game runs a median of 30 throws (p10 19, p90 46).
- **`preview/src/plaza-salon-plan.js`:**
  - The table at (-2797.2, -1296.0), east–west. The spot came from a scan of the
    plaza for open paving, trunk, footprint and road clearance, outside the Dior
    entrance corridor.
  - Its footprint discs, `winePongPoint`, and the standing spots and side
    (`winePongStand`, `winePongSide`).
- **`preview/src/plaza-salon.js`:**
  - The table: linen top, walnut apron and legs.
  - Twelve lathe-turned glasses (plain transparent material, no transmission)
    with a pour of red each, and the ball.
  - `userData.winePong.show(state|null)`, `ball(point|null)`, `glasses()`,
    `stand(side)`.
- **`preview/src/plaza-wine-pong.js` + `.css`** (new): the standing sheet.
  - The table from your end, beside a close-up of the far rack.
  - The reticle sweeps across for the aim, then along the line for the power
    (slower under reduced motion).
  - The ball flies in both views and over the real table.
  - The regular takes its two throws after yours. Pass-and-play flips the view
    each turn.
  - Tallies of glasses left and games won.
- **`preview/src/main.js`:** a `playProviders` line, the update, and the
  `__riverPlazaWinePong` debug hook (`hold()` holds the reticle still for tests;
  `goTo(side)` walks to an end).
- **Journeys:** `plaza-wine-pong` (new). Docs: `docs/multiplayer.md`.

## Checks

| Check | Result |
|---|---|
| `wine-pong.test.js` | 7/7. Racks, the `aimAt`/`landing` inverse, in, rim, bounce-in and miss, turns and the win, exact replay, regulars over six seeds up to `2 ** 32 - 1`, flight, standing spots. |
| `plaza-salon.test.js` | 8/8 with the new table: open paving, clear of trunks and roads, and the footway still connected. |
| `plaza-games-mirror.test.js` | Twelve glasses racked at the ends, hit glasses gone, glasses on the table top, and the ball shown and put away. |
| All `preview/tests` | 2844 pass, 0 fail |
| Journeys | `plaza-wine-pong` passed: walk to the west end, X, a sure sink through the aim and power presses (the glass gone on the sheet and the table), focus kept through the flight, the close-up and layout fit, an overthrow, the regular's two throws, Escape, walk away. `plaza-salon` passed. |

## Found by the journey

The Throw button was `disabled` during the flight, which dropped keyboard focus to
Close, so the next Space closed the sheet. It now uses `aria-disabled` and keeps
focus. The first screenshot also showed the glasses too small to aim at, which led
to the close-up view.

## Gaps

- Practice only, like the other plaza games.
- No re-racks or redemption shots.
