# Shared material consumer baseline for #739

Record the reviewed CPU and loaded-scene inventories from November 8 as a reusable baseline for [#739](https://github.com/BunsDev/river-oaks/issues/739). This documentation adds no renderer behavior or acceptance waiver. Observed source is `b4bace1d1392449e1e8a85072eb1bef8c3fe5cfe`, tree `7b8c3e056744dbe23946b1c2a39ee22b3956a1d2`; both workers fenced HEAD and unchanged tracked inputs. Their `dirty:true` includes the separate untracked overnight ledger. The documentation branch starts from later main `fba811f7a48af94814a8ada65aabd0b9c8b95fc0`; the measurements below retain their actual earlier revision.

Task: `material-consumer-baseline-739-20261109`; owner: `codex:overnight-01a1a8ac-20261108:739-inventory`. Own only this file. The parent goal, #842 classifier/cameras, #740 scene/bindings and other sessions retain their ownership. Raw receipts, helpers and images remain in the preserved `river-oaks-overnight-20261108/.runtime` checkout; they are local evidence, not published artifacts.

## Executed scope and commands

- `node scripts/browser-lock.mjs '739 current headless material consumer inventory' -- node .runtime/inventory-739-current-consumers.mjs`: terminal 0, 2026-11-08 20:16:50–20:16:52 UTC, 21 locked recipes reproduced and 50 rows recorded.
- `node .runtime/run-739-live-inventory.mjs`: terminal 0, canonical `runProfile` supervisor passed its single browser task in 44,784 ms, 2026-11-08 20:18:08–20:18:53 UTC. Four profiles produced 16 captures. The supervisor owns the queue and task process group; its 25-minute deadline did not fire.

The CPU inventory builds every locked recipe in Classic and Pink with flat-zero ground and `landscape:false`, then Gardens shell/planting, Ribbon, FiveRooms exterior shells and admitted default landscape in both finishes. It excludes caller-owned Commons/Heights landmark extensions, campus fit-out/ceilings and browser-loaded models/atlases. Attached materials, Mesh/Sprite material sets, texture fields, authored shader-hook presence/cache-key hashes, actual color/emission/glass fields and one invocation of the actual custom disposer are recorded separately. The 28-slot authored budget is not a limit on these attached object counts.

| CPU builder | Finish | Meshes | Mesh materials | Sprite materials | Attached materials | Material texture objects | Observed custom-disposer material targets |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Commons recipe | Classic | 63 | 44 | 6 | 50 | 13 | 51 |
| Commons recipe | Pink | 65 | 45 | 6 | 51 | 13 | 52 |
| Yale recipe | Classic | 66 | 32 | 0 | 32 | 13 | 33 |
| Yale recipe | Pink | 70 | 33 | 0 | 33 | 13 | 34 |
| Gardens shell/planting | Classic | 114 | 27 | 0 | 27 | 9 | 27 |
| Gardens shell/planting | Pink | 117 | 29 | 0 | 29 | 9 | 30 |
| Ribbon | Both, separately built | 5 | 5 | 0 | 5 | 0 | 5 |
| FiveRooms exterior shells | Both, separately built | 8 | 8 | 0 | 8 | 0 | 8 |
| Default FiveRooms landscape | Both requested appearances | 1 | 1 | 0 | 1 | 0 | Not exercised: caller owns teardown |

Every observed custom disposer targeted every attached material once in that single invocation; extra targets are unattached cached/owned materials. This does not prove complete private allocation ownership, repeated-switch leak freedom or GPU release. Landscape does not expose a finish; its two requested appearances are not invented observed finish identities. Geometry attribute bytes exclude instance matrices/colors and other storage.

All four historical Commons/Yale comparisons against `3329cd9351da42930972984365b9fc1387a4e7b5` retain matching plan hashes and zero mesh, geometry, Mesh-material, material-texture and geometry-attribute-byte deltas. This is the matched historical subset only. The remaining CPU rows establish a new baseline, not an old/new performance or buffer-identity comparison. Existing `stats().materials` is narrower: Commons reports 37/38 while its attached Mesh material sets contain 44/45. No explicit total-allocation contract was found for that metric, so this discrepancy is recorded without declaring a runtime defect, budget breach or leak.

## Loaded Gardens observations

Chromium `156.0.8078.4` loaded the real loopback fixture at `river-oaks-gardens-3`, 1280×800, device scale 1. Each profile checked the actual served revision, component finish, connected/player-ready state and completed asset progress. All 102 tracked assets completed with zero asset failures. Existing test exposure publishes the actual campus root, then follows its parents to the real Scene; builder logic is unchanged. Existing GL counters record live programs as created minus deleted, and cumulative program-link calls. No alternative scene or synthetic material result substitutes for the loaded graph.

The matched views are `01-southeast-aerial` and `15-floor4-t2-gallery`, using their canonical campus poses at observed 15:00 and 18:30. Each capture asserts actual hour, `assets.done`, requested graphics mode and unchanged scale/occlusion. Sharp stayed scale 1 with AO; Smooth stayed scale 0.75 without AO. All 16 PNGs were viewed by the publishing agent. They show rendered exterior/gallery content with UI overlays; this is bounded agent inspection, not traversal, privacy, skin/film, complete depth-conflict or aesthetic acceptance.

| Profile | Captures | Unique attached materials across snapshots | Unique graph geometries | Material texture objects | Renderer geometries | Renderer textures | Live GL programs |
| --- | ---: | --- | --- | --- | --- | --- | --- |
| Classic Sharp | 4 | 1188 | 1221 | 177 | 666–733 | 206–220 | 173–179 |
| Classic Smooth | 4 | 1188 | 1221 | 177 | 666–733 | 200–214 | 164–170 |
| Pink Sharp | 4 | 1190–1191 | 1225–1230 | 177–179 | 670–721 | 206–216 | 173–179 |
| Pink Smooth | 4 | 1191 | 1230 | 179 | 693–742 | 207–216 | 169–173 |

These are snapshots with matched camera/settings, not same-instant or steady-state samples. Residents, rendering and resource creation continue between captures. Per-group resources can be shared; whole-graph Sets deduplicate them. Attached graph counts are not submitted draws or allocated GPU totals. Graph texture counts scan material texture fields, excluding Scene environment/background and pipeline/shadow targets; renderer memory and GL observations have separate scopes. Geometry attribute bytes omit instance/color/morph storage. No causal finish-cost, resource-budget or leak conclusion follows from the ranges.

There were no page errors, tracked asset failures or recorded shader/WebGL error messages. There were **two unclassified HTTP 503 console errors per profile**. Their URLs were not captured, so the cause remains unknown. This evidence does not establish console/network cleanliness or justify assigning a provider cause. No live provider acceptance is claimed.

## Retained evidence and integrity

The following SHA-256 values identify the actual local receipts. A file that changes no longer matches this baseline. The helpers refuse existing primary output, preserve partial failures, and are retained beside the receipts for exact method inspection. No rerun is needed merely to refresh a timestamp.

| Local receipt | SHA-256 |
| --- | --- |
| `.runtime/739-current-consumer-inventory.json` | `2d2832782376833768670b2363c53b83e37a074c5ff957a5a5cbd2608800ded0` |
| `.runtime/739-live-scene-inventory/report.json` | `65b429534189a37dbe8316caaeebfc2f5bd2cf64dfe4f1e2aa539074c5c73fd4` |
| `.runtime/739-live-scene-inventory-runner.json` | `7b2fd48caa565025a363eb78726fc31efd57fd66c3b918d63e797e691447bc7c` |

The CPU helper is `.runtime/inventory-739-current-consumers.mjs` (SHA-256 `459d104677674eeea7438790c12dfc52fd43dbb8eb142fdc28527f32c6a6ea42`). Loaded-scene helper `.runtime/inventory-739-live-scene.mjs` hashes to `e8718723d3e223d356d595c19d46ab59d7769b81d64e6e2b6b735fcf3648c8f5`; supervisor `.runtime/run-739-live-inventory.mjs` hashes to `8fe1ee2414328504263673772473b801d811bc165ffb440f4ef5390d99e19e95`. These are evidence helpers, not shipped runtime APIs. Independent review inspected construction, actual data, integrity and scope; it found no blocker for this bounded baseline.

## Acceptance and delivery ledger

- [x] Record exact source, workload, settings, resource/counting scopes and first-result receipts.
- [x] Independently review actual CPU/loaded receipts; inspect all 16 captures and preserve unclassified console failures.
- [ ] Complete exact-document review and documentation preflight, canonical core and staged secret checks.
- [ ] Publish a verified signed increment; inspect required hosted checks and use one protected lander; confirm actual merge and fetched ancestry before marking delivered.

Whole-#739 acceptance remains open. The inventories do not prove actual functional-affordance/emission positives and negatives, complete live streaming across all regions, all fallback/teardown behavior, target-device performance or retained visual/aesthetic decisions. Diagnostic provenance, material roles and emitted colors cannot establish a usable door/control, permission or approved landmark. #842 owns the independent classifier/cameras; #740 owns scene/bindings. Existing shader, recipe, geometry and disposal regressions and #903 full/browser evidence retain their recorded revisions and limits.

Next consumer action: combine the delivered `surfaceProvenance(hit)` facts with actual owning interaction bindings under those existing owners, leaving missing associations unavailable, and test actual positive and negative emission/affordance examples. Preserve the baseline while reviewing that integration. Do not close #739 from this documentation increment.
