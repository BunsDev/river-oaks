# Character Studio #441: realistic-variant slice

## Objective and ownership

The Studio offers only #517-validated realistic human bundles (Morgan, Imani) and
their material tiers, reversibly and accessibly. The rest of #441 is on main.
Task `character-studio-441-integration`; owner `claude:river-oaks-d0 (d13c5d)`;
worktree `../river-oaks-studio-realistic-441`. #545 is merged, so every increment
builds on main (no stacking on #545).

| Increment | Branch | Scope |
| --- | --- | --- |
| 1 | `feat/studio-realistic-441-guide-20261030` | Guide mapping from `character-fidelity-contract.js`; focused tests |
| 2 | `feat/studio-realistic-441-ui-20261030` (stacked on 1) | Studio UI: tier choice, locked fit/body/hair with reasons, tier in undo/redo and before/after, never saved; journey checks for keyboard, touch and reduced motion |
| 3 | `feat/studio-realistic-441-captures-20261030` (stacked on 2) | Studio close-up vs world captures (idle/walk/wave), reduced-motion/low-tier fallback, this ledger's evidence |

## Rules carried from the goal

- Realistic people and tiers derive only from the contract. A capability the
  contract does not declare (`clothing:'authored-bundle'`, `bodyEditing:false`,
  `hairEditing:false`) is a disabled control with an in-place reason.
- A tier is viewer-local (#443): it never enters the canonical definition, the
  saved draft or the worn look. Diagnostic `off` is never offered.
- Jevica/admin permissions are unchanged: realism grants no appearance.

## Increment 1: guide mapping

Files: `preview/src/character-studio-guide.js`,
`preview/tests/character-studio-guide.test.js`.

- `studioRealism(rig)` reads the contract. It returns the asset pin (it is offered
  only while the shipped pin matches the contract's), the target height, the
  tiers (`auto` plus the contract's `qualityTiers`) and the locked controls.
- `studioRealisticBundles(ownerId)` lists permitted looks whose rig the contract
  covers. `studioChoices` carries `realism` (null for stylized looks and recipes)
  and a realistic summary. `describeLook(definition, {tier})` names the tier only
  for a realistic look.

Checks: see Results.

## Increment 2: Studio UI

Files: `preview/src/character-studio-state.js`, `character-studio.js`,
`character-studio-preview.js`, `character-studio.css`,
`preview/tests/character-studio.test.js`, `preview/e2e/character-studio.js`,
`preview/e2e/character-studio-tiers.js`.

- The draft keeps a viewer-local tier beside each history step. `value`,
  `original`, favorites, Save draft and Wear never contain it; only a realistic
  look keeps a chosen tier (others preview at `auto`); `off` and unknown tiers are
  refused.
- A realistic person shows "Choose detail" in place of colors: Match graphics,
  Low, Standard, High. Fit, body and hair are `aria-disabled` buttons, each
  described by its visible reason; activating one repeats the reason.
- The preview pins the chosen tier on the avatar (no reload) and follows the
  graphics setting only for Match graphics. It reports the drawn tier and a
  missing-map fallback in place. Portraits use the previewed tier.

## Increment 3: captures and fallback

Files: new `preview/e2e/character-studio-realistic.js` (registered in
`shared-runner.js` under `required-characters`, so hosted CI runs it),
`preview/e2e/character-studio-layout.js`, `character-studio.css`,
`character-studio.js` (the locked list's heading became its accessible name so
the realistic step fits a 1440×900 window; the layout journey now checks it).

The journey wears Morgan (alice) and Imani (bob) at the Sharpest graphics
setting, then captures the Studio portrait close-up and full idle/walk/wave, and
the town close-up and full idle/walk (owner holding W, ≥0.5 m) and wave (shared
gesture, peer sees the arm raised) from the peer, framed from the front by yaw.
It checks the Studio, the owner's own avatar and the peer's copy agree on the
tier. On the owner's page reloaded with reduced motion and the skin roughness
map blocked: poses and turntable stay off; High detail falls back to Standard
and says so; Low detail says it draws without the map; before/after compares
worn Morgan at Match graphics with staged Low detail; the worn look is unchanged.

Captures (local, `output/playwright/character-studio-realistic-*.png`,
`character-studio-layout-realistic-desktop.png`) inspected by eye:
- Identity matches across views: Morgan's face, short black hair, brown irises,
  blue logo sweater, jeans and tan shoes; Imani's silver bob, skin tone, striped
  blouse, skirt and socks. Studio and town draw both at `high`.
- Walk and wave read the same in both views (stride; right hand across the chest).
- Differences are lighting, not identity: the town's sun leaves faces darker and
  shoes darker in shadow. Imani's town close-up shows a small dark spot at the
  nostril that the Studio close-up does not (likely shadow; recorded for Val).
- The missing-map fallback (Standard) is visually close to High at portrait
  distance, as the contract's tiers share geometry and textures.

## Results

Increment 1, head `7d390e54` (#800):
- Focused guide/contract/studio tests 14/14; `pnpm run verify` core passed
  (6272 pass, 0 fail, 291 skipped: Redis/browser skips core permits).
- Hosted: `preview experience (streets)` was cancelled at the 20-minute shard
  limit (20m20s); failed jobs rerun once. Every other check passed.

Increment 2, source = increment 1 + this diff:
- Focused tests: `node --test preview/tests/character-studio*.test.js
  preview/tests/character-fidelity*.test.js` 41/41.
- `pnpm run verify` core passed (6273 pass, 0 fail, 291 skipped).
- `pnpm run test:experience character-studio-layout character-studio-disabled
  character-studio-paused`: 3/3 passed. `character-studio` first failed twice on
  journey errors (Playwright will not click an `aria-disabled` control; the
  before/after assertion assumed the worn look was Morgan); both fixed in the
  journey, then `character-studio` passed 63/63 checks.
- `pnpm run test:shared required-characters` 3/3 (tiers journey now wears Morgan
  after a Studio Low detail preview: canonical look, no tier sent),
  `required` 13/13, `development-world` 4/4. These ran before the two
  `character-studio` journey-only fixes, which those runs do not load.

Increment 3, source = increment 2 + this diff:
- `pnpm run test:experience character-studio-layout character-studio
  character-studio-disabled character-studio-paused`: 4/4 passed
  (character-studio 63 checks; realistic desktop controls 719 px in a 718 px
  area, within the journey's 1 px tolerance).
- `RIVER_OAKS_SHARED_JOURNEY=character-studio-realistic pnpm run test:shared
  required-characters`: passed, 17 checks.
- Earlier attempts, kept as diagnosis: the second alice tab was refused (one
  town connection per account), the first camera framed backs, the first walk
  did not move (canvas not focused), and the realistic step overflowed 1440×900
  by 53 then 17 px. Each was fixed and the final run above is on the final source.

## Decisions for Val

- The Studio tier is a preview choice for this device only. It is not saved and
  does not change the town's tier (that stays the Graphics setting, #443).
  Reopening the Studio starts at Match graphics.
- Morgan's catalog description (from #545) says "authored casual suit"; the
  bundle is a sweater and jeans. Wording change left to the catalog owner.
- Visual approval of the close-up vs town captures (lighting differences and the
  spot at Imani's nostril in town) is yours; automation shows only that one
  definition is drawn at one tier in both views.

## Gaps

- Physical iPhone, iOS VoiceOver and human accessibility acceptance are separate
  from automated journeys. Val's P4/P5 novice waiver stays a waiver.
