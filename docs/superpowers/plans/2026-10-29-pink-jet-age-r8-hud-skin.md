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
- B: `preview/src/pink-jet-age-hud.css` (new), `preview/src/main.js`,
  `preview/e2e/walking-controls-contrast.js`
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

Commit A: `c9b9b0eb`.

## Commit B: the opt-in Pink Jet-Age HUD skin

Handover: on 2026-10-30 `claude:river-oaks-01 (483949)` took the task over from
`cody-pja-r8s` (lease expired, no live process); commit A was the uncommitted diff the
previous owner left, verified unchanged (275 tests, 260 pass, 15 todo).

- `preview/src/main.js` sets `<html data-finish>` from the same `readFinishPreference()`
  the world finish reads (`?finish=pink-jet-age` or `localStorage['river-oaks-finish']`),
  and imports `pink-jet-age-hud.css` last, after `play-rail-menu.css`.
- `preview/src/pink-jet-age-hud.css`: two blocks, `:root[data-finish=pink-jet-age][data-theme=light|dark]`.
  Both name the theme, so neither outranks the other in the cascade. Accent roles only:

| Token | Light | Dark |
| --- | --- | --- |
| `--hud-action` / `--hud-on-action` | deep rose `#9b2f55` / `#fff8f2` | TypeSafe pink `#f486a1` / ink `#24242a` |
| `--hud-focus` | `#9b2f55` | `#f486a1` |
| `--liquid-accent` / `--liquid-on-accent` | `#8e2a4e` / ivory `#f7f1e8` | `#f486a1` / ink |
| `--accent` / `--accent-soft` / `--on-accent` | `#9b2f55` / `#fbe3ea` / `#fff8f2` | `#fbd0dc` / `#4a2a36` / ink |
| `--liquid-caustic` | pink at .5 | pink at .3 |

  Glass tints, ink, muted text and every reduced-transparency/software variant are untouched.
  Light cannot use `#f486a1` as a fill: `--hud-action` is also the light settings-link
  *text* colour, and pink on the ivory panel is about 2:1. The town-gate button blends 18%
  white into its lighter stop, so its accent is one step deeper (4.76:1 there).
- `preview/tests/hud-token-contrast.test.js`: every scenario repeats under the skin
  (`pink-jet-age:<scenario>`), the cascade includes the new sheet, and two guards: an
  unknown finish resolves exactly the classic tokens; skin declarations carry
  `data-finish=pink-jet-age` plus `data-theme`, no at-rule, and no glass/ink/muted token.
- `preview/e2e/walking-controls-contrast.js` measures the movement console under
  classic and the skin (labels `pink-jet-age-light|dark`, screenshots likewise).

## Results

- `node --test preview/tests/hud-token-contrast.test.js`: 541 tests, 511 pass, 30 todo,
  0 fail. The 30 todos are the 15 classic backdrop-bound gaps and the same 15 under the
  skin: the skin introduces no new shortfall (dark `--accent` was raised from `#f6a3b8`
  to `#fbd0dc` after `chat-accent` measured below 4.5 under the white bound).
- `pnpm run verify`: see the PR.
- Browser journey: not yet run (host load above 40 on 2026-10-30 ~02:30 CDT; see PR).

## Gaps and unverified scope

- The eleven "bound" gaps stay todo for classic (unchanged in this slice).
- `.walking-help kbd` keeps `opacity: .8` (visual-finish.css:240); not measured.
- Browser automation is not human accessibility acceptance.
- Raw colours outside the tokens stay classic under the skin: `retro-finish.css`
  `#walking-enter`/`#walking-interact`/`#walking-meet-nearby`/`#walking-talk`/
  `#player-carriage`, the town-gate kicker and the places error red. A later slice can
  move them onto tokens.
- The sign-in gate (`access-theme.css`) is out of scope: it has its own approved pink.
