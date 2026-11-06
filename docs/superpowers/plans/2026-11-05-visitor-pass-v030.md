# v0.3.0 for visitor accounts (#791 and the visitor sweep)

**Objective:** make the 0.3.0 claims made for players true for a non-owner (visitor) account,
keyboard-only in Chromium and WebKit, before river-oaks-4f pins the release head
(`v030-blockers-20261103`, #885). Start from #791.

**Owner:** claude:river-oaks-0f (session `0347dfc9`; it was named river-oaks-4d when the goal began).

**Register tasks, one per increment:**

- `visitor-garage-keys-791-20261105`: #791, the visitor Q/G keys. Branch
  `fix/visitor-garage-keys-791-20261105`, worktree `river-oaks-visitor-791`.
- `visitor-sweep-a11y-20261105`: the sweep's fixes. Branch `fix/visitor-roster-focus-20261105`,
  worktree `river-oaks-visitor-focus`.

**Not owned here:** #885 and the v0.3.0 performance lanes (river-oaks-4f); crime #599; Five Rooms
and seat chat; Ribbonwing #888/#813. #888 changes `ribbonwing.js` and #813 changes
`parked-carriage.js` and the server. Neither touches `player-avatar.js` or `ribbonwing-seat.js`.
Measurements used no ABBA or other load-heavy runs. Browser runs went through the shared lock.

## Why the 11-02 gates missed it

The 11-02 street accessibility sweep (`2026-11-02-street-a11y-sweep.md`) ran only as the `owner`
fixture identity. Since v0.2.2, several features show or behave differently for the owner than
for visitors: the garage (#767), the companion, the character chips and the Ribbonwing seat.

## 1. #791: Q and G for every account with a garage

**Defect, on main `1dc64db1`:**

- #767 (after v0.2.2) gave every account a garage, and its buttons declare
  `aria-keyshortcuts="Q"` and `"G"`.
- The world's key handler in `preview/src/player-avatar.js` returned on `!owner`, so for a
  visitor the keys did nothing. Screen readers still announced shortcuts that did not work.

**Passenger G:** the issue says that dropping `!owner` once also sent a passenger's G to her own
garage. Today's `ribbonwing-seat.js` handles G in the capture phase and stops propagation, so the
order of listeners hides the double dispatch. The fix does not depend on that order: the gate
itself refuses.

**Fix:**

- `preview/src/garage-keys.js` holds the gate:
  - Q calls and G rides for any account with a garage (`rideKinds.length > 0`);
  - held keys, keys already taken (`defaultPrevented`), chords and form fields are ignored;
  - a player aboard a ride that is not their own (another pilot's Ribbonwing seat, a plaza bike)
    gets neither key.
- `player-avatar.js` uses that gate for both keys and buttons:
  - aboard another ride, Call and Ride are disabled;
  - Call's hint says "Step out of this ride to call your own".

**Regressions:**

- `preview/tests/garage-keys.test.js`, 4 tests: visitor Q/G; G steps out of your own ride; a
  passenger or bike rider gets neither key; repeat, `defaultPrevented`, chords and form fields
  are refused.
- `preview/e2e/multiplayer-exclusivity.js` (hosted "preview shared"): the non-owner rider now
  calls with Q, boards with G and steps out with G, where the journey used to click.
- `preview/e2e/ribbonwing-passenger.js`: alice's own garage (status, riding, called) is
  unchanged after her G aloft and after her G step-out.

**Failing first:**

| Run | Code | Result |
|---|---|---|
| `multiplayer-exclusivity`, Chromium | main `player-avatar.js` + new journey | **fails**: `Q did not call a non-owner's motorcycle: {"status":"","call":false,"title":""}` (the button was enabled) |
| `multiplayer-exclusivity`, Chromium | fix | passed |
| `multiplayer-exclusivity`, WebKit 26 | fix | the visitor's Q, G and G step-out passed; the journey then failed in its **owner** section (below) |
| `multiplayer-exclusivity`, WebKit 26 | main, unchanged journey and code | fails the same owner check, so it does not come from this change |
| `ribbonwing-passenger`, Chromium | fix | passed (2 min, load 5.6), with the new garage checks |

**WebKit owner check (pre-existing, outside the visitor list; for Val):**
`multiplayer-exclusivity` fails on main in Playwright WebKit with `Owner is missing Jevica or her
crew: {... "jevVisible":false}`. Hosted runs this journey in Chromium only. It is recorded under
Decisions for Val, not fixed here.

## 2. Visitor sweep

Probe: `.runtime/visitor-791/visitor-sweep.mjs <engine> [step ...]`, not committed. It uses the
fixture residents alice and bob, keyboard only (`Tab` in Chromium, `Alt+Tab` in WebKit), and
records every live-region change. The owner appears only as the Ribbonwing pilot and as the
moderator. Runs on main + #791 (`1dc64db1` tree), 2026-11-06 04:3x–05:0xZ, Chromium 156 and
WebKit 27.2, load 8–16 (core verify ran alongside; timing is not measured here).

| Claim | Steps (visitor, keyboard only) | Chromium | WebKit |
|---|---|---|---|
| Garage and motorcycle (#767, #791) | Q calls, G boards, G steps out | pass with #791 (`multiplayer-exclusivity`) | pass with #791 (visitor part) |
| Ribbonwing passenger (#777, #779) | invited; Tab reaches **Board** (14 stops); Enter boards; G steps out | not reached: earlier steps had walked alice 100 m away (probe order; rerun in the second increment) | pass; **the invitation line was rewritten every frame (50 writes in 0.8 s)** |
| Garden Circuit (#834) | Tab to Start (4 stops), Enter; W drives; Space hops without restarting; focus moves to the course | pass | pass |
| Character Studio random start (#694, #766) | Tab to "Open character studio" (9), Enter: a random person of your own (`create`, `custom-human`, "unsaved edits"); Surprise me keeps focus and is announced; Escape returns focus to the trigger | pass | pass |
| Roster Block (#711) | Tab to "Block bob", Enter asks to confirm (announced), Enter blocks (announced) | **focus fell to the page after the block** | **same** |
| Account settings Unblock (#711) | Settings, arrows to Account, Tab to "Unblock bob", Enter (announced); Escape returns to the Settings button | **focus fell to the page after Unblock** | **same** |
| Reports (#715, resident side) | Tab to "Report disruption by bob", Enter; the result is announced | **focus fell to the page** | focus kept |
| Seat-stand fix (#866) | Z sits, Z stands, hold W 3 s | 4.94 m | 4.94 m |
| In-reach cue (#867) | walk to a bench | "In reach: Sit on the bench. Press Z." once | once |

**Reports in the fixture:** the browser fixture runs the town without a moderation store
(`server/tests/browser-fixture.js` passes no `moderation`), so `server/app.js` refuses every
report there with "Report could not be submitted." That is the fixture, not the product. Saving
a report and the moderators' inbox are covered by `server/tests/reports.test.js`,
`moderation-reports.test.js` and `moderation-notify.test.js`. The browser could only check the
resident side: the keyboard, focus and the announced result.

**Causes:**

- Roster Block and Report set `disabled` while the town answers. A focused button that turns
  disabled drops keyboard focus to the page (Chromium for both; WebKit keeps it on Report).
- Settings rebuilds the blocked list on every render, so the focused Unblock button is gone.
- The seat panel's `show()` runs every frame and wrote `status.textContent` each time.

The fixes are in the second increment (`visitor-sweep-a11y-20261105`).

## Claims that are owner-only by design

- **Garage:** a visitor's garage holds only the motorcycle (`spec.shared`). The Pink Rolls-Royce (Jev
  chauffeurs it) and the Ribbonwing are the owner's. The notes' "Players drive every other kind" reads
  as if visitors drive them all. Reworded in `docs/releases/0.3.0.md` with the second increment.
- **Ribbonwing:** only the owner pilots; visitors ride as passengers. The notes already say it
  "replaces the landowner hover coach".
- **Jevica, flight (B) and Jev's companionship (J):** the owner's, as
  `multiplayer-exclusivity` checks.

## Checks

**#791 tree** (main `1dc64db1` + this change), 2026-11-06:

- **Focused:** `node --test preview/tests/garage-keys.test.js`, 4/4.
- **Core:** `pnpm run verify`, 04:2x–04:42Z, passed at load 15–21 (the sweep ran alongside):
  - tooling 307/0;
  - preview 5249 passed, 1 skipped, 30 todo;
  - server 1125 passed, 285 skipped;
  - desktop 127 passed, 5 skipped;
  - Python 215 passed;
  - no secrets found.

  The receipt is `.runtime/agent/core.json` (`passed`).
- **Journeys:** `multiplayer-exclusivity` and `ribbonwing-passenger`, as in the table in section 1.
- **Not run here:** `verify full`, Redis, other journeys and hosted. Hosted preview runs on the PR.

## Decisions for Val

1. **WebKit owner check in `multiplayer-exclusivity`:** `jevVisible:false` on main in Playwright
   WebKit 27.2. It is outside the visitor list and not fixed here. Hosted runs this journey in
   Chromium only.
2. **Reports in the browser fixture:** the fixture has no moderation store, so no browser
   journey can check that a report reaches the moderators' inbox. The server tests cover it.
   Adding a memory moderation store to `server/tests/browser-fixture.js` would let a journey
   check it end to end. Not done here.

## Next step

Land #791, then tell river-oaks-4f the merged head. Then land the second increment (focus and
seat-line fixes, release-notes wording) on top of it, before the pin.
