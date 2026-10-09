# Translucent in-game panels

## Objective and authority

The user asked for the side panels to be reviewed against modern game HUDs and made
modern, minimal and slightly translucent, end to end. This covers the Explore rail
(`#control-panel` and `#panel-toggle`), the Play dock (`.visit-tools`), the walking
console (`#walking-hud .walking-console`) and Commands. Branch
`feat/translucent-panels` from `origin/main` `1018d0c`, worktree
`.worktrees/river-oaks/panel-redesign`.

## Review: what game HUDs do and what we had

Current game menus and HUDs share a few patterns:
- One persistent, translucent cluster per surface, over a restrained blur that
  keeps it legible while the world moves behind it.
- Flat tiles inside the sheet, not stacked cards.
- Keycap glyphs on prompts (the key, then the action).
- A visible focus state.
- Safe margins, a reduced-transparency fallback, and larger targets on touch.

The rail and dock had none of that. Each was an opaque teal or ivory card holding
more bordered cards, with legacy controls that each carried their own backdrop blur.
Prompts read "Step inside Hermès · F". Shortcut hints rendered in Courier, because
the mono stack started with an unavailable face. A player's name in the roster
wrapped one letter per line once action buttons squeezed it.

## Design

- `preview/src/hud-glass.css`, imported last in `main.js`.
- Smoked glass:
  - light: ivory `.80` with backdrop `blur(24px) saturate(1.3) brightness(1.16)`
  - dark: graphite `.76` with backdrop `brightness(.78)`

  Opacity and backdrop tone keep muted text at 4.5:1 or better over bright and dark
  scenes.
- Exactly one sheet blurs per surface. Controls inside a sheet have their backdrop
  filter switched off, because a nested blur frosts a second, lighter patch.
- Borderless tiles; segmented tab tracks for People/Places/Settings and the Play
  activities, with the selected tab raised and its section-tone dot glowing.
- Keycaps (Menlo-backed mono stack) on the trigger, Play, Commands and the walking
  actions. `walking-ui.js` renders the walking keycaps as `<kbd>` after the label:
  - CSS `order` shows the key first.
  - The accessible name still begins with the action.
  - `aria-keyshortcuts` announces the key.
- The primary walking prompt is one teal action. The idle console stays at about
  93 px with a mouse.
- Town chat gets a compact composer and a Send pill. The Photo mode tile is a
  title row.
- One focus ring on the glass: dark teal in light, mint in dark.
- Fallbacks:
  - `prefers-reduced-transparency`, or no backdrop-filter support: near-opaque glass.
  - `pointer: coarse`: 44 px targets and keyboard keycaps hidden.
  - Narrow screens: the trigger keycaps are hidden.
- The roster name keeps a readable width, and actions wrap below it
  (`multiplayer.css`).

## Checks

- [x] Before and after screenshots, desktop dark/light with rail and dock open, at a
      shop door (keycap prompt), and mobile rail, dock and walking HUD (scratchpad,
      not committed).
- [x] Computed-style probe: tab, pill and Play fonts apply; the focus ring is
      2 px `rgb(31 95 83)` light and `rgb(168 236 214)` dark; nested controls report
      `backdrop-filter: none`.
- [x] First run (before the final CSS polish): `npm test` 2504 pass, 0 fail;
      `npm run build`; experience journeys rail-navigation, hud-and-quality,
      contextual-first-visit, photo-mode, ui-polish, sidebar, experience, street-level,
      ui-improvements; shared sit-and-water (required), shared-seating, multiplayer-dev,
      groups (development), world-publish (development-publish). All passed.
- [x] Rerun on the final CSS: `npm test` 2504 pass, 0 fail; `npm run build`; the nine
      experience journeys above; shared sit-and-water, shared-seating and
      multiplayer-dev; `npm run verify -- web` passed (receipt
      `.runtime/agent/web.json`). All passed.

## Limits

Visual review is mine, from headless Chromium on Apple Metal. It isn't a human
accessibility audit and wasn't checked in Safari, Firefox, Windows or the packaged
desktop app. Reduced transparency was checked by reading the rules, not by an OS
toggle.
