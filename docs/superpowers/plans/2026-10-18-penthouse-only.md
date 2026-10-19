# Penthouse-only office implementation and evidence

Owner: Cody, turning-office-20261018.
Branch: fix/penthouse-only-access-20261018.
Base: 1d8740ada63aee0062e8471a5ffd6d9323517108 (fresh origin/main).

## Approved objective
Retire the one-room office from live use. Keep the penthouse with authenticated Jevica admin ownership and owner-created invitations. No commit, push, merge or deployment authorized.

## Implementation
- preview/src/office-layouts.js: penthouse default. Retain legacy geometry for validating old checkpoints, not live admission.
- server/offices.js: normalize retired configured layout to penthouse; preserve existing server-side Jevica ownership, explicit invitation grants, revoke/eject, and no guest delegation.
- server/tests/penthouse-only.test.js: unset/retired/unknown settings, impersonation denial, owner invitations, guest admission, stale-layout denial and revoke/eject.
- Existing office/penthouse/checkpoint tests updated for retired rollback semantics. Old room occupancy ends on restore; invitations survive; penthouse occupancy survives old configuration.
- preview/e2e/office-visit.js: check penthouse admission and current collision bounds, replacing the removed room's wall coordinates.
- docs/offices.md, docs/multiplayer.md and .env.example: document the sole live layout and ownership model.

## Verification
- New regression failed before patch (office-red.log); 2 passed after patch.
- Focused updated unit suites: 27 passed, no skips (office-updated.log).
- office-world-lifecycle suite: 5 passed, 0 skipped, exercising real local coordinator replacement and invitations (office-lifecycle.log).
- Browser office-visit passes penthouse admission, guest denial, invitation, revoke/eject and revocation during boarding (office-browser-recheck.log). Private desk journey also passed. Durable receipt: data/reports/penthouse-only-20261018.json.
- First browser run correctly failed its outdated legacy-wall assertion; private desk passed on that run. Updated assertion then passed in the recorded recheck.
- Standard pnpm run verify stopped by this session to reduce excessive test concurrency. No pass claimed.
- Tooling: 121 passed. First bounded core run timed out during expensive client tests without an assertion failure; recheck uses four workers and a 30-minute task bound (.runtime/verify-recheck.mjs, core-recheck.log), completed through the final tail run below.
- Additional required shared-multiplayer browser journey passed (shared-multiplayer.log).

## Final local evidence
- Client: 3,533 passed, 1 unrelated pre-existing glazing fixture skipped (core-recheck.log).
- Server: 670 passed, 204 Redis-dependent tests skipped, zero failures; desktop: 76 passed; Python: 141 passed. Build, lint, format, synthetic demo checks and secrets scanning passed (.runtime/agent/core-final-tail.json).
- The server run exposed one remaining legacy rollback expectation in server/tests/penthouse-seats.test.js; updated to assert penthouse seat preservation and reran the server suite successfully.
- Required shared multiplayer browser journey passed: data/reports/penthouse-shared-multiplayer-20261018.json. This is the selected multiplayer journey, not the entire shared browser matrix.
- Consolidated core evidence and log hashes: data/reports/penthouse-core-20261018.json.

## Delivery state and limits
Implementation and local behavioral checks verified. No commit, push, merge or deployment performed. Live WorkOS, Redis failover, hosted CI and human acceptance remain unverified. Preserve this uncommitted worktree for review and authorized delivery.

## Repository hygiene
`git diff --check` passed. `pnpm run project:check --tasks /Users/buns/Documents/GitHub/BunsDev/river-oaks/docs/project-management/tasks.json` reports 24 existing cross-repository task/worktree bookkeeping gaps; none names either task in this change. See project-check-final.log. No unrelated task records or worktrees were removed.

## Authorized PR landing
Val authorized commit, PR creation and landing on main in this thread. Deployment is not requested. Core receipt renamed to a task-specific path so the two independent PRs do not collide.
