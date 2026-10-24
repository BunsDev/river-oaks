# Working in River Oaks

River Oaks is a multi-runtime world: a Three.js/Vite client, authoritative Node
multiplayer service, Python decision/GIS bridge, Electron shell, and Unreal project.
Start with [the task map](docs/architecture.md) and [agent workflow](docs/agent-workflow.md).
Read the scoped AGENTS.md in the subsystem you change.

## Start

1. Run `git status --short` and `git worktree list`. Preserve existing edits and
   other agents' work. Use an external sibling worktree when ownership overlaps;
   never copy `.env`, private `.runtime` state, or credentials into it.
2. Reconcile the live task register using
   [the lifecycle workflow](docs/project-management/workflow.md). Claim the exact
   task/branch, record your session owner and next action, and reuse an owned
   checkout before creating another. Expired or missing ownership is not discard
   permission. The live register is one file in the common Git directory, shared
   by every worktree: change it with `pnpm run register patch <id> --json '{...}'`
   (`show <id>` reads it, `path` prints it). `project:check` reads it from any
   worktree. Never edit `docs/project-management/tasks.json`, a snapshot that only
   register sweeps commit; feature PRs must not change it.
3. Read the owning module, its callers, tests, and linked subsystem docs before
   editing. Keep patches small; do not reformat large unrelated files.
4. Run `pnpm run agent:doctor` after installing dependencies. Use
   `pnpm run agent:list` for machine-readable verification profiles.
5. For multi-step work, create/update a task-specific ledger in
   `docs/superpowers/plans/`: objective, files owned, checks, results, gaps, next step.
   Historical reports are evidence of their recorded revision, not today's status.
6. Evaluate local retirement at session start, after each verified merge and before handoff using [the proactive retirement rule](docs/project-management/workflow.md#proactive-retirement-rule). Apply eligible, authorized cleanup in the same session; preserve every blocked candidate with its owner and next action. Age, an expired lease and a missing upstream never authorize removal.

## Implement and verify

- Follow existing plain JavaScript ESM and Python conventions; do not introduce a
  framework migration to solve a local problem. Keep authority on the server.
- Add a focused behavioral regression for changed behavior. Prefer real local
  transports and synthetic fixtures; avoid tests that merely match source text.
- Run focused checks while iterating, then `pnpm run verify` for the core gate.
  Run `pnpm run verify full` with an isolated Redis service and browser prerequisites
  for Redis, dependency audit, and browser coverage. The hosted CI matrix remains
  a separate merge gate: `main` requires the aggregate `preview` check on a branch
  that is up to date with `main`. See the workflow for Linux rendering setup.
- Core success excludes Redis, browser, native, live auth, and production acceptance.
  A skip is not evidence. Read console test counts and `.runtime/agent/<profile>.json`.
- Never commit without verification. Do not merge, publish, deploy, or resolve
  review threads unless authorized and the work is actually addressed.
- Follow [the delivery cadence](docs/project-management/workflow.md#delivery-cadence): publish verified increments as drafts when authorized so hosted checks can overlap independent local checks. Mark ready and enqueue promptly once required local checks and review pass and merge authorization exists. Keep observing the same lander until terminal; do not leave an authorized green PR waiting for routine confirmation.

## Boundaries

- Never print/read credential values to diagnose setup. Use `.env.example` for names.
  Keep provider keys server-side; do not put them in `VITE_*`, assets, receipts or logs.
- Do not call paid inference/speech services, download large GIS/model/asset packs,
  operate production accounts/databases, or run publishing scripts without task authorization.
- Use local fixture identities only in the existing acceptance harnesses. Never
  relax WorkOS/waitlist/CSRF checks to make a test pass.
- Preserve coordinate units, authoritative movement/collision rules, bounded
  inference, and late-response fences. Consult scoped instructions.
- Generated assets and historical reports are not source edits. Do not replace
  evidence with fresh timestamps unless the corresponding check actually ran.

## Handoff

State changed behavior and files, exact verification commands/results, skips and
unverified scope, worktree/branch, and remaining delivery steps. Keep secrets out.
A green local gate is not merge, deployment, visual, or human accessibility proof.
Do not mark a ledger complete until evidence supports each promised item. Do not
archive/remove a worktree containing undelivered edits.

Reconcile task status and next action at handoff. Mark delivered only with exact
PR/merge evidence, and retired only with cleanup and restoration proof.

Use `pnpm run project:inventory` to see what every local branch and worktree still
needs before retirement, then `pnpm run project:prune --branch <branch>
--expected-head <full-sha>` for local retirement; dry-run first, then `--apply`
after resolving blockers. Do not bypass the installed ref guard or remove worktrees
directly. See the lifecycle workflow for exact-head ownership release, authorized
cancellation (`project:cancel`), archive verification (`project:archives`) and
restoration requirements.
