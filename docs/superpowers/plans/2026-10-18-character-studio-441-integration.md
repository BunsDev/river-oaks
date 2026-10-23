# Character Studio #441: remaining acceptance and human integration

## Objective and ownership

Complete #441's accessible creation journey and validated realistic-human
integration. Task `character-studio-441-integration`; owner
`codex-441-goal-20261018`; branch `docs/character-studio-441-integration-20261018`.
Own this ledger only until a concrete implementation slice is supported by the
upstream contract. Preserve the novice-trial owner and PR #504's owned files.

## Current evidence (2026-10-18)

Inspected main `2703571b4d06019642d5aa91f5167b5473da85dd`, the live register,
worktrees, #441 body/comments, #517 comments, open PRs and #504's description.
#484 is merged as `7ed86fc5858ab8d4140b459a008d541d7c455d12`.
Historical evidence is not a fresh runtime result on this main revision.

| Requirement | Evidence and disposition |
| --- | --- |
| Novice creation without uploads/prompts | #441 records genuine P1–P3, first Wear 3/4/3 minutes, satisfaction 4/5/4; all reported successful recovery and uncoached creation. Val explicitly requested skipping P4/P5 in this goal session. Five-person gate is waived, not passed. Do not recruit, simulate results or request these again. |
| Reversible keyboard/touch/reduced-motion editing | Val's historical session at a0949092 passed keyboard, macOS VoiceOver, reduced motion and iPhone simulator touch. Retest changed behavior; physical iPhone and iOS VoiceOver remain unverified. |
| Supported poses and garment compatibility | Historical #441 pose matrix and #484 tailoring evidence; not evidence for new realistic assets. |
| Picker, flight and navigation regressions | Historical merged CI; fresh affected checks required for source changes. Preserve current human-only migration semantics. |
| Realistic/stylized switching and supported controls | Incomplete: current definitions accept authored v1 and dress/hair v2; parameters are empty and assets are pinned to jevica, man-casual and man-tailored. No delivered realistic fixture contract found. |
| Close-up/world consistency and quality-tier fallback | Incomplete pending #517 contract and #442 validated content; #504 explicitly says existing art is stylized. |

## Dependency handoff required before realistic controls

#517 has no comment handoff, matching task-register entry or matching open PR in
this inspection. This is absence of delivered evidence, not proof no other work
exists. Recheck before implementation.

Required upstream inputs:
- Legally sourced runtime fixture with immutable asset pins and provenance.
- Explicit supported rig, morph, material, wardrobe and animation capabilities;
  unsupported combinations must be rejected by shared validation.
- Stable human identity mapping between stylized/realistic representations and
  quality tiers, preserving owner and Jev/Jevica permissions.
- Preview/world loader contract and recovery behavior for missing/failed assets.
- Measured tier budgets and supported target devices, plus close-up/pose evidence.

Do not add a speculative schema, synthetic realism fixture, unsupported selector
or engine rewrite to bypass this dependency. #442/#443/#444 remain separate lanes.
PR #504 at c8af06bd remains a draft; do not duplicate or implicitly integrate its
Safari, contact-shadow, scheduling or fitting changes.

## Verification and next action

Read-only project-status completed; it reports unrelated retirement, ownership and
missing-worktree gaps. No cleanup authorized or performed. No application source
changed and no fresh browser, core, full, hardware or production claim yet.

Next: inspect dependency issue updates and current contract tests, run focused
contract/guide checks, and publish the reconciled #441 disposition. Continue with
a concrete integration slice when the validated #517/#442 handoff is available.

### Fresh checks and upstream confirmation

- #442's 18:46Z update explicitly states that #517's realistic-variant contract
  is not started and has no owner. It also confirms no LOD tiers exist. PR #529
  measures visibility culling on host GPU; it is not a realistic asset handoff.
- Initial focused test run failed to import Three.js in the new checkout (three
  guide tests passed). Installed locked dependencies with
  `pnpm install --frozen-lockfile`, then ran `pnpm run agent:doctor`.
- Rerun: `node --test preview/tests/character-definition.test.js
  preview/tests/character-studio-guide.test.js`: 9 passed, 0 failed/skipped.
  This proves current contract and guide behavior only, not realism integration.
- `agent:doctor` exited 2: Python environment absent (`uv sync --locked` needed).
  JavaScript prerequisites passed. No Python or full/core gate claimed.
- `git diff --check` passed. This is a documentation-only reconciliation.

### Continuation: independent acceptance checks

- Previous goal turn made progress: recorded Val's P4/P5 waiver and delivered
  draft PR #531 at signed head `34c68989779a33f2d0aaa819aa8594c2f3650aed`.
- Fresh state/guide/definition suite: 14 passed, 0 failed/skipped, including
  cancel/history, incompatible edits, privilege rejection and scoped favorites.
  Command: `node --test preview/tests/character-studio.test.js
  preview/tests/character-studio-guide.test.js preview/tests/character-definition.test.js`.
- Four Studio journeys started through the normal browser queue; unified process
  handle 1178, log `/tmp/river-oaks-441-journeys.log`. They are not yet passed.
  Queue holder PID 22377 was confirmed live with `ps`; do not bypass its lock.
- Hosted Verify run 39156376502 and PR run 39156373248 are in progress on the
  exact PR head. Dependency review passed; no aggregate success claim yet.
- #517 still has no comment handoff. #440 is closed; #443/#444 remain open.
  Their older acceptance comments are historical, not current closure evidence.

Next: poll existing journey handle and hosted runs, inspect generated desktop,
phone and pose captures, then record results. Do not restart on an observation
 timeout or treat the queued run as a terminal failure.

### Terminal verification, 19:08Z

- Existing local journey handle 1178 exited 0. All four journeys passed:
  `character-studio`, `character-studio-layout`, `character-studio-disabled`,
  `character-studio-paused`. Exact application revision: main 2703571b plus
  documentation-only 34c68989. Receipt retained in
  `.runtime/441-acceptance/experience-34c68989.json`; console log in
  `/tmp/river-oaks-441-journeys.log`.
- Inspected generated desktop, phone, walk and wave captures under
  `output/playwright/character-studio-*.png`. Selected Sable colors render and
  shown controls fit their viewports. These selected captures do not prove all
  looks/poses, physical-phone performance or realistic-human fidelity.
- Hosted Verify run 39156376502 completed successfully on 34c68989.
  No merge or deployment. Restored tracked generated experience report after
  preserving the local receipt.
- Remaining integration blocker: #517 validated realistic-human fixture contract
  and #442 compatible content/tier evidence. No supported realistic controls can
  be added until that handoff exists. Val waived P4/P5; physical device coverage
  remains explicitly unverified. No source change was needed for these checks.
