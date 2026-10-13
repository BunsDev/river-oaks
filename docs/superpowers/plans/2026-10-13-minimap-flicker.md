# Stop the flicker, and take the minimap out of its scrolling sheet — 2026-10-13

**Objective:** Val asked to "make sure the website stops flickering and optimize
the mini map to not be in a scrollable container". Asked where the flicker shows,
Val chose two places: the page load or reload, and the map and HUD panels.

**Branch / worktree:** `fix/minimap-flicker-20261013` in
`../river-oaks-minimap-flicker-20261013`, from `9f77d13`.

## What was found

The page was recorded frame by frame with the CDP screencast in three browsers:
the headless shell, full Chromium headless, and headed Google Chrome with Metal
ANGLE. The scripts are in the session scratchpad.

- **Panels.** The district map sheet (`#explore-section.hud-space`) was itself the
  scroll container (`overflow: auto`) and a `backdrop-filter` root. Its content was
  560 px tall in a 500 px box at 1440×900, because the desktop cap was
  `100dvh - 400px`. In headed Chrome the sheet drew a classic scrollbar that shrank
  the map from 280 to 269 px.
  - Frame 822 of one recording shows that scrollbar missing for a single frame
    while the map's "you are here" marker moved. In the frames either side it is
    present. This was the only panel flicker captured.
  - The People sheet (`#community-section`) had the same structure. The map's
    compass and selection chips added a second blur layer inside the sheet's own
    blur.
  - Chrome settled to one stable layout at every height from 640 to 1100 px (a
    1 px sweep), so there was no scrollbar-induced layout oscillation.
- **Load.** In light mode a page load went white (blank document), then dark
  `#151517` (the sign-in gate, which shows "Checking your access…" for every
  visitor), then light (the game) within about 1.5 s. A returning, signed-in
  player saw this on every load, including each reload of the dev server.
- **Ruled out:**
  - Software-rendering mode toggling: `markRenderingMode` sets the mode once.
  - Theme flips.
  - Camera snaps. Two one-frame whole-scene jumps after turning are vertical
    camera hops of about 16 px near the ground, likely at a curb. They are out of
    scope and noted for movement owners.

## Change

- **`preview/src/sidebar.js`:** each HUD sheet's content moves into a
  `.hud-space-body`. The sheet is now a frame and never scrolls itself.
- **`preview/src/game-hud.css`:**
  - The sheet is a `display:flex` column with `overflow: clip`.
  - The People body scrolls on its own, the same structure the "Play & rides" dock
    (`.visit-tools-content`) already uses.
  - In the map sheet nothing scrolls on windows at least 560 px tall:
    - The map is as wide as the sheet when there is room (`flex-basis: 100cqi`)
      and shrinks to fit a short window, never below 150 px (`container-type: size`
      plus `width: min(100%, 100cqh)`).
    - An opened Storefront access scrolls inside itself, and the map keeps its
      size while it is open (flex-shrink 100, `min-height: 160px`).
    - Shorter windows fall back to a scrolling body.
  - The desktop cap follows the town chat below the sheet instead of a fixed
    `100dvh - 400px`. The reserve is 268 px when the chat is empty,
    `229px + min(180px, 24dvh)` with history, and 165 px when it is folded. The
    sheet never gets shorter than 420 px, and an open Storefront access may cover
    the chat. The sheet layer (z 6) sits above the chat (z 5).
- **`preview/src/world-map.css`:**
  - The compass and selection chips no longer use `backdrop-filter`. The map
    under them is opaque, so the chip tint goes to .9 (light) and .88 (dark).
  - The scale label no longer wraps on a small map.
- **`preview/public/assets/boot/first-paint.js`** (new, a classic script; the CSP
  allows no inline scripts):
  - It applies the visitor's theme before the first paint.
  - It marks a browser that entered last time (`river-oaks-entered` in
    localStorage) as `data-returning`.
  - It lives under `/assets/` because the `typesafe.place/play` proxy already
    forwards that path.
- **`preview/index.html`:**
  - The first paint uses the gate colour instead of white.
  - A returning browser gets a quiet splash in its own theme: the sign-in art and
    card are hidden, and the access status stays readable.
- **`preview/src/access-entry.js`:**
  - Entering remembers the visit.
  - The splash ends when the district opens or whenever the gate is needed.
  - Signing out, being signed out or being waitlisted forgets the visit.
  - A failed check shows the retry gate and keeps the visit.

## Checks

| Check | Result |
|---|---|
| Fit sweep with the storefront closed and open, 1440×1000/900/800/700, 1280×650, 1024×600, 844×390, 390×844 | No clipping. The map is 280 px at 1000, 225 px at 900 with chat history, and 150–154 px at its floor. An open storefront scrolls inside itself; the map stays 278 px from 800 up. |
| `destination-minimap` journey with new checks: sheets are frames; at five sizes the map has no scrolling ancestor and the whole card fits, square, at 150 px or more | Pass |
| Same journey with `main`'s three source files (mutation) | Fails: "HUD sheets are frames, never scroll containers" |
| `access-gate` shared journey (required) with new checks: first paint is the gate colour; a returning visitor gets the themed splash; a signed-out visitor gets the gate and the visit is forgotten; entry remembers it | Pass |
| Same journey with `main`'s `index.html` and `access-entry.js` and no boot script (mutation) | Fails: "The first paint is the sign-in gate colour, not a white page" |
| Load recording, light: reload of an entered browser | Previous frame, then light splash (232), then light game (201). No dark or white frame. On `main` it was white, then dark, then light. |
| Load recording, dark | No bright frame on the first visit or the reload |
| `pnpm run verify` (core) | Passed. Preview: 2674 pass, 1 skip. Server: 379 pass, 125 Redis-only skips. The other suites (76, 49) pass. No secrets found. |
| Experience journeys: the hosted places shard (`contextual-first-visit store-intro photo-mode rail-navigation places-guide destination-minimap spatial-circulation`) plus `game-hud sidebar hardware-acceleration ui-polish hud-and-quality` | All pass except `spatial-circulation`, which timed out waiting for `.store-intro[open]`. That is the known flake #296 fixes; run alone, it passes. |
| Build | `dist/preview/play/index.html` loads `/assets/boot/first-paint.js` before the module bundle, and the file ships at that path. |

## Gaps

- The panel flicker was captured once (one frame in about 424 map-open frames in
  headed Chrome). It did not recur in a 45 s walk on `main`, so frame counts cannot
  prove it gone. The regression checks hold the structure that caused it instead:
  no sheet is its own scroll container, and the map has no scrolling ancestor.
- CI renders in software mode, which removes every backdrop filter. The checks
  therefore test layout structure, not blur.
- A first-time visitor still sees the sign-in gate before the game. That is the
  gate doing its job.
- The camera hop at curbs is not addressed.
