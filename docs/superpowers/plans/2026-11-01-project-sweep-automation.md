# Scheduled project sweep for branches and worktrees

## Objective

Keep the multi-agent checkout set under control between sessions without adding new
deletion authority. One command (`project:sweep`) repeats the lifecycle evidence pass
(inventory, local and remote), retires only what `project:prune` already accepts
(with `--apply`), and writes an action queue naming who must act on every other
branch, worktree and remote branch. An opt-in macOS launch agent
(`project:sweep-agent`) runs it on a schedule from staged `origin/main` tooling.

- Task: `project-sweep-automation-20261101` (live register)
- Owner: `cody (coven cave session 2026-11-01)`
- Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-project-sweep`
- Branch: `ops/project-sweep-automation-20261101`
- Base: `df8d65aa` (origin/main, 2026-11-01)

## Files owned

- `scripts/project-sweep.mjs` (new): `planSweep`, `classifyRow`, `classifyRemote`,
  `applyRetirements`, `formatSweep`, `rotateReceipts`, CLI.
- `scripts/project-sweep-agent.mjs` (new): `renderRunner`, `renderPlist`,
  `parseAgentArgs`, `print|install|uninstall|status` CLI.
- `scripts/tests/project-sweep.test.js` (new).
- `package.json`: `project:sweep`, `project:sweep-agent` (with pnpm guards).
- `docs/project-management/workflow.md`: new "Scheduled sweep" section; the three
  "no scheduler" statements now point at it.
- `AGENTS.md`: one sentence in the retirement paragraph.
- this ledger.

## Design decisions

- No new authority. `--apply` calls the existing `retire()` per candidate, which
  re-plans from live evidence (owner release fresh within 2 h, exact merged head,
  clean, no activity) and archives plus restore-tests before removal. A refusal is
  recorded and the sweep continues.
- Stale claims (lease expired > 24 h, or no lease and not updated for 24 h) are
  reported, never released: an expired lease is not a release.
- Cancellation, cache removal and remote deletion remain Val's or the owner's.
- The agent stages `origin/main:scripts` outside every worktree, so it always runs
  current tooling and its process CWD never counts as activity in a checkout.
- Interval capped at 110 min so an owner's 2 h release window always meets a run.

## Checks

- `node --test scripts/tests/project-sweep.test.js scripts/tests/project-inventory.test.js scripts/tests/project-prune.test.js scripts/tests/project-prune-cancel.test.js scripts/tests/project-archives.test.js`
- Live report-only run: `node scripts/project-sweep.mjs --repo <primary>`
- `node scripts/project-sweep-agent.mjs print` (render only; not installed)
- `pnpm run verify` (core)

## Results

`pnpm run verify` (core) passed at base `df8d65aa` plus this uncommitted diff
(receipt `.runtime/agent/core.json`): agent 302/302; preview 5078 pass, 0 fail,
1 skipped of 5109; server 1110 pass, 0 fail, 285 skipped (Redis-gated); desktop
127 pass, 5 skipped; build, ruff lint/format, pytest 215 passed, demo, demo-verify,
secrets all passed. Redis, browser and hosted checks were not run.

After that gate, `project-sweep-agent.mjs` gained `--fallback-ref` (stage a named
branch only while main lacks the sweep) with a test that executes the generated
runner against a bare-repo origin; `pnpm run test:agent` then passed 303/303. Only
`scripts/` and docs changed after the core gate.

First live run (2026-11-01T14:00Z, report
only): worktrees 56, branches 67; retire 0, stale-claim 25, reconcile-delivered 3,
archive-ignored 1, cancel-review 3, orphan 1, remote-review 15.

## Gaps / next step

- Installing the agent (and choosing report-only vs `--apply`) is Val's decision.
- The 25 stale claims and 3 cancel-review rows need owners or Val; the sweep only
  queues them.
