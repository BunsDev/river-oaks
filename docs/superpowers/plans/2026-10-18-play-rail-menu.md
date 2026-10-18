# Play rail as a game menu; preferences in Settings

## Objective

Val, 2026-10-18: improve the design of the Play & rides rail in the style of
modern game menus, and move settings into Settings where they apply. Val chose a
tabbed layout and a separate PR from `main`.

## Ownership and base

- Task `play-rail-menu-20261018`, owner `claude:river-oaks-a9 (6cf0a612)`.
- Branch `feat/play-rail-menu-20261018`, worktree `river-oaks-play-rail-menu`.
  Written on `origin/main` `a308a95d` and rebased onto `153471bc`.

## Change

- `play-rail-tabs.js` (new): the pane catalogue in menu order (Character, Rides,
  Photo, Cycling, Birds, Game guide, Build, Office, More), each with an icon, plus
  arrow, Home and End navigation.
- `play-dock.js`:
  - An icon tablist and a heading with the chosen activity between ‹ and ›.
  - One `role=tabpanel` pane at a time.
  - Modules still append their panels to `content`, and the dock files each
    under its tab. An activity whose panels are all hidden has no tab.
  - Rides leaves the character card and becomes its own pane, kept open with its
    summary hidden.
  - Only a player's choice is remembered. Until then the dock prefers the
    remembered tab, then Character, as panels arrive.
  - `jump()` selects the right tab before focusing a control.
  - The API is unchanged, plus `select()`.
- `play-rail-menu.css` (new): game-menu styling on the HUD glass tokens, in light
  and dark. An accent pill with a glow and an underline marks the chosen tab,
  headings use tracked capitals, and the hint becomes a footer legend. Touch
  targets are 44 px and reduced motion is honoured.
- `player-avatar.css` and `visual-finish.css`: 32 descendant selectors widen from
  `.player-controls …` to `:is(.player-controls, .play-rail-rides) …`, so the Rides
  pane keeps the card's control styling. Specificity is unchanged.
- Settings:
  - `sidebar.js` gains `addSettings()`, which also places a pane after a named
    one, and exposes `group`.
  - `main.js` moves the camera-view toggle into a new **Controls** pane after
    Graphics. The pane also has an "All commands & keys" button. V still switches
    the camera in play.
- Commands: Rides now targets the ride picker, and a new "Camera view" command
  opens Settings › Controls.
- Docs: `rail-navigation.md` (current layout), `photo-mode.md`, `bird-cams.md`.
- 19 journeys select the tab for the activity they use, the way a player would.
  Camera changes go through Settings › Controls.

## Verification

- Unit: `play-dock` and `play-rail-tabs`, 4/4. Full preview suite: see the final
  run below. Its one earlier failure was the load-sensitive penthouse test, which
  also fails on the `#484` merge under load and passes when run alone.
- Browser, with the lock bypassed at Val's request while load was 200–680:
  - First run: three of my own bugs.
    - `addPane` lost its `tab` declaration, and startup failed.
    - The themed display rule beat `[hidden]`, so every pane showed.
    - Sessions defaulted to Rides because the character card arrives last.
    - All three are fixed.
  - Renders r3 and r4 in dark, light and phone (`.runtime/rail/`): seven tabs,
    opening on Character, with Settings › Controls present.
    - Rides and the Settings camera button had lost their styles. Fixed and
      re-rendered.
  - `rail-navigation` 82 checks (new: one pane at a time, arrow keys, camera in
    Settings, the chosen tab survives reload), `player-forms` 139, `ui-polish` 24,
    `bird-cams` and `carriage`: passed.
  - `experience` fails at `#walking-controls-toggle`. Unmodified `origin/main`
    `153471bc` fails at the same step: town chat covers the walking console under
    900 px (`.game-hud:has(.town-chat-dock[open]) .walking-console`). Not caused by
    this change.

## Rebase onto `153471bc`

- `multiplayer-dev.js`: `main` dropped the beast form ("focus characters on
  humans"), so the journey keeps `main`'s step and no longer switches forms.
- `main.js`: both blocks stay. `main`'s Character Studio trigger sits before the
  character picker, in the Character pane, and the Controls pane follows it.
- `experience.js` checked that ride controls are reachable in a short landscape
  window by scrolling to `#player-camera`, which now lives in Settings. It now
  scrolls to the last visible button in the Rides pane.
- No dependency changes. No new rail panels or `.player-controls` styles on `main`.
- Checks on the rebased code, browser lock bypassed:
  - Unit `play-dock` and `play-rail-tabs` 4/4; `pnpm run build` passed.
  - Journeys `rail-navigation`, `player-forms`, `ui-polish`, `carriage`,
    `character-studio` and `character-studio-layout` passed.
  - `experience` fails at `#walking-controls-toggle`, as on `main`.
  - Hosted CI does not run `experience`, so a throwaway copy closed town chat
    before that step to reach the landscape checks, on this branch and on
    `main`. On this branch, "Ride controls can be reached in landscape" passed.
    Both then fail at "Commands remains independently reachable in landscape",
    a pre-existing failure that this change does not cause. The copy was deleted.

## Gaps

- Shared-mode journeys (multiplayer-dev, rail-shared, shared-seating,
  multiplayer-exclusivity, vehicle-exit, world-publish, creator-objects,
  cycling-leaderboard, the carriage variants) have edited selectors but have not
  been run locally. Hosted CI is their gate.
- A detached baseline worktree, `river-oaks-main-baseline-rail`, holds the `main`
  comparison and should be retired through the project tooling.
