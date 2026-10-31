# Mobile gamepad controls (task mobile-gamepad-controls-20261030)

Branch `feat/mobile-gamepad-controls-20261030`, worktree
`river-oaks-mobile-gamepad`. Owner: nova (Coven Cave).

## Objective

Touch screens play like modern mobile shooters (CoD Mobile, PUBG Mobile): a
floating left thumbstick with sprint lock, right-thumb free look, and a
right-thumb action cluster, without changing any movement contract.

## Files owned

- `preview/src/touch-gamepad.js`, `preview/src/touch-gamepad.css` (new)
- `preview/tests/touch-gamepad.test.js` (new)
- `preview/src/walking-ui.js` (gamepad wiring, touch hint wording)
- `preview/e2e/district-polish.js`, `preview/e2e/touch-people.js` (touch expectations)
- `docs/touch-play.md`, this ledger

## Design

- The stick maps eight 45° sectors to held W/A/S/D keys and sprint to
  ShiftLeft. No analog speed reaches movement, so server checks are unchanged.
- Sprint locks on a near-vertical pull past 1.45× the ring; ends on reverse,
  dead zone or release.
- Use button runs the HUD's current primary action. ▲/▼ hold Space/C only in
  flight or when piloting the hover vehicle.
- The six-button pad starts collapsed on every device; a stored choice wins.

## Checks and results

- 2026-10-31 `node --test preview/tests/touch-gamepad.test.js`: 8/8 pass.
- 2026-10-31 `pnpm run build`: pass.
- 2026-10-31 `pnpm run verify` on 5204e4b8 (base 5b00fd0b): `core: passed`.
  Preview unit 4821 tests, 4785 pass, 0 fail, 1 skipped, 35 todo (known
  hud-token-contrast items); server 1395/1110 pass, 0 fail, 285 skipped;
  desktop 132/127 pass, 0 fail, 5 skipped; secrets scan clean.
- Not yet run: touch journeys (`district-polish`, `touch-people`,
  `touch-hold`) under the browser lock; `pnpm run verify full`.

## Gaps

- Vehicle enter/exit, take flight and Ribbonwing maneuvers are still in
  Play & rides → Character (`player-avatar.js`, not owned here). Follow-up:
  thumb-reachable Ride and Trick buttons.
- No physical iPhone/iPad pass yet; emulation is not human acceptance.
- Landscape overlap with the top-right HUD stack (documented in touch-play.md)
  is unchanged.
