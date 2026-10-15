# Procedural stack follow-through

Objective: close the review notes left on the landed procedural interior stack
(#349–#358, #382) and write down what physical GPU acceptance still owes. The
notes come from the integration review on #350 (comment, 2026-10-14T20:35Z).

Owner: `claude:river-oaks-b7 (43d73155)`, task `procedural-landing-follow-through`.
It takes over the open gates of `procedural-multilevel-interiors-plan` (Codex
handoff, 2026-10-14T23:23Z). Each fix is its own task, branch and sibling worktree,
so `project:prune` can retire it by its PR.

Owned files: this ledger, `2026-10-14-procedural-gpu-acceptance.md`, and the files
named under each fix.

## Fixes

| Note | Task / branch | PR | Change |
| --- | --- | --- | --- |
| #350: `departureGraceMs` raised 10 s → 30 s with no regression | `departure-grace-regression-20261014` / `fix/departure-grace-regression-20261014` | #384 | Test only: `server/tests/shared-transport.test.js` drops a player and asserts they survive 29.999 s, that reconnecting resumes the same player and cancels the departure, and that they are released at 30 s. It fails with the old 10 s default. |
| #352: restore-path private-home exit leaves `levelId` set | `private-restore-level-exit-20261014` / `fix/private-restore-level-exit-20261014` | #383 | `server/world.js` restore loop clears `buildingId`/`levelId` when it sends an ungranted guest outside, matching the live revocation path. Regression in `server/tests/generated-private-level-access.test.js`. Before the fix, the outdoor pose failed with `invalid_level`. |
| #354: AO shedding is global and needs a device check | `procedural-landing-follow-through` / `perf/ao-tail-shedding-opt-in-20261014` | this PR | `preview/src/render-quality.js`: Auto's tail rule becomes opt-in (`tailShedding`, `?aotail=on`), and `quality.stats` reports it. Reason below. |

### Why the AO tail rule is opt-in and not gallery-scoped

The review offered two fixes: scope the rule to the gallery, or check it on devices
before it ships as the default. Scoping turned out to be inert. Since #382, Auto
already replaces GTAO with the room's fixed contact layer inside every approved
generated room (`main.js`, `generatedRoomActive`). A gallery-scoped tail rule would
therefore never change a frame. The rule's only remaining effects were on the district,
and both were unmeasured:

1. tail-heavy windows on the street drop district AO;
2. tail windows recorded inside the gallery keep district AO off after the visitor
   leaves, for up to 132 calm windows (about 99 s at 60 Hz).

#354's own ledger also records that after main was merged in, Auto with AO already off
still measured 33.3 ms moving p95 on all five visits, so the AO benefit was never
isolated. The rule stays available behind `?aotail=on` for the device runs in the GPU
acceptance plan. Floor-based shedding at minimum resolution is unchanged.

## GPU acceptance

See [the GPU acceptance plan](2026-10-14-procedural-gpu-acceptance.md). It covers #351
culling, #354 tail thresholds, #358/#382 AO contact shading and #349 portal pacing on
mobile, with the device matrix, commands and pass criteria. None of those runs has
happened. They need physical devices, and the human review is Val's.

## Verification

Each fix ran its focused regression before and after the change, then core
`pnpm run verify` on the committed tree. Core skips the 141 `REDIS_URL`-gated server
tests. No browser journey, Redis or hosted-production run is claimed here.

- **#383** (signed head `f8d7bb11`): before the fix, the new restore test failed
  (`buildingId` still `rose-hall`, outdoor pose `invalid_level`); after, 2/2 passed.
  Neighbouring world, checkpoint, private and four-level suites ran 86 pass with 4
  Redis skips. Core passed: agent 95, preview 3,042 (+1 existing skip), server 499,
  desktop 61, Python 141. Landed through `pnpm run land 383`: Verify green, 17 checks,
  `CLEAN`; merged 2026-10-15T00:00:42Z as `f72a89f8` (merge tree `789b3728` = head tree).
  Retired through `project:prune`: `~/worktree-backups/river-oaks/retirement-7d0duH/manifest.json`,
  with evidence in `local-evidence-private-restore-exit-20261014`.
- **#384** (signed head `233ff633`): the grace test passed 1/1, and 10/10 on repeated
  runs; it failed with the default set back to 10 s. The whole transport file ran
  19/19. Core passed with the same counts as #383.
- **This PR:** `preview/tests/render-quality.test.js` ran 13/13. The two new default
  tests fail against `main`'s `render-quality.js`; the existing tail tests now opt in.

## Next

Land each PR through `pnpm run land`, retire its worktree through `project:prune`,
then run the GPU acceptance plan on devices (Val).
