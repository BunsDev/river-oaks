# Office computer database MVP

## Objective and ownership
Implement resident-owned office computers using the existing database and auth: personal workspaces, private tasks, explicitly accepted shared collaboration, recovery and isolation. Preserve Jevica’s original office. No GitHub integration, new service, task execution, paid calls or production operations.

Task: `office-computer-db-mvp`; owner: `codex-root-office-computer-db-mvp`.
Branch: `feat/office-computer-db-mvp`; base: `f72a89f8e7127104d0b5ccbc23617f030b5b0c66`.
Worktree: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-office-computer-db-mvp`.
Authoritative task register: primary checkout’s `docs/project-management/tasks.json`.

Implementation and local verification completed before delivery. Val subsequently authorized commit, push and merge to main. Deployment and production operations remain outside this authorization. Preserve existing stashes.

## Completed behavior
- Lazy, deterministic, idempotent office provisioning for approved accounts; existing furnished room reused with isolated workspace and voice IDs.
- Private account tasks remain private. Office tasks require explicit accepted collaboration. Owners invite/revoke approved users; collaborators cannot manage membership.
- Bounded Redis and memory stores with indexed discovery, atomic membership/task CAS, optimistic versions, operation receipts and membership epochs. Revocation, deletion and old retries cannot resurrect data or access. Empty memory discovery indices are released on revocation.
- Private legacy records remain readable and migrate additively on write. Server-assigned creation/update timestamps; existing task title, notes, result, links and completion behavior preserved.
- Existing session, approval, ban, CSRF/origin, rate and same-session active-visit gates preserved. Task content/membership lists never enter public snapshots.
- Reconnect rechecks membership before publishing the first personal-office snapshot. Periodic reconciliation removes unauthorized visits; shared requests always check membership atomically with writes.
- My tasks / Office tasks scopes, self-service office selector and accepted invitations. Account/workspace epochs fence late responses. Observed revocation closes/clears shared views.
- Autosave, conflict feedback, stable lost-response retries, current-page draft recovery and export. Explicit confirmation before deletion, failed-draft scope switches and leaving an office with an unsaved shared draft.
- Discovery refreshes only near the lobby, in an office or with visible office controls; no per-frame HTTP requests or database-wide scans.

## Owned files
- New `server/office-workspaces.js`, `office-workspaces-api.js`, `office-workspace-visits.js` and their store/API tests.
- Existing desk storage/API and browser contract/model/UI/CSS; office UI and visit authority.
- Narrow wiring in app/distributed-app/town/world-gateway/redis-room/world, hosted rewrites and routing tests.
- Checkpoint v8 compatibility in avatar preferences, creator rollout audit and checkpoint tests.
- Focused editor, visit, HTTP/WebSocket and browser journeys; `docs/offices.md`; task-specific reports and this ledger.

## Verification
All commands run in this worktree. Redis URL below was an owned isolated test process, not production. Test namespaces are random and cleaned by the suites; never FLUSHDB.

| Command / check | Result |
| --- | --- |
| `pnpm run agent:doctor` | Passed after dependency installation and again after browser prerequisite repair. |
| `pnpm run verify` | Final run passed; `.runtime/agent/core.json`; `/tmp/office-core-final.log`. Core’s default Redis skips are covered by the separate full Redis run. |
| `REDIS_URL=redis://127.0.0.1:16387 pnpm run verify full` | Passed all stages through experience; interrupted during shared with ABORT_ERR/SIGKILL. `.runtime/agent/full.json` remains failed. This is not an uninterrupted full-profile pass. |
| Full profile client/server/desktop | Client 3050 passed, one existing storefront negative-test skip because its approach was already obstructed. Redis server 693 passed, zero skips. Desktop 61 passed. |
| Full profile remaining completed stages | Dependency audit, tooling, production build, Python lint/format and 141 tests, synthetic demo checks, secret scan/history, security browser, reflections and ten experience journeys passed. Demo verify’s blocked result is the expected synthetic fixture exit. |
| `node --test preview/tests/office-ui.test.js preview/tests/office-desk-model.test.js` | 31 passed, zero skips. |
| `REDIS_URL=redis://127.0.0.1:16387 node --test server/tests/office-desk-transport.test.js preview/tests/office-ui.test.js` | Reconnect patch: 22 passed, zero skips. Later full server and client runs include the final code. |
| `RIVER_OAKS_E2E_REPORT=office-computer-final-browser.json pnpm run test:experience office-desk office-computer-shared office-visit` | Desk 22 checks and two-user sharing six checks passed. Legacy journey hit a guest lobby travel timeout before entry. |
| `RIVER_OAKS_E2E_REPORT=office-computer-legacy-browser.json pnpm run test:experience office-visit` | Dedicated retry passed, including request acceptance, revocation during boarding and focus recovery; no guest browser errors. |
| `git diff --check` | Passed. |
| `pnpm run --silent project:check --github --tasks <primary>/docs/project-management/tasks.json` | Reports unrelated expired leases, retirement/PR-head gaps and stashed register edits. Own task reconciled separately; no unrelated state discarded. Log `/tmp/office-project-handoff.log`. |

Browser coverage includes 320/390px layouts, keyboard scope selection, save failure/retry/export, private/shared isolation, acceptance and revocation. Screenshots were inspected. Synthetic tests are not live WorkOS, hosted deployment, human accessibility or target-device acceptance.

## Test-first defects and interrupted attempts
- Reconnect with out-of-band membership revocation failed in both memory and Redis before the fix; both passed afterward.
- Idle/visible office discovery regressions failed before polling was bounded, then passed.
- Browser reproduced failed shared draft loss after Close and keep draft followed by office departure; guard now offers keep editing or explicit discard.
- Lightweight server fixture without an office module exposed a reconnect compatibility bug; all 14 app tests passed after correction. Terminated only the two known stale failing test children.
- Earlier core attempts hit ENOSPC. Removed only this worktree’s generated ignored dist output; later available space allowed a clean final core pass.
- Earlier full attempt lacked Playwright headless shell 1248; installed the required local prerequisite. Initial shared browser run crashed after two journeys. Later runs progressed without failed assertions but received process interrupts; all partial reports remain honest.

## Persistence and rollout
No new environment variables, database, auth provider or external service. Memory storage ends with the process. Redis workspace schema v1 and private desk schema v2 are additive/lazy; no task content is copied to shared scopes. Checkpoint and Redis writer generation are v8. Deploy matching gateway/client versions together and account for checkpoint compatibility when planning rollback. Production rollout was not performed.

Limits: 10,000 workspaces, 32 members per workspace, 64 owned/invited offices per account, 24 tasks and 128 KiB per desk, 32 retry receipts. Invitations in the UI target approved residents currently online. Unsaved drafts are current-page only; export before closing the page. Revocation cannot recall already-delivered data, but blocks subsequent requests and clears observed shared views.

## Final handoff
Implementation and authorized local verification are complete. Core passed. All 21 standard shared journeys have passing evidence across resumed runs; `data/reports/office-computer-verification.json` maps every journey to its raw report. Full-profile and partial shared receipts retain their original interrupted/failed status: no uninterrupted full-profile pass is claimed.

Shared recovery commands: `RIVER_OAKS_SHARED_JOURNEY=world-map pnpm run test:shared development-world`; `pnpm run test:shared development-publish required creator` (interrupted after seven passed); individual `RIVER_OAKS_SHARED_JOURNEY=<name> pnpm run test:shared required` for multiplayer-exclusivity, vehicle-exit, multiplayer-gate, resident-names, sit-and-water and greetings; `pnpm run test:shared creator`. Each used its own `RIVER_OAKS_SHARED_REPORT=office-computer-<name>.json` output.

The primary live register records handoff awaiting delivery authorization, with ownership lease released. No delivery evidence exists; keep all uncommitted work. Next action: review this branch, then commit/push/PR only when explicitly authorized. Before merge, reconcile against current main and require hosted CI. This worktree is not safe to archive/remove. Initial inventory had ten other checkouts; adding this worktree made eleven. Current inventory is ten after unrelated concurrent lifecycle work; this task removed none.

Cleanup: verified PID 28312 was the owned Redis at 127.0.0.1:16387, then stopped it with `redis-cli -h 127.0.0.1 -p 16387 shutdown nosave`. No production database or unrelated process touched. Browser runners completed and released their own locks/fixture servers. Final whitespace check passed.

## Follow-up review and prepared delivery
Reviewed the workspace store and API, trusted visit context, local/distributed route wiring, private desk migration/retries, editor state fences, office discovery and membership UI. No new blocking finding in this focused review. Re-read the core receipt (passed) and shared coverage manifest; `git diff --check` passed again. No implementation changes or additional runtime tests were needed in this review. Hosted/live acceptance and uninterrupted full-profile coverage remain unverified.

Prepared PR title: **Add resident-owned office computers with private and shared tasks**

Prepared PR description:

> Residents can provision a personal office and manage tasks using existing authentication and storage. My tasks remain account-private; Office tasks are shared only with collaborators who explicitly accept an owner invitation. Owners can revoke access without maintainer intervention.
>
> Adds bounded memory/Redis persistence, atomic membership and task updates, version conflicts, retry receipts, and reconnect authorization. The desk preserves recoverable drafts within the current page and supports export and explicit discard confirmation. Existing Jevica visits remain supported.
>
> Validation: core verification passed; Redis server suite passed 693 tests; all 21 standard shared journeys passed across resumed runs; focused desk/sharing and legacy office browser coverage passed. The full-profile run was interrupted and is not reported as passed. Live WorkOS, hosted routing, human accessibility and target-device performance remain unverified.
>
> Rollout: additive workspace/private-desk records and checkpoint/writer generation v8; deploy compatible gateway/client versions together. No new service or environment variable. Memory mode is process-local; Redis supplies persistence.

Next delivery step requires the user's separate authorization under the attached prompt's Delivery boundary: commit the verified feature, push its branch and open a PR. Before delivery, refresh origin and assess current-main changes; verify any resulting integration changes. No merge or deployment is implied. Preserve this dirty worktree; it is not safe to archive.

## Authorized delivery
Val authorized commit, push and merge to main in the follow-up request. The reviewed source patch is unchanged from the passing core run. Refreshed origin; current main adds unrelated desktop/GPU tooling and register work with no shared feature paths. Commit the verified patch, then use the repository landing queue to integrate current main and require hosted checks on the resulting head.

Delivery progress: signed source commit `b49fe5163899481911ef3a26e7f4b358c9bfe1b9` pushed in [PR #390](https://github.com/BunsDev/river-oaks/pull/390). Integrated `origin/main` at `d2ea93c34137651b21e497ac519805fd403ba93f`; the sole conflict was the generated plans index, regenerated through `pnpm run plans:index`. `pnpm run verify` passed on the integrated tree (`/tmp/office-integrated-core.log`, core receipt); no application-code conflict. Hosted CI remains the next merge gate.
