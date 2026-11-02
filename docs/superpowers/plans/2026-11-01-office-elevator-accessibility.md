# Elevators and offices accessibility (2026-11-01)

**Objective.** Val asked that the elevators and offices be fully accessible. Scope: the street office elevator entry, the penthouse office (lift, stairs, seats, desk, views, access management) and The Gardens campus lifts and suite directory. Related: #746 (R8 accessible HUD and wayfinding), #288.

**Branch / worktree.** `fix/office-elevator-a11y-20261101` at `../river-oaks-office-elevator-a11y`, from origin/main `78fe1c16`. Register task `office-elevator-a11y-20261101`.

**Files owned.** `preview/src/office-ui.js`, `preview/src/walking-ui.js` (lift label and arrival notice only), `preview/src/level-portal-labels.js` (new), `preview/src/garden-campus-ui.js` (accessible names only), their tests, `docs/offices.md`.

## Audit findings on main

| Area | Finding | Result |
|---|---|---|
| Penthouse focus | A focused control that hides drops focus to `<body>`; the office listens for keys on its dialog, so WASD, Q, Z and Escape stop until a click. Reproduced with Enter on **Skip arrival**: Chromium 156 and WebKit 27.2 both left focus on BODY and W moved 0 m. | Fixed |
| Penthouse lift | Label said only "Use the lift"; no destination. | Names the floor |
| Office keys | Keys were only in visible text. | `aria-keyshortcuts` on every control |
| In-reach actions | Lift, stairs, chair and desk buttons appear silently. | Polite status names them |
| Access management | Several identical "Revoke access" buttons. | Named per guest |
| Gardens lifts | "Take the lift up/down" with no floor; arrival not announced. | Names floor, announces arrival |
| Gardens directory | Accept/Decline/Withdraw/Ask/term pickers repeat per row with identical names. | Named per suite |
| Step-free reach | Every Gardens tower floor reachable by lift alone, lift back from each; penthouse lift links both floors. | Already true; now tested |
| Gallery v2 interior | Two floors joined by stairs only (no lift). Not an office. | **Not changed**: needs a design/geometry decision |

## Checks

- Red first: four new office tests, the suite-name assertions and the label module tests failed on main.
- Focused: office, garden-campus, level-portal-labels, walk-driver, workplace suites 332/332.
- Browser probe (keyboard-only Skip arrival then W): main control BODY / 0 m in Chromium and WebKit; fix office-visit / 1.864 m Chromium, 1.82 m WebKit.
- Browser journeys on `559c0057` (Chromium, Metal): `node preview/e2e/office-penthouse-runner.mjs` passed (arrival, seat, six views, stairs to the mezzanine); `node preview/e2e/experience-runner.js garden-campus-suite garden-campus-traversal office-visit` passed all three. `data/reports/experience.json` restored; these receipts are not committed.

## Gaps

- No human screen-reader (VoiceOver/NVDA) or physical-device pass. Announcements are checked as DOM state, not heard.
- Contrast of the office and campus panels is unchanged and was not re-measured here; #746 owns the visual treatment.
- Gallery v2 (`osm-way-625333006`) has no step-free route to its upper floor. Adding a lift is a geometry and design decision for Val.
- Gardens lifts still move one floor per press, as the server's portal pairs define. A floor picker would be a server contract change.

## Next step

Open the PR, run `pnpm run verify`, land with Val's 2026-11-01 merge authorization.
