# Generated private home upper-level access

Objective: preserve server-authoritative access, occupancy, voice space, movement and checkpoint consistency when an invitation to a generated multi-level owner-only home is revoked while the guest is upstairs.

Owner: `codex-root-20261014-private-level-revocation`. Branch/worktree: `fix/procedural-private-level-revocation-20261014` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks-private-level-revocation-20261014`, stacked on signed draft PR #351 head `5a0f4f619ded0fa91c0fe959afad4c9a1eed0201`.

Files owned: `server/world.js` revocation/access seam, `server/tests/generated-private-level-access.test.js`, this ledger, the plans index and the task's register entry. The primary live register was claimed before edits. Existing #349–#351 branches and unrelated dirty primary files remain untouched.

## Evidence

- Read the current generator, creator package compiler, authoritative world command path, private-home tests, subsystem instructions and project lifecycle workflow. A private home's invitation is checked for travel and ground walking; the upper-level transition uses the player's approved source portal.
- The revocation path locates the guest through the ground room polygon and moves their position outside, but did not clear `buildingId` or `levelId`. `voiceSpaceOf` gives upper-level occupancy priority over ground-room access. The new two-level owner-only home test failed before the fix with `buildingId: rose-hall` after ejection. It passed after clearing both occupancy IDs in the same server ejection transaction. The test also checks denied reentry, outdoor voice space, an accepted outdoor movement step and checkpoint restore.
- `node --test server/tests/generated-private-level-access.test.js server/tests/region-package.test.js server/tests/district-gallery-transition.test.js server/tests/creator-four-level-interiors.test.js server/tests/voice-routes.test.js` passed 25 with one existing hosted-edge skip. `REDIS_URL=redis://127.0.0.1:6484 pnpm run test:server` passed 673/673 with zero skips on a disposable loopback Redis service (`/tmp/river-oaks-private-level-server.log`). The same service was used for the full gate and then stopped.
- `RIVER_OAKS_SHARED_JOURNEY=creator-four-levels pnpm run test:shared development-publish` passed on local Chromium / Apple M3 Max (`.runtime/private-level-shared.json`). It covers the shared four-level transport path, while the new revocation assertion is an authoritative server test rather than a browser UI journey.
- `pnpm run verify` passed on the final access change (`/tmp/river-oaks-private-level-core.log`, `.runtime/agent/core.json`). `REDIS_URL=redis://127.0.0.1:6484 pnpm run verify full` then passed on the same source diff (`/tmp/river-oaks-private-level-full.log`, `.runtime/agent/full.json`): agent 76/76, preview 3,035 pass/one existing skip, Redis server 673/673 with zero skips, desktop 54/54, Python 141/141, ten experience and 21 shared journeys. Dependency audit, build, lint, expected offline-demo result, secret/history scans, security browser and WebGL reflections passed. The disposable Redis service was stopped. Current browser reports were archived under `.runtime/private-level-full-{experience,shared}.json` before tracked historical reports were restored.
- This is a local fixture and command-path fix. It has no hosted PR check yet and does not establish live WorkOS, human visual, native, or target-device acceptance for the wider interiors goal.
- Signed commit `5cbefb4088a7f85d703cea4489487af292998a2a` passed the required attribution/signature check and was pushed. Draft [PR #352](https://github.com/BunsDev/river-oaks/pull/352) is stacked on #351. Hosted checks on the eventual final head are still required; neither this PR nor its parent stack is merged.

## Next action

Check PR #352's final exact-head hosted results, then hand it to the procedural-interiors integration owner. Human visual and target-device acceptance remain separate from this access fix.

## 2026-10-14 integration landing

- Val authorized serial landing. PR #351 merged to main as `a2739d6c2d78766c28c8bc1719e32156d00f4138`. Merged that main head into #352 without source conflicts, including the café state and render pilot; refreshed only the delivered #350/#351 and owned #352 rows from the live register. The final tree still needs focused/core verification, signed push, exact-head hosted checks, ready state and the REST merge guard.
- `node --test server/tests/generated-private-level-access.test.js server/tests/region-package.test.js server/tests/district-gallery-transition.test.js server/tests/creator-four-level-interiors.test.js server/tests/voice-routes.test.js server/tests/cafe-games.test.js` passed 33 with one existing hosted-edge skip on the final main merge. `TMPDIR=/Volumes/Passport/river-oaks-agent-tmp-contact pnpm run verify` passed (`.runtime/private-main-merge-core.log`, `.runtime/agent/core.json`, 2026-10-14), including Python 141/141 and no secret leaks. Diff checks passed.
