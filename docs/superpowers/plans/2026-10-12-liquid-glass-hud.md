# Liquid-glass town gate, district map and Map button — 2026-10-12

**Objective:** Val asked for a more translucent connection modal in the current
liquid-glass style, and more inventive shapes for the district map and its
Map button.

**Branch / worktree:** `feat/liquid-glass-hud` in `../river-oaks-liquid-glass-20261012`,
from `88a6cc6`. `access-gate.css` and `access-theme.css` belong to the
`studio-prompt-polish` claim, so the gate is restyled only through
`.multiplayer-gate` in `multiplayer.css`.

## Changes

- **Liquid-glass tokens** (`hud-glass.css`, `--liquid-*`): tint, a saturated
  blur, a specular rim, caustic colours, a recessed well, ink, muted ink and
  accent, for light and dark. Reduced transparency and missing
  `backdrop-filter` fall back to a near-opaque tint, as the HUD glass already
  does.
- **Town gate** (`multiplayer.css`):
  - The card is liquid glass: a gradient tint over a 28 px saturated blur, a
    conic specular rim, and slowly drifting caustics (still under reduced
    motion).
  - The veil moved to `.multiplayer-gate::before`. A backdrop filter on the
    gate itself made it the card's backdrop root, so the card never blurred
    the district.
  - The status sits in a recessed well. While no action is offered (pure CSS
    `:has()`), a bead of light runs along its lower edge.
  - The gate now has dark-theme colours; before, it was the same cream card in
    both themes.
- **Map button** (`sidebar.js`, `game-hud.css`):
  - A glass capsule with a lens holding a folded map, a walked route and a pink
    pin, inside a teal, mint, pink and gold ring.
  - The map opens a little and the pin lifts on hover, and the ring turns while
    the district map is open.
- **District map** (`world-map.js`, `world-map.css`):
  - Paper by day, night streets in the dark theme, all as tokens on the
    surface.
  - Survey-dot grid, buildings as lifted tiles (rounded footprint, cast side,
    soft shadow), streets with a kerb casing and a dashed centre line, and
    footways as footstep dots.
  - Places have a silhouette and colour per category: sparkle for arrival,
    square for shopping, plate for dining, gem for jewelry, flower for beauty,
    house for homes. Each is centred on the place, so marker clicks still
    select it.
  - You are a navigation arrow with a view cone and a breathing halo. It turns
    with the walker's yaw and takes the short way round.
  - The chosen place gets a turning dashed ring and a glass label. The north
    chip is a compass needle, the scale bar is segmented, and the key draws the
    symbols this map actually shows.
  - Decorative layers have their own classes, so the counts the journeys rely
    on are unchanged: one `.world-map-road` per road, one
    `.world-map-building` per building, one `.world-map-place` with a title
    per place, and one visible `.world-map-self`.

## Verification

- `node --test preview/tests/world-map.test.js`: 8/8. Three new tests cover:
  - every category's silhouette is distinct, centred within 1.5 map units, and
    marker sized;
  - the arrow points along `(-sin yaw, -cos yaw)` and unwraps across ±180°;
  - the key lists only the symbols present.
- Contrast was sampled from screenshots of the gate over the darkest part of
  the arrival scene. In light mode the card first measured 2.6:1 for the muted
  line; after the fix:

  | Text | Light | Dark |
  |---|---|---|
  | Title | 6.6:1 | 12.0:1 |
  | Muted line | 4.7:1 | 11.1:1 |
  | Status | 8.7:1 | 12.8:1 |
  | Kicker | 4.9:1 (`#7d2449`; 3.5:1 before) | 7.6:1 |

- Visual review (Metal ANGLE, browser fixture, light and dark): gate, Map
  button, open district map, atlas, and a selected place.
- `pnpm test`: 2667 pass, 1 skip. `pnpm run build`: ok. `pnpm run verify`: core passed.
- Experience journeys (Metal): `destination-minimap`, `places`, `places-guide`,
  `rail-navigation`, `game-hud`, `connection-required`, `hud-and-quality`
  and `ui-polish` passed. Shared `world-map` (development-world) passed.
  After the narrow-screen fix, `game-hud`, `destination-minimap` and
  `rail-navigation` passed again.
- Phone width (390 px): an open panel used to stretch the Map button across the
  top bar. `immersive.css` sets `right: 12px` for a narrow open panel and
  `game-hud.css` sets `left: 12px`; this predates the change. The button now
  sets `right: auto`. Probed: 92 × 44 at (12, 20) both closed and open.

## Gaps

- The glass is judged in Chromium (game and Electron). Safari's
  `backdrop-filter` is prefixed and covered, but not reviewed here.

## Next step

PR, a merge turn with river-oaks-c2, the guard, then fast-forward the primary
for Val's dev server.
