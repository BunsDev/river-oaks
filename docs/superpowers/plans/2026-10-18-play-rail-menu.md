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

## Hosted CI on PR #503 (`4df7db65`)

- `rail-navigation` and the other journeys in the hosted shards passed, except four that timed out on hidden pane controls:
  - `world-publish` and `creator-objects` picked `#build-kind` before selecting Build.
  - `office-desk` and `office-visit` clicked `#office-enter` in the Office pane.
- Players are not affected: the office's "Office elevator · F" prompt mounts on the canvas, outside the rail.
- Fix: those journeys, and `office-ipic-journey`, select the tab first.
- A sweep of every pane's control ids against every journey found no other action on a hidden pane control. It excludes the office dialog, which hosts office management while a player is inside.
- Local reruns with the fix:
  - `office-desk`, `office-visit`, the `development-publish` mode (`world-publish` and the three creator-level journeys) and the `creator` mode (`creator-objects`) passed.
  - `pnpm run verify` passed on `4df7db65`.
  - `office-ipic-journey` (own runner, local only) fails twice at line 78, before the edited step: the resident's `#office-nearby` prompt never shows after the lobby travel. Unmodified `main` `153471bc` fails at the same step, at load 80. That prompt mounts on the canvas, not in the rail, so the edited tab step at line 94 is not reached locally.

## Landing (river-oaks-c5, 2026-10-19)

Val's goal on 2026-10-19 asked c5 to take #503 through to merge. a9's lease had expired, and its session had been idle since 2026-10-18 16:33Z. Val had updated the branch from main (`1c5690b7`, then `eb8553ae`); c5 merged main `4eca5153` (#528) at `d4425ad2` and regenerated the plans index, which had lost this ledger's entry.

The hosted shards don't run these journeys, so c5 ran nine of the dock-adjacent local-only ones on `1c5690b7`, then reran the failures on main `eb8553ae`:

| Journey | `1c5690b7` | main `eb8553ae` | Cause |
| --- | --- | --- | --- |
| `plaza-salon`, `sidebar`, `hud-and-quality` (14), `player-lifecycle` (19), `nearby-encounters` | passed | — | — |
| `salon-guide` | timed out clicking `[data-guide-entry]` | fails earlier, at the 390 px medallion check | this change: the entry is in the hidden Game guide pane. The id sweep missed it because it targets an attribute |
| `game-hud` | "Sidebar tabs support arrow navigation" | passed (19) | this change: Controls now follows Graphics |
| `sable` | null `dataset` | same | main |
| `ui-improvements` | "Clearing filters restores all stores" | same | main |

Fix: `salon-guide` selects `#play-tab-guide` before the entry. `game-hud` expects Controls after Graphics. On the merged tree:
- `game-hud` passed 19 checks, and `sidebar` passed.
- `salon-guide` passes both dock steps. It still fails main's 390 px check ("How to play is a 36 px medallion"): #521 gave `.salon-guide-open` a 44 px minimum touch target. That is main's, not this PR's.
- A throwaway copy with only that check skipped passed 21 checks, both guide entries included, and was deleted.

Which edited journeys does hosted CI actually run? The shared shards (`shared-runner.js` modes `development`, `required`, `development-publish`, `creator`) run `multiplayer-dev`, `rail-shared`, `shared-seating`, `multiplayer-exclusivity`, `vehicle-exit`, `world-publish` and `creator-objects`. `cycling-leaderboard` and the carriage variants are in the local experience suite only. Run at `8bac1f81`:

| Journey | `8bac1f81` | main `5f3f5dc2` |
| --- | --- | --- |
| `cycling-leaderboard` | passed (8) | — |
| `carriage-companion`, `carriage-driver` | passed (10 each) | — |
| `carriage` | passed (21) | — |
| `carriage-mobile` | touch pad never drives the carriage (10 s wait, line 19) | same step (line 18) |
| `movement-review` | companion never switches to walking (60 s wait, line 27) | same step |

The last two were broken on main before this PR, so their edited steps (`#play-tab-rides`, `#play-tab-character`, closing the menu with `.visit-tools-toggle`) have not run to completion anywhere.

**Merged** by `pnpm run land 503` as `6b93031b` on 2026-10-19 at 04:29Z, through the merge guard (`CLEAN`, after one GraphQL rate-limit retry). The lander had updated the branch with main `5f3f5dc2` to `608e39e2`. All 16 hosted check runs and the Vercel status passed there, and the merge tree equals that head's tree (`357fb216`).

## Gaps

- `salon-guide`'s 390 px medallion check disagrees with #521's 44 px touch target on main. It needs an owner's decision.
- `sable`, `ui-improvements`, `carriage-mobile` and `movement-review` fail on main.
- No human visual or screen-reader pass.
- A detached baseline worktree, `river-oaks-main-baseline-rail`, holds the `main`
  comparison and should be retired through the project tooling.
