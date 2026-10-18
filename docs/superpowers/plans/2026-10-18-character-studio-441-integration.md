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
