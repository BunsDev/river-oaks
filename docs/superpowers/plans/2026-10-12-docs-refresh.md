# Docs and plans refresh (2026-10-12)

**Objective:** bring the docs and plans up to date with the code after the 2026-10-11/12 work: the workplace stack, both server hardening passes, the Places redesign, Turnstile in production, and the parallel CI and register tooling. Also add Mermaid diagram placeholders with prompts. Val asked for this on 2026-10-12.

**Owner:** river-oaks-c2. **Branch:** `docs/refresh-20261012`. **Worktree:** `river-oaks-docs-refresh-20261012`.

## Method

- **Audit:** three read-only reviewers compared docs with the code, each covering one area:
  - security and auth: `security-review`, `email-access`, `multiplayer`, `desktop`, README setup;
  - gameplay and UI: `places`, `rail-navigation`, `workplace-operations`, polish docs, README features;
  - process and infrastructure: `architecture`, `agent-workflow`, `project-management/workflow`, `testing`, `AGENTS`.

  Each finding came with code evidence (file:line). Only factual corrections and material omissions were applied, with no stylistic rewrites.
- **Plans:** `pnpm run plans:index` (`scripts/plans-index.mjs`) generates `docs/superpowers/plans/README.md` from the task register. It groups plans as active or blocked, delivered, retired, or historical (no register task; listed with the PRs they mention). `--check` reports a stale index.
- **Register:** the committed `tasks.json` was a strict subset of the primary's live register, with no committed entry newer than its live counterpart. The live register is committed as it stood (re-read right before committing), so plan statuses are current. The owning sessions were told, and river-oaks-f1 confirmed its entries.
- **Diagrams:** `docs/diagrams.md` sets the placeholder convention and indexes 12 planned diagrams. Each placeholder in its doc has a "Diagram pending" Mermaid block and a collapsible prompt.

## Results

| Area | Docs | Main corrections |
| --- | --- | --- |
| Security and auth | `security-review`, `email-access`, `multiplayer`, `desktop`, README | - New sections: 2026-10-11/12 hardening, a limits table with error codes, the static asset gate, and production owner settings (Turnstile live; spend pause and memory alert left to Val). <br>- Two wrong claims fixed: the pending sign-in cap was 1,000 with "no login rate limiter" (it's 20,000, with a per-address limiter), and the Docker image was said to need Redis (it runs the standalone town). <br>- Also: namespace rules, the missing env vars, `typesafe.place` in place of `sim.jev.works`, heartbeats, one world per account, chauffeur budgets, the dev bridge guard, and the cookie-encryption release gate. |
| Gameplay and UI | `places`, `rail-navigation`, `workplace-operations`, `experience-polish`, `ui-visual-polish`, `world-events`, README | - Layout: the Map panel and atlas (Cmd/Ctrl+B, Alt+2) replaced the Places tab and rail, and the map no longer needs `VITE_WORLD_MAP`. <br>- Places: store categories, filters and the phone layout. <br>- Events: the client panel was removed; the service remains. <br>- Workplace: the cron drain also runs the access check, sweeps take at most 50 owners, and there's a new panel section. <br>- README: the plaza salon and current Settings labels. |
| Process and infrastructure | `architecture`, `agent-workflow`, `project-management/workflow`, `testing`, `AGENTS.md` | - Register: a task-register row and scoped `AGENTS.md` links in the task map; which copy is live; required register fields; the complete exit codes and prune refusals; every retirement manifest; and a new register sweeps section. <br>- CI and merging: new hosted CI and merge gate sections, the known flaky journeys, and the `verify browser` journey list with its drift from CI. <br>- Reports: local browser runs rewrite two tracked report files. |

- **Plans index:** `pnpm run plans:index` covers 108 plans: 3 active or blocked, 3 delivered, 39 retired and 64 historical.
- **Register:** the committed register equals the live one (79 tasks), re-read right before committing.
- **Diagrams:** 12 placeholders, each appearing exactly once, indexed in `docs/diagrams.md`.
- **Link check:** relative links and anchors in the 22 changed docs all resolve. One already-broken README anchor was fixed: `character-forms.md#royal-vehicles-and-prince-jev` now points to `#controls-and-rendering`.
- **Found, not fixed here:**
  - A possible workplace bug: a finished task dropped at the 8-task cap leaves its draft's metadata counted against the 3-draft limit. It's verified and fixed separately.
  - A stale comment in `server/world-gateway.js:30` ("serverless relies on owner reads").
- **Studio pack trap.** The World Studio skill pack (`scripts/studio-skill-pack.js`) follows every Markdown link from its skills, transitively. A link from `architecture.md` to the plans index pulled all 108 plans into the pack, and one of them links to a directory, so `pnpm run test:desktop` failed with "Unsafe pack path". `architecture.md` now names the plans index as a code path instead of a link. The pack grows from 59 to 68 files (the diagram index and the docs it links), with the same two pre-existing anchor warnings.
- **Checks:** `pnpm run verify` (core) passed; desktop 49/49; plans-index and pnpm-policy tests passed.
