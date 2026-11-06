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
- `visitor-pass-ledger-20261106`: this ledger's status and hand-over (docs only). Branch
  `docs/visitor-pass-ledger-20261106`, worktree `river-oaks-visitor-ledger`.

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
| Ribbonwing passenger (#777, #779) | invited; Tab reaches **Board** (14 stops); Enter boards; G steps out | pass (on the second-increment tree); the first run had walked alice 100 m away first | pass; **the invitation line was rewritten every frame (50 writes in 0.8 s)** |
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

## 3. The sweep's fixes (`visitor-sweep-a11y-20261105`, #891)

**Fixes:**

- **Roster Block and Report** (`player-blocks.js`, `multiplayer-client.js`): `aria-disabled`
  while the town answers, not `disabled`, and presses are ignored meanwhile. This is the pattern
  `plaza-wine-pong.js` already uses.
- **Settings Unblock** (`player-blocks.js`):
  - focus on an Unblock button follows its resident across the list's rebuilds;
  - after an Unblock it moves to the next resident (the one before, for the last), then to the
    status line (`tabIndex = -1`);
  - it never takes focus that was elsewhere.
- **Ribbonwing seat line** (`ribbonwing-seat.js`): `show()` runs every frame, and now writes the
  polite line only when its words change (`writeLive` from #867).

**Failing first:**

| Regression | On main | With the fix |
|---|---|---|
| `player-blocks.test.js`: a busy Block stays focusable and ignores presses | fails (`disabled` while busy) | passes |
| `player-blocks.test.js`: Unblock focus moves to the next resident, then the status line | fails (focus stays on the removed button) | passes |
| `player-blocks.test.js`: Settings does not take focus that was elsewhere | passes (guard) | passes |
| `ribbonwing-passenger`: the invitation line is not rewritten over ten drawn frames | **fails**: `{"writes":10,"frames":10}` | passed |

**Sweep after the fix** (Chromium 156 and WebKit 27.2, 04:43–04:45Z):

| Step | Chromium | WebKit |
|---|---|---|
| Ribbonwing boarding | the invitation is heard once; Tab reaches Board (14); boards; G steps out | same |
| Roster Block | focus stays on the button, now "Unblock bob"; both announcements heard | same |
| Settings Unblock | focus moves to the status line "You unblocked bob."; Escape returns to the Settings button | same |
| Report | focus stays on "Report disruption by bob"; the result is announced | same |

**Release notes** (`docs/releases/0.3.0.md`):

- the garage line now says what is the visitor's and what is the owner's (#767, #791);
- the seat line and the focus fixes are listed (#891).

The candidate header, counts and BLOCKED status stay with river-oaks-4f's re-qualification.

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
- **Not run here:** `verify full`, Redis and other journeys.
- **Hosted:** #890 at `06a08972` was 34/34 green (Verify 42164242176, first attempt). It merged as
  `c6f9542d` at 2026-11-06T04:56:15Z.

**Second-increment tree** (`477e9237` + main `c6f9542d`):

- **Before the merge:**
  - `node --test preview/tests/player-blocks.test.js`, 17/17;
  - `pnpm test`, 5248 passed, 1 skipped, 30 todo;
  - shared `player-blocking`, `player-blocking-lifecycle` and `player-blocking-interface`
    (Chromium) passed;
  - `ribbonwing-passenger` passed;
  - the sweep steps passed in both engines.
- **After the merge** (`73ea32fa` + these docs):
  - `pnpm run verify`, 04:57–05:03Z at load 10–12, passed:
    - tooling 307/0;
    - preview 5252 passed, 1 skipped, 30 todo;
    - server 1125 passed, 285 skipped;
    - desktop 127 passed, 5 skipped;
    - Python 215 passed;
    - no secrets found;
  - `ribbonwing-passenger` passed (Chromium), with both increments' checks.
- **Not run:** `verify full`, Redis and the other journeys.
- **Hosted:** #891 at `48905b03` was 34/34 green (Verify 42166452582, first attempt). It merged as
  `8b823e5a` at 2026-11-06T05:21:54Z.

## Decisions for Val

1. **WebKit owner check in `multiplayer-exclusivity`:** `jevVisible:false` on main in Playwright
   WebKit 27.2. It is outside the visitor list and not fixed here. Hosted runs this journey in
   Chromium only.
2. **Reports in the browser fixture:** the fixture has no moderation store, so no browser
   journey can check that a report reaches the moderators' inbox. The server tests cover it.
   Adding a memory moderation store to `server/tests/browser-fixture.js` would let a journey
   check it end to end. Not done here.

## Status and hand-over (2026-11-06)

**Delivered:** #890 (`c6f9542d`) and #891 (`8b823e5a`). The evidence comment is on #791
(issuecomment-6677649939). The issue stays open: closing issues was not this goal's to do.

**Hand-over to river-oaks-4f:**

- SendMessage to `river-oaks-4f` failed at 04:57Z and 05:23Z. The session `3158e24e` was still
  running, under the new name `river-oaks-d7` (`~/.claude/sessions/<pid>.json` maps names to
  session ids).
- A message with the merged heads (pin on or after `8b823e5a`) went to `river-oaks-d7` at about
  05:31Z. That session **held** it for its user's approval, the usual cause being a different
  permission mode, so its Claude had not seen it when this was written. It is not delivered
  until that session's user approves it. The message also said this docs-only change would land
  unless 4f had pinned or asked to hold main.
- At 05:31Z #885 was still a draft at `94ae357c` (base `1dc64db1`), so no pin had been made. Its
  merge of main picks up both increments.

**Local retirement:** both increments' branches and worktrees were retired with `project:prune`
at 05:27Z (`retirement-nBOsj4`, `retirement-b9RGNW`). First, their ignored evidence (`.runtime`,
`output/playwright`, `data/generated`) went to
`~/worktree-backups/river-oaks/visitor-791-local-evidence-20261106` and
`visitor-focus-local-evidence-20261106`, and was checked file by file after extraction. That
includes the sweep probe `visitor-sweep.mjs`.

## Next step

- **Hand-over:** the held message needs approval in the `river-oaks-d7` terminal before 4f has
  the heads. Until then the hand-over is only in the register rows.
- **The pin:** river-oaks-4f pins on or after this ledger's merge head, which goes to it by message
  too.
- **Decisions:** the two above are Val's.
