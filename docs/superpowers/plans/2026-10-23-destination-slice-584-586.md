# Destination slice: city kit, assembly and Bayou Market Commons (#584, #585, #586)

Register task `destination-slice-584-586`, branch `feat/destination-slice-584-586-20261023`, worktree `river-oaks-destination-slice`, base `cfa90654`.

## Objective

Ship the first playable expansion beyond the District. Players walk from the District into a polished, original Houston-inspired destination, explore it together, use a shared activity and walk back without a reload. Build it from a reusable kit, assembled deterministically with preserved manual overrides, and show that the same kit produces a second, distinct neighborhood.

## Coordination

Two Codex sessions hold related, uncommitted work: `neighborhood-584-586` (kit, idle since 21:22 CDT on 2026-10-22) and `neighborhood-authoring` (Studio-integrated generator, live). This branch adopts none of their files and avoids their paths (`shared/streetscape-kit.js`, `shared/neighborhood*`, `config/neighborhoods/`, `scripts/neighborhood*.mjs`). Reconciling the overlap is a maintainer decision: keep both, or fold one pipeline into the other.

## Files owned

- Kit and assembly: `shared/city-kit/catalog.js`, `shared/city-kit/assemble.js`, `scripts/destination.mjs` (`pnpm run destination`), `config/destinations/*.json` with their locks.
- Destination: `shared/commons-destination.js`, the revision bump in `shared/east-garden-commons-layout.js` and the manifest, composition in `preview/src/east-garden-commons-world.js`, rendering in `preview/src/east-garden-commons.js` and `preview/src/city-kit/render.js`, the `buildMatureTrees` placements parameter, and the main-loop hooks in `preview/src/main.js`.
- Activity: `server/lantern-walk.js`, the `server/world.js` wiring, the rollback in `server/district-commons-checkpoint-migration.js`, `preview/src/lantern-walk.js` and `.css`.
- Tests and e2e: `preview/tests/city-kit.test.js`, `preview/tests/bayou-market-commons.test.js`, `server/tests/lantern-walk.test.js`, `preview/e2e/city-kit-review.js`, `preview/e2e/fixtures/city-kit.*`, and the Lantern Walk phase in `preview/e2e/east-garden-commons.js`.
- Docs: `docs/city-kit.md`, `docs/level-design/expansion/bayou-market-commons.md`, and updates to world expansion, blockout, garden-campus and architecture.

## Results (this worktree, before commit)

- [x] Kit catalog: 29 pieces in 7 families, 3 styles, 25 material slots, plus conventions for scale, naming, collision, LOD, licensing and budgets.
- [x] Assembler: per-ID seeded streams, overrides and additions by stable ID, orphan reporting, canonical hash, provenance, a solid-in-walkable guard, north/south streets, east/west fronts, intersections, unsigned overflow shops.
- [x] Bayou Market Commons: 112 pieces, 19 shells, 53 solids, 49 meshes before trees, 100% connectivity on the plan and on the real walking environment.
- [x] Second neighborhood `nineteenth-and-yale`: 181 pieces, 43 shells, 54 meshes, a crossroads with crosswalks and an east-facing court, 100% connectivity.
- [x] Lantern Walk: server authority, snapshot, checkpoint and validation, and rollback removal. Client: Z interaction, status chip, scene lighting.
- [x] Focused tests: `node --test preview/tests/city-kit.test.js preview/tests/bayou-market-commons.test.js server/tests/lantern-walk.test.js` gave 21 passed, 0 failed, 0 skipped.
- [x] Existing suites, run unsharded: preview had 3,850 passed, 2 failed, 1 skipped before the stale literal fix. The 2 failures came from the old revision literal in `baseline-580-route.test.js`, which now passes 2/2. Server had 763 passed, 0 failed, 215 skipped (Redis-backed tests without `REDIS_URL`).
- [ ] `pnpm run verify` (core): running.
- [ ] Pedestrian-scale screenshots of both recipes and a second seed (`city-kit-review`): queued on the shared browser lock.
- [ ] Two-player journey with the Lantern Walk (`test:experience east-garden-commons`): queued on the shared browser lock.
- [ ] `pnpm run verify full` with isolated Redis.

## Gaps and next step

Human visual approval, physical-device performance and hosted multiplayer are outside automated evidence. The reachable-area target (3–5×) is unchanged by this slice. Next step: inspect the screenshots, fix visual defects, record journey results, commit, open the PR.
