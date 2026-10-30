# Character Studio follows the system theme

- **Request:** Val, 2026-10-29: "please make the character studio bg dark mode or whatever mode to match the system please"
- **Task id:** `studio-theme-20261029` (live register)
- **Owner:** `claude:river-oaks-22 (b90b7d)`
- **Branch / worktree:** `feat/studio-theme-20261029`, `/Users/buns/Documents/GitHub/BunsDev/river-oaks-studio-theme`
- **Baseline:** `origin/main` 39a5f302

## Objective

The Studio dialog and its live 3D preview follow the app's resolved theme. `theme.js` already
resolves Settings → Appearance (System by default, which follows the OS) onto
`<html data-theme>` and fires `appearancechange`. The Studio now uses it:

- `character-studio.css`: a dark token set and dark surfaces, text, controls, selects, sliders,
  swatches and focus rings under `:root[data-theme=dark]`. Light is unchanged.
- `character-studio-theme.js` (new): backdrop palettes per theme and lighting, and a watcher.
- `character-studio-preview.js`: the backdrop, pedestal and ground bounce repaint on theme or
  lighting change, live while the Studio is open; `.cs-preview[data-theme]` reports it.
- Portrait export (`character-hero.js`) keeps its fixed preset so captures stay comparable.

## Checks and results

- `node --test preview/tests/character-studio-theme.test.js`: 3/3 (live follow + unsubscribe,
  palette luminance, WCAG AA ≥ 4.5 for ink/muted/primary pairs on dark surfaces).
- Journey `character-studio-theme` (new) via `RIVER_OAKS_E2E_REPORT=studio-theme.json node
  preview/e2e/experience-runner.js character-studio-theme` from a detached snapshot behind the
  shared browser lock, Chromium, 2026-10-29: passed in 13.3 s. Screenshot luminance: dark
  backdrop 36, panel 31; after switching the system to light, backdrop 213, panel 243; dark
  with warm lighting, backdrop 34.
- `pnpm run verify` (core) on 39a5f302 + this diff: passed; receipt `.runtime/agent/core.json`.
  agent 289/289, preview 4684 run / 4648 pass / 0 fail, server 1365 run / 1080 pass / 0 fail
  (Redis and live-auth skips), desktop 132 / 127 pass, build, python, demo, secrets clean.

## Gaps

- WebKit/Safari and phones not run locally; human visual review remains.

## Next step

Draft PR open; observe hosted checks; Val's visual review in dark and light.
