# Procedural interior footprint validity

Objective: reject a self-touching or doubled-back building ring before producing a server-approved, multi-level interior plan. Keep valid rotated and concave building footprints working, and leave the published gallery plan unchanged.

Owner: `codex-root-20261014-ring-validity`. Branch/worktree: `fix/procedural-interior-ring-validity-20261014` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-ring-validity-20261014`, stacked on draft PR #354 head `3b8ef9d3a19723226795698866f4bdcf49bc7fc4`.

Draft PR #355 carries the signed fix; its initial head was `4634200509de8ff2b3f6d65616fdc9a7cee6baba`. The post-commit signature was `G`, the forbidden co-author check printed nothing, and the worktree was clean before push.

Files owned: `preview/src/building-interiors-plan.js`, `preview/tests/building-interiors-plan.test.js`, this ledger, generated plans index, and this task's branch-register entry. The primary live register was claimed before worktree creation. Unrelated primary edits and worktrees are preserved.

## Evidence and decision

- A 16 × 12 m fixture ring with a doubled-back upper-edge spike (`[0,6] → [0,2] → [0,6]` in local metres) was accepted by `generateBuildingInteriorPlan` and yielded a two-level room. The ring has overlapping nonadjacent edges and is not a valid simple building footprint. `normalizedRing` currently rejects strict crossings but misses endpoint touches and collinear overlap.
- Validate nonadjacent segment contact at the input boundary. Do not change the downstream room-fit and neighboring-footprint semantics while fixing this ring validity gap.
- The focused regression failed before the patch with `Missing expected exception`. After checking nonadjacent endpoint contact and collinear overlap, 24/24 generator, approved district, and creator-package tests passed with zero skips. Existing valid rotated and concave examples still pass, and the pinned gallery plan/digest remains unchanged.
- `node scripts/browser-lock.mjs 'procedural ring validity parity' -- node preview/e2e/building-interiors-plan.js` passed: browser and Node generated identical two-level plans. This parity journey covers valid generation; the new rejection regression ran in Node tests.
- `pnpm run verify` passed (`.runtime/agent/core.json`): agent, preview, server, desktop, build, Python, synthetic demo and secret checks passed. Core does not include Redis or browser acceptance.
- `REDIS_URL=redis://127.0.0.1:16399 pnpm run verify full` passed (`.runtime/agent/full.json`) with all 17 result groups: preview 3,039 pass/1 existing skip, Redis server 673/673 with no skips, ten experience and 21 shared journeys, security browser, WebGL reflections, dependency audit and source checks. The disposable Redis process was stopped. Generated reports were archived under ignored `.runtime/ring-full-*.json` and restored from git. This remains local evidence, not target-device, human visual, native, or production acceptance.

## Verification and limits

Add a focused behavioral regression for the doubled-back ring and a nonadjacent vertex touch, retaining the valid concave/rotated control. Run the browser plan parity journey, `pnpm run verify`, and isolated-Redis `pnpm run verify full` before a signed commit. Hosted exact-head checks and human/target-device acceptance remain separate.

## Next action

Wait for exact-head hosted checks on draft PR #355, then release task ownership while retaining the clean review worktree. The overall goal still awaits target-device and human visual acceptance before broader rollout.
