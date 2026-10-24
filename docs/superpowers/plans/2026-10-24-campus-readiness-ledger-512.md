# Campus readiness #512: publish the remaining ledger (#510 close-out)

Task `campus-readiness-512`, owner `claude:river-oaks-bc (11f4b5)`, branch
`docs/campus-readiness-ledger-512-20261024`, worktree `../river-oaks-readiness-ledger-512`,
from `origin/main` `f33c914b`.

## Objective

Publish the remaining readiness work for #510 and its journeys from
`fix/campus-readiness-512-20261021` (`a35214f3`, staged, no PR), without duplicating
PR #545's character scope.

## Findings (2026-10-24)

- At `f33c914b`, `main` holds the staged source byte for byte:
  `preview/e2e/garden-campus-readiness.js`, `preview/e2e/garden-campus-office.js` and
  `preview/e2e/garden-campus-suite.js` match. `main`'s
  `preview/tests/garden-campus-readiness.test.js` has 19 more lines (the #605 socket
  correction). `main`'s `docs/testing.md` is a superset: the staged copy differs only in
  older line wrapping and a link to the 2026-10-21 ledger. #605 merged as `d9d8fff3`.
- The hosted `preview experience (campus)` and `(campus-traversal)` shards passed on
  Linux at `main` `1cb9a475` (Verify run 40121907129, jobs 120955111969 and 120955112051).
- The branch's only unique content is `2026-10-21-campus-readiness-512.md` and
  `data/reports/campus-readiness-*`, generated evidence of `a35214f3`.
- Val chose a ledger-only PR: publish the 2026-10-21 ledger with a status note, leave out
  the generated reports, then archive the stale checkout.

## Files owned

- `docs/superpowers/plans/2026-10-21-campus-readiness-512.md` (copied unchanged from the
  staged index, plus a dated status section at the top)
- this ledger

## Split with the #510 owner

`garden-campus-510-20261024` (claude:river-oaks-a8) owns the rest of #510: the
hall/café/Commons/Atelier control audit, the lease-outcome dialog tests (unavailable,
requested, offered, active, guest, no charge in every state, every end and closed reason),
the human checklist, and verify full at that head, in draft
[PR #647](https://github.com/BunsDev/river-oaks/pull/647). Agreed by message on 2026-10-24. The
human checklist (VoiceOver, keyboard, phone touch, nested Escape, held keys; Computer
deferred to #486/#487) lives in
[2026-10-24-garden-campus-510.md](2026-10-24-garden-campus-510.md) so the two copies
cannot diverge. This branch touches none of those files.

## Commands and results

- `git diff --check`: clean.
- `pnpm run agent:doctor`: passed.
- `pnpm run verify` (Python 3.12 first on PATH), attempt 1 at load 23: failed, 236/237
  tooling, `land-pr.test.js:122` "queued lander wakes on release" timed out. Log and
  receipt retained under `.runtime/readiness-ledger/core-attempt1-failed.*`. In
  isolation the same test went 0/1, then 1/1, then 1/1: a load-timing flake in tooling.
  This branch changes only Markdown.
- `pnpm run verify` attempt 2 at load < 20: see the PR evidence comment.
- `verify full` with isolated Redis: not run for this docs-only increment. #510's verify
  full at the integrated head belongs to the #510 owner above.

## Gaps

- Stale checkout retirement: `project:cancel --branch fix/campus-readiness-512-20261021
  --expected-head a35214f38795ced1ee6867aad5c3c2723a7ceaae --stale-hours 72` dry-run is
  blocked by `touched-within-cutoff`. The touch is this session's register claim
  (2026-10-24T19:18:24Z), not new work. The cutoff was not shortened to get past it.

## Decisions for Val

1. Retire `fix/campus-readiness-512-20261021`: run the cancel above once the claim falls
   outside the cutoff, or name a shorter stated duration. Its archive keeps the staged
   index and the `data/reports` evidence.
2. Merging this PR is not authorized for this session.

## Next action

Collect core attempt 2, publish the draft PR, and post one evidence comment.
