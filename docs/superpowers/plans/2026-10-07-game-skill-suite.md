# Game-development skill suite

## Objective and authorization

Implement the supplied 30-topic coverage brief without creating 30 skills. The
request authorizes repository skill/document/test additions; it does not authorize
map edits, imports, paid services, destructive rebuilds, publishing or commits.
Baseline: clean `main`, `5b26f3a`. Other worktrees own native lighting/tree and
reference-blockout implementation; this task owns only the skill suite.

## Owned files

- `.agents/skills/*`: four priority skills, orchestrator, shared-contract links.
- `docs/level-design-skills.md`, `docs/level-design/skill-suite-*`: index,
  coverage audit, contracts, fixtures and validation evidence.
- `scripts/compare_skill_views.mjs`, `scripts/tests/skill-views.test.js`:
  deterministic matched-view eligibility helper and behavioral tests.

## Plan and evidence

- [x] Read supplied brief, all nine existing skills, root instructions, runtime
  task map, agent workflow, Unreal setup/config, multiplayer ownership and tests.
- [x] Inventory prerequisites: `npm run --silent agent:doctor` passed; catalog
  inspected using `npm run --silent agent:list`.
- [x] Write 30-topic coverage matrix and five additions; merge overlapping topics.
- [x] Add fixtures, run successful and failure-case walkthroughs for every skill.
- [x] Run helper tests, skill metadata/link checks and `npm run verify`.
- [x] Review actual diff; record limitations and rollback; audit full brief.

## Results, gaps and next step

Complete locally: five new skills, nine extended skills, fourteen indexed entries,
30-topic audit, shared contract, 28 tabletop outcomes and seven helper tests.
`npm run verify` passed; final `npm run verify -- tooling` passed 17 tests.
Core counts: preview 653, server 267 pass/101 Redis skips, desktop 9, Python 139.
Skill validator passed 14 folders; link/anchor checks passed 89 local links;
`git diff --check` passed. See `docs/level-design/skill-suite-validation.md` for
exact commands, receipts, author walkthrough outputs and the completion audit.

Native/editor, human visual judgment, live voice, target GPU performance, hosted
auth and native multiplayer are not proven by skill validation. Full/Redis/browser
and hosted CI were not run. No runtime scene changes were made. Work remains
uncommitted on `main` in the original worktree; no commit/push/PR was requested.
Next delivery step: user-directed commit/PR. Preserve this worktree while the edits
are undelivered; rollback instructions are in `skill-suite-audit.md`.
