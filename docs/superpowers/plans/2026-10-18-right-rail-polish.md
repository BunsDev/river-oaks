# Right rail polish

Task `right-rail-polish-20261018`, branch `feat/right-rail-polish-20261018`,
worktree `../river-oaks-right-rail-polish`, owner `claude:river-oaks-d8 (015e1f43)`.

## Objective

Val (2026-10-18, with four screenshots of main): make the right rail more
polished and minimal, and more intuitive for gameplay.

On main, the rail's Camera, Character, Rides, Cycling and Birds buttons only
jump within one long scroll. Every section is visible at once, with a nested
scrollbar. The type is mixed: a 22 px display "Bird cams" heading sits beside
spaced capitals. The office card's text runs flush to the edge, its buttons
are unstyled, and it shows a disabled picker and a disabled button when no one
can be invited. A two-line hint repeats the Commands button.

## Approach

Build on #503 (`play-rail-menu-20261018`, head `ec9f99ac`). #503 already
gives the rail an icon tab per activity, one pane at a time, keyboard tab
navigation, and a Camera control moved to Settings. Its CI was green and it
had waited for Val's review for about six hours. Its owner session
(river-oaks-a9) had ended and its lease had expired at 16:06Z. This branch
includes #503's commits and leaves #503's branch untouched, so #503 can be
closed once this lands.

## Changes on top of #503

- **No title row and no stepper.** Every pane's card already names it ("Your
  character", "Your chauffeur", "Photo mode", "Bird cams", "Game guide",
  "Jevica's office"). Each tab keeps its name as a tooltip and accessible
  label, so the title row only repeated what was already there.
- **Key legend only during an activity** (bird ride, building, flying), shown
  as a chip. The idle "Choose an activity · ? opens commands & keys" is gone;
  the Commands button already says that.
- **One card style for every pane:** 12 px inset, 14 px heading, muted 12 px
  body text, 36 px controls (44 px on touch), and a filled primary action.
  Bird cams and the office card follow it, and the cycling label is in
  sentence case.
- **Office:**
  - its actions are stacked full width (two side by side wrapped at this
    width);
  - "Take elevator · F" is the primary action once it is enabled;
  - with nobody to invite, one line ("Residents you can invite appear here
    once they are in town") replaces a disabled picker and a disabled button.
- **Cycling:**
  - the board shows open in its own tab instead of folded behind a summary;
  - because it fetches and refreshes while open, it opens only while its tab
    is showing in an open rail, and closes otherwise.
- **Rides:** the driving controls (smart drive, pause, brake and park, and the
  direction pad) appear only while Jevica is riding. Before that, the garage
  offers choosing and calling a ride. (The garage itself was already hidden
  for anyone but Jevica.)

## Files

`preview/src/play-dock.js`, `preview/src/play-rail-menu.css`,
`preview/src/office-ui.js` (empty-guest line only),
`preview/src/player-avatar.js` (ride-only controls),
`preview/tests/play-dock.test.js`, and a new `preview/e2e/play-rail-polish.js`.

## Verification

- `node --test preview/tests/play-dock.test.js preview/tests/play-rail-tabs.test.js`: 5/5.
  The new dock test fails on #503 (an always-visible hint line, plus a heading
  with stepper buttons).
- `pnpm run test:experience play-rail-polish` (new): 23 checks in both themes.
  They cover the title row, the idle legend, ride-only controls, overflow in
  every tab, the cycling board opening and closing with its tab, the office
  inset and single-line actions, and the empty-guest line. Screenshots are in
  `output/playwright/play-rail-{dark,light}-*.png`.
- Existing journeys that pass on this branch: carriage, vehicle-exit,
  cycling-leaderboard, office-desk, rail-navigation, bird-cams.
- Two local-only journeys fail, and fail the same way on current main (tree
  e4d8e0d2), on #503 + main, and on this branch:
  - `experience`: `#walking-controls-toggle` is not visible at 667×375;
  - `carriage-mobile`: driving with the W pad never moves 0.8 m within 10 s.

  Neither is in hosted CI's journey lists. Both predate this work and are
  tracked separately.
- Before and after captures: the baseline is the detached checkout of
  74a85345 (#503 + main); the after is this branch.


## Gaps

- Physical touch and VoiceOver have not been checked; only emulated sizes
  were measured.
- Guests (not Jevica) were not captured. The fixture signs in as the owner.
