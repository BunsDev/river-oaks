# Settings tabs and a minimal walking console — 2026-10-13

**Objective:** Val asked to improve the UI/UX of each Settings tab (Appearance,
Graphics, Audio, World, Account, About), and to make the walking console at the
bottom of the screen ("More actions · 32 m walked · public district paths · Show
movement controls") more minimal.

**Branch / worktree:** `feat/settings-tabs-ux-20261013` in
`../river-oaks-settings-ux-20261013`, from `c62b960` (main with river-oaks-f1's
voice settings, #303). f1 handed over the Audio pane's look. Their control ids, the
`voice-mode` radio name and its `change` behaviour are unchanged.

## What was wrong

From screenshots of every tab on main, at desktop and phone sizes:

- **Repeated headings.** Appearance and Graphics each printed their title twice.
- **Three styles for one kind of choice.** The theme was a segmented control,
  while graphics quality and the light presets were separate boxes with a gold
  border.
- **Audio.** Radio and checkbox labels were pushed to the far side of the row,
  away from their controls.
- **World.** "Open World Studio" was an unstyled blue link, and light, weather
  and map layers ran together without grouping.
- **Account.** The action buttons sat in an indented cluster, and the world
  status floated with an unlabelled reload icon.
- **No purpose lines.** No pane said what it was for.
- **Phones.** The side list of categories took a third of the width.
- **Walking console.** At rest it was a three-line card holding no action: More
  actions, the walked distance, and a text button for the movement pad.

## Change

- `preview/src/sidebar.js` (Settings panes only):
  - Each pane opens with a one-line purpose (`.settings-pane-intro`, linked as
    the pane's `aria-describedby`).
  - World groups its rows under *Light*, *Show in the district* and *Build*.
    Account puts its status under *World data*.
  - On phones the selected category scrolls into view, and Left/Right also move
    between categories.
- `preview/src/settings-dialog.css` (new, loaded after `game-hud.css`), scoped
  to `#settings-dialog`:
  - one segmented control for theme, graphics quality and light;
  - the duplicate labels hidden visually but kept for assistive technology;
  - the graphics readout shown as a chip after its note;
  - label and control kept together on Audio rows;
  - World's layers as divided rows, and World Studio as a row link;
  - Account's actions as a list, with sign-out set apart in red;
  - one disclosure style across the panes;
  - About's facts as label and value rows;
  - 44px targets on touch;
  - below 640px, the categories become a scrolling row above a full-width pane.
- `preview/src/hud-glass.css`, walking console:
  - **At rest** (no main action, notice, open More list or movement pad) it is
    one 360px capsule: a small "More ⌄", where you are (with an ellipsis when
    long), and a four-way arrow icon for the movement pad. The capsule has a
    fixed width so the walked distance can count up without resizing it.
  - **With an action** the quiet controls share one line under the main
    button.
  - **With the More list or the movement pad open** it returns to the full
    card.
  - Both icon-style controls keep their accessible names ("More actions",
    "Show movement controls").

## Verification

Screenshots are from the session scripts `shoot.mjs` and `walk.mjs`, which run
against the repo's browser fixture. Every tab was captured before and after, at
1440×1000 and 390×844, in light and dark. The walking console was captured idle,
with an action, with More open and with the movement pad shown. No page errors
and no horizontal overflow.

| Walking console (1440 wide) | Before | After |
| --- | --- | --- |
| At rest | 310 × 93 px, three lines | 360 × 38 px, one line |
| With a doorway action | 310 × 247 px | 310 × 202 px |

- `pnpm test`: 2733 pass, 0 fail, 1 skipped.
- Journeys that touch Settings or the walking console (`pnpm run
  test:experience`, local GPU): `rail-navigation` (tab ids, arrow keys,
  Home/End), `game-hud` (modal, narrow fit, no overflow),
  `contextual-first-visit` (More actions and the movement toggle),
  `ui-improvements` and `hud-and-quality` passed.
- Not run: `ui-polish`, `touch-people`, `world-studio` and `district-polish`.
  The run stalled when the Mac's swap reached 47.9 of 49 GB with several
  sessions' browsers open, so it was stopped. `world-studio` runs in the hosted
  streets shard.
- `pnpm run verify`: `core: passed`.

## Gaps

- The "Nearby seats" box inside the console belongs to the seating controls and
  keeps its own style.
- Visual review only. This is not a human accessibility test.

## Next step

PR, then `pnpm run land`.
