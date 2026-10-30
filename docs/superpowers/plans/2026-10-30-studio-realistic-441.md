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
| 2 | (stacked on 1) | Studio UI: tier choice, locked fit/body/hair with reasons, tier in undo/redo and before/after, never saved; journey checks for keyboard, touch and reduced motion |
| 3 | (stacked on 2) | Studio close-up vs world captures (idle/walk/wave), reduced-motion/low-tier fallback, this ledger's evidence |

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

## Results

(Recorded per increment with the exact head.)

## Decisions for Val

(None yet.)

## Gaps

- Physical iPhone, iOS VoiceOver and human accessibility acceptance are separate
  from automated journeys. Val's P4/P5 novice waiver stays a waiver.
