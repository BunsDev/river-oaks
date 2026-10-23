# Phase 1 review against #580 and #581

## Objective and scope

Review the combined world foundation against [#580](https://github.com/BunsDev/river-oaks/issues/580) and [#581](https://github.com/BunsDev/river-oaks/issues/581), correct reproducible defects, document an evidence-backed baseline and decide whether Phase 2 can begin safely. Commit, push and merge are user-authorized. Phase completion remains separate from code delivery.

Checkout: `/Users/buns/Documents/GitHub/BunsDev/river-oaks-world-manifest-581`, branch `feat/world-manifest-581-20261022`, live task `world-manifest-581`, owner `codex:phase1-review-20261023`. Source baseline: main `52379be69efd395d624fedd57eeee8e283850a62`; standalone manifest signed checkpoint `e8588a20871ba9c8fef2bd9f4402a41c2a772cdc`; published expansion snapshot from PR #594 `5c3d96c314e93e28bc17ab956acefaedd5a8ca83`. The other owner's checkout and branch remain untouched. Integrate published source only, retaining Commons and all three reserved partitions. PR #594 contains unsigned commit `0897279de5059eee42f317da7d18a2c28086556a`, so its reviewed tree changes are retained as a patch instead of inheriting that commit. The local merge state was quit without changing its resolved files; a new signed commit will carry the integrated result. GitHub verifies the pushed standalone checkpoint signature. Neither source branch history nor source PR metadata is rewritten, and this integration does not automatically close the acceptance issues.

## Review findings and corrections

- The published manifest validator accepted sparse programmatic vectors, numerically collapsed transformed rectangles, zero area underflow, reserved defaults and unsupported District content revisions. The standalone manifest work rejects these with behavioral regressions and preserves a detached result. Stable IDs are tested independently of registry/entry order.
- Flight could not cross the two-metre logical overlap: two 1.3 m collider margins leave a 0.6 m gap. Increase logical overlap to three metres; rendered paving still starts at the original District edge. Test the entire approach at five-centimetre intervals.
- Rollback used a walking-only boundary margin and missed a valid flyer half a metre inside District. Relocate occupants whose destination flight clearance fails, then validate the resulting checkpoint. Preserve source checkpoint and identities.
- Commons accepted durable creations that Gardens could not restore on rollback. Keep the temporary blockout outside the shared durable placement bounds until a creation relocation policy is implemented. Apply the same bounds to every creation type in browser and server; preserve original District placement. Do not delete incompatible existing experimental state.
- Rollback candidate placement must include existing creation colliders. Compose the destination walking environment with those colliders before choosing positions, preserving the final restore validation.
- The baseline harness used ten-second samples even though its proposed protocol required medians of three thirty-second samples. Use that protocol, five-second warmup per sample and unique screenshots, and capture provenance after queue acquisition.
- The new Commons browser journey was selectable but absent from both normal full verification and hosted CI. Add it to the existing experience gate and a separate hosted shard so future regressions cannot silently bypass the required preview aggregate.
- No engine, framework, spatial index or generalized migration framework was introduced. The bounded registry and existing composition seams are sufficient for this phase.

## Acceptance audit

| Requirement | Evidence and decision |
| --- | --- |
| Stable coordinates and units | Existing EPSG:32615 relative origin retained; east/north/up metres, renderer east/up/negative-north boundary unchanged; translated add/serialize/remove fixture and identity checks. |
| Malformed manifests and overlap | Version/frame/origin/bounds/translation/entry/default/revision/adjacency/numeric rejection tests; shared-edge partitions valid, positive-area overlap invalid. |
| District loads unchanged | Default/Gardens composed data deep equality, unchanged entity IDs, original occupied checkpoint restoration, gallery and authority regressions. Visual comparison remains separate. |
| Another location without copying District | Arbitrary translated fixture registers and removes using data alone; Commons reuses existing renderer/controller/games/authority with a small shared layout and composition function. Generic automatic authored-content loading/streaming is not claimed. |
| Destination contract | Existing user-approved East Garden Commons proposal retained; fictional authored land, no Houston survey claim. |
| Reachable-area calculation | Reproduce bounded flood fill at 1 m and 0.5 m using real collision/height contracts; document sampling limits, exclude upper floors/flight/disconnected land. Reservations are bounds only. |
| Reproducible performance baseline | Local desktop and phone viewport measurements with exact source hashes; three warmed thirty-second samples per workload. Results pending below. Physical target mobile and production download remain unmeasured. |
| One-/two-player journey | PR #594 historical two-client keyboard/chess/reconnect/return receipt retained; integrated rerun required below. |
| Explicit performance budgets | Existing 10% frame/CPU/production-transfer and 20% reconnect proposals documented; target hardware and budget approval remain open. |
| Phase 2 readiness | Pending corrected integration verification. Routing and streaming experiments may proceed from a pinned tested foundation; unrestricted phase acceptance must wait for the remaining #580 evidence. |

## Verification and preserved failures

All receipts are under `.runtime/world-manifest/` unless otherwise stated. Initial standalone focused rerun: 49 passed, zero skipped. First combined suite: 57 passed, one explicitly Redis-dependent skip before starting the owned isolated Redis. Three review regressions failed for their intended reasons in `phase1-review-red.log`. The first build restriction attempt affected only custom objects; `phase1-review-green.log` retained that failure. The corrected shared placement bound is reverified in `phase1-review-green2.log`: 14 passed, zero failures or skips, including real Redis.

The source-reachability run, repeated baseline and full integrated gate use the normal common browser queue. Queue wait is not measured performance or a failing product test. The first queued baseline was cancelled by its owner before it ran to move provenance capture after lock acquisition; its queue log is preserved. No other session's process or lock is modified.

Current results: core passed all 11 phases with isolated Redis (tooling 201, preview 3,802 passed/one skip, server 1,005 passed/zero skips, desktop 115 passed/three Windows skips, Python 149 passed); `.runtime/world-manifest/phase1-core.json` and `.log` retain the result. Final rollback suite passed 8/8 with zero skips, including a regression that fails when existing creation colliders are omitted (`rollback-collider-red.log`) and preserves original District creations exactly (`rollback-final.log`). Manifest/legacy suite passed 43/43 with zero skips; the final combined manifest, Commons, migration, real HTTP/WebSocket and gallery selection passed 69/69 with isolated Redis and zero skips. Full/browser and baseline measurements remain queued. Do not mark Phase 1 complete or close #580. Replace this status only with actual test/baseline receipts and exact delivery evidence.

## Remaining acceptance

Physical mobile hardware performance/memory/thermal measurements, matched before/after District visual review, approved target budgets and production-build initial-download comparison remain open. Cross-location resident routing, load/unload failure recovery and repeated travel resource stability belong to Phase 2 and are not implemented by this manifest. The first Commons slice is roughly 12% additional sampled ground; the eventual 3–5× total playable-area objective needs further layout/content work. No production configuration, live account, native runtime or human accessibility acceptance is claimed.
