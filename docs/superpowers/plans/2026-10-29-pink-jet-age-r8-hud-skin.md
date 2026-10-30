# Pink Jet-Age R8 increment 2: classic HUD contrast fixes and opt-in pink HUD skin

- **Issue:** #746 (package R8 under epic #738)
- **Task id:** `pink-jet-age-r8-hud-skin` (live register)
- **Owner:** `claude:cody-pja-r8s-20261029`
- **Branch:** `feat/pink-jet-age-r8-hud-skin-20261029`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-pja-r8s`
- **Baseline head:** `39a5f302` (fetched `origin/main`, 2026-10-29, includes #757 and #753)
- **Inventory and method:** [2026-10-29-pink-jet-age-r8-inventory.md](2026-10-29-pink-jet-age-r8-inventory.md)

## Objective

Two commits on one branch:

- **A.** Fix the four opaque-surface contrast defects the inventory found in the default
  (classic) HUD with the smallest token/value change that reaches 4.5:1 for text, and
  turn their `KNOWN_GAPS` todos in `preview/tests/hud-token-contrast.test.js` into
  enforced cases.
- **B.** An opt-in Pink Jet-Age HUD skin: `data-finish` on `<html>` from
  `readFinishPreference()` and one token override block in a new stylesheet, every pair
  the contrast test checks also enforced under the skin.

## Files owned

- `preview/src/hud-glass.css`, `preview/src/visual-finish.css` (A)
- `preview/tests/hud-token-contrast.test.js` (A, B)
- B: see the commit B section below
- this ledger

## Checks

| Command | Why |
| --- | --- |
| `node --test preview/tests/hud-token-contrast.test.js` | The token regression |
| `pnpm run verify` | Core gate |
| `walking-controls-contrast` journey under the browser lock, classic and pink | Real computed colours in Chromium |

## Commit A: the four classic defects

Ratios are the test's (lowest of the stack composited over black and over white; opaque
fills have one value). Brackets: reduced transparency / software rendering.

| # | Pair | Change | Before | After |
| --- | --- | --- | --- | --- |
| 1 | `action-fill` dark (walking prompt, selected Play tab, office enter, chat send; also every table-game, voice and places control that paints `--hud-action` with `--hud-on-action`) | hud-glass.css dark `--hud-action` `#3f8f7f` → `#4a9a89`, `--hud-on-action` `#f4fbf8` → `#0b2326` | 3.67 | 4.89 |
| 2 | `action-keycap` (keycap inside the walking prompt) | new token `--hud-action-key`: light `rgb(255 255 255 / .06)` (was a literal `.16`), dark keeps `.16`; hud-glass.css keycap rule reads the token | 3.79 light / 2.86 dark | 4.65 light / 6.09 dark |
| 3 | `movement-legend` `.walking-help` | visual-finish.css raw `#c9c5d2` → `var(--hud-muted)` | light 1.01 [1.52]; dark 5.06 | light 4.72 [7.09]; dark 4.74 [8.98] |
| 4 | `gate-town-primary` (town gate button, light gradient stop) | hud-glass.css light `--liquid-accent` `#24695c` → `#1f5f53` (the light `--hud-focus` value) | 4.14 | 4.61 (dark unchanged 9.07) |

Why these values:

1. Darkening the dark fill under light text (`#327d70` gives 4.65) would have dropped
   `--hud-action` where it is *text* on dark glass (voice "joined", chat voice, Yacht
   headings, table-game mode label) from 4.54 to about 3.6 on the opaque sheet. A lighter
   fill with dark text, the pairing dark `--liquid-accent`/`--liquid-on-accent` already
   use, fixes the fill and raises those text uses to 5.23 opaque. The visible change: the
   dark-theme primary buttons now carry dark labels on a slightly lighter teal.
2. A white keycap tint lowers the contrast of light text on a dark fill. Light keeps the
   white tint at .06 (the border still outlines the key); dark text on the new dark fill
   gains from the .16 tint, so dark keeps it.
3. The legend was written for the old dark console. `--hud-muted` is the console's quiet
   text token in both themes; dark goes from 5.06 to 4.74, still above 4.5.
4. The smallest darkening of the liquid accent that clears 4.5 at the gradient's
   lighter stop; it also darkens the gate focus ring and orbit glyph (more contrast).

Test: 275 tests, 260 pass, 15 todo (the eleven bound gaps, unchanged), 0 fail. The 20
todos for the four defects are now ordinary enforced tests.

## Results

(filled in at each checkpoint)

## Gaps and unverified scope

- The eleven "bound" gaps stay todo for classic (unchanged in this slice).
- `.walking-help kbd` keeps `opacity: .8` (visual-finish.css:240); not measured.
- Browser automation is not human accessibility acceptance.
