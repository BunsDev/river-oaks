# Working in River Oaks

River Oaks is a multi-runtime world: a Three.js/Vite client, authoritative Node
multiplayer service, Python decision/GIS bridge, Electron shell, and Unreal project.
Start with [the task map](docs/architecture.md) and [agent workflow](docs/agent-workflow.md).
Read the scoped AGENTS.md in the subsystem you change.

## Start

1. Run `git status --short` and `git worktree list`. Preserve existing edits and
   other agents' work. Use an external sibling worktree when ownership overlaps;
   never copy `.env`, private `.runtime` state, or credentials into it.
2. Read the owning module, its callers, tests, and linked subsystem docs before
   editing. Keep patches small; do not reformat large unrelated files.
3. Run `npm run agent:doctor` after installing dependencies. Use
   `npm run agent:list` for machine-readable verification profiles.
4. For multi-step work, create/update a task-specific ledger in
   `docs/superpowers/plans/`: objective, files owned, checks, results, gaps, next step.
   Historical reports are evidence of their recorded revision, not today's status.

## Implement and verify

- Follow existing plain JavaScript ESM and Python conventions; do not introduce a
  framework migration to solve a local problem. Keep authority on the server.
- Add a focused behavioral regression for changed behavior. Prefer real local
  transports and synthetic fixtures; avoid tests that merely match source text.
- Run focused checks while iterating, then `npm run verify` for the core gate.
  Run `npm run verify -- full` with an isolated Redis service and browser prerequisites
  for Redis, dependency audit, and browser coverage. The hosted CI matrix remains
  a separate merge gate. See the workflow for Linux rendering setup.
- Core success excludes Redis, browser, native, live auth, and production acceptance.
  A skip is not evidence. Read console test counts and `.runtime/agent/<profile>.json`.
- Never commit without verification. Do not merge, publish, deploy, or resolve
  review threads unless authorized and the work is actually addressed.

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
