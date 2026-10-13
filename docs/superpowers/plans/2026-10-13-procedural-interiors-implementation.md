# Procedural interiors implementation ledger

Objective: deliver the full building-anchored, seeded, multi-level interior system described in [the design guide](2026-10-13-procedural-multilevel-interiors.md), including the shared district, authoritative vertical traversal, World Studio editing, and measured rollout. This goal remains open until every phase and its scoped evidence are complete.

Owner: `codex-root-20261013-procedural-interiors`. Branch: `docs/procedural-multilevel-interiors-20261013` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-procedural-interiors-plan-20261013`. Baseline: `2429f4fdcd6ec36fe1736ff994d61d3ba89e1d81` (`main` at claim). The existing branch advanced by fast-forward; its attempted rename was rejected by the installed ref guard, so the branch name remains unchanged. The primary checkout's dirty project-maintenance files belong to another task.

## Phase status

| Phase | Required outcome | State |
| --- | --- | --- |
| A. Contract | Pure versioned generator and server validation; legacy storefronts unchanged | Verified locally; delivery pending |
| B. Pilot | One public generated ground floor, proximity preparation, safe entry | Next |
| C. Levels | Second floor and server-authoritative transition, queries, state, reconnect | Pending |
| D. Studio | Level and layer editing, stable overrides, save/reopen/export compatibility | Pending |
| E. Rollout | Additional archetypes only after visual, route and performance evidence | Pending |

## Phase A implementation sequence

1. Inspect current building/store data and room, walking, compiler and test seams. Record a representative pilot candidate without changing published worlds.
2. Write behavioral tests for identical plans across independent calls and Node/browser imports, unrelated-building order independence, seed/version changes, rotated/irregular footprint containment, height and entrance failure, and stable IDs.
3. Implement a pure, bounded plan generator in `preview/src/building-interiors-plan.js`. Inputs are immutable building geometry, world ID, seed/version and a valid entrance. Output is serializable with explicit anchor, levels, room/portal/object IDs and shell/partition/fixture/finish/override layers. No Three.js or server imports.
4. Add opt-in validation and round-trip support to `server/region-package.js`, preserving schema-v1 inputs without a generator declaration. The server publishes an approved resolved plan/hash. Existing storefronts continue through `storeRoomsFor` until migrated.
5. Verify focused preview/server tests, `pnpm run agent:doctor`, `pnpm run verify`, and source diff. Do not claim Phase A complete or commit before those results are read.

## Evidence and gaps

- 2026-10-13: Read the pasted long-running objective and design guide, current main/worktree/task register, AGENTS.md and scoped preview/server instructions, required architecture/workflow/world docs, and owning room/walking/compiler seams. No implementation or tests yet.
- Added the pure generator and building-local transforms in `preview/src/building-interiors-plan.js`. It bounds rings, heights, entrances, levels, seeds, neighboring footprints and fixture placement; levels carry stable room, portal, shell, fixture and finish IDs. This is an approved-plan data contract, not a playable multi-level room yet.
- Opt-in creator package generation is validated in `server/region-package.js`, published by the server catalog with a SHA-256 plan digest and the actual world ID, and round-trips through the editable region. Legacy packages without `interior.generation` retain their existing format and room path.
- Focused `node --test preview/tests/building-interiors-plan.test.js server/tests/region-package.test.js server/tests/world-catalog.test.js` passed: 21 pass, 2 Redis skips. `node scripts/browser-lock.mjs 'procedural interior plan' -- node preview/e2e/building-interiors-plan.js` passed after waiting for the live experience runner; Node and Chromium generated identical plans from the same input.
- An initial `pnpm run verify` passed core before final validation and anchor additions: agent 76, preview 2,945 pass/1 existing skip, server 477 pass/140 Redis skips, desktop 54, Python 141. The run is historical for that earlier diff. A first attempt had been interrupted because source changed while it ran; its failed receipt is not acceptance evidence.
- Current district inventory: `Laura Rathe Fine Art` on `osm-way-625333006` fits a two-level candidate after reserving other storefront rooms. This is a data fit only; there is no render, entry, collision or shared traversal evidence for the pilot.
- Final Phase A core on the current source diff: `pnpm run verify` exited 0 (`/tmp/river-oaks-procedural-phase-a-final-core.log`, `.runtime/agent/core.json`). Agent 76/76, preview 2,945 pass/1 existing skip, server 478 pass/140 Redis skips, desktop 54/54, Python 141/141; build, lint, format, synthetic pipeline and worktree secret scan passed. This is core scope only.
- Focused isolated Redis publication check: `REDIS_URL=redis://127.0.0.1:16395 node --test server/tests/world-catalog.test.js server/tests/region-package.test.js` passed 18/18, zero skips. The owned disposable Redis service was shut down after the run. The generated world ID, digest and unrelated-revision stability are covered in `server/tests/world-catalog.test.js`.
- Current task register claim is active in the primary checkout. The design guide is untracked in the owned worktree; preserve it.
- No live Redis, browser, two-client, Studio, target hardware, native or hosted verification has run for this implementation.

**Next action:** build the Laura Rathe ground-floor pilot from the approved plan while preserving other stores, then test real walking/collision and scene entry before claiming it playable.
