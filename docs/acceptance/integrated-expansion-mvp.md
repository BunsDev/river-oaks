# Integrated expansion MVP acceptance

Assessment: **implementation integrated; delivery verification incomplete**. The candidate combines destination c2598c65 with frozen streaming, Studio neighborhood-authoring and #587 gate sources. The user authorized adoption, commit, push and merge. This authorization does not replace verification; no merge or deployment has occurred. Input provenance is recorded in [the source manifest](integrated-expansion-provenance.json).

| Requirement | Current evidence | Remaining action |
| --- | --- | --- |
| Loaded scene lifecycle and bounded buffers | 32 focused tests pass, including twenty Market load/evict cycles, unchanged authoritative world data, delayed landscape readiness, cancellation, Lantern Walk replay and owned landscape disposal | Rendered cycles and final full gate |
| Reconnect recovery | Regression reproduces a player trapped east of the rain garden by a strictly west-only guard; lateral retreat now passes while unloaded entry remains blocked | Rendered reconnect/failure journey |
| Shared authority | Nine Commons/Lantern server tests pass with isolated Redis, zero skips | Final full and hosted transport coverage |
| Authoring preservation | 58 JavaScript tests and 14 Python tests pass; regeneration review covers fourteen candidates, 1,928 routes and ten preservation categories including geometry, approvals, tombstones, additions, road name, spawn, terrain and export/reopen | Final source-bound regeneration passed; rendered authoring review remains pending |
| Reachable ground | 0.5 m grid: Gardens 46,477.75 m², Market 52,030.75 m², addition 5,553 m² (1.11948×); 1 m grid yields 1.11990× | Ground sampling excludes upper floors, flight, dynamic objects and physical accessibility; no 3–5× claim |
| Dependency audit | No known vulnerabilities after existing Zod 4.6.7 / Electron 44.9.1 patch | Final full/hosted checks |
| Browser journey, visual and performance | Candidate east-garden-commons journey is queued behind existing shared browser runs | Normal two-player activity/return, twenty rendered travel loops, keyboard failure recovery, inspected matched captures, frame/CPU and production transfer measurements |
| Core/full/hosted delivery | Baseline core passed; candidate core passed; independent review found and fixed missing import and lateral-retreat defect | Final full, signed commit, push, PR, hosted checks and guarded merge |
| Human/device acceptance | Not supplied by synthetic, headless or desktop fixture results | Human visual and accessibility review; agreed physical target hardware |

The 16 MiB streaming ceiling measures retained geometry, morph and instance buffers after asynchronous landscape readiness. It excludes shared texture caches and total GPU memory, and rejects oversize content after construction; it does not bound transient allocation. Actual browser renderer resources remain to be measured.

Preserved first failures include the donor full-suite timeout, PR #611 dependency audit and post-chess stall, lantern-remount and landscape-disposal regressions, old blockout fixture mismatches, regeneration attempt 001 source drift, and the rain-garden retreat trap. A headless movement probe did not reproduce the hosted post-chess stall; its root cause remains unknown. The integration journey must establish recovery rather than assuming that unrelated fixes resolve it.

Independent review's deferred minor: streaming recovery notices still use “East Garden Commons” while the destination HUD uses “Bayou Market Commons.” The [ledger](../superpowers/plans/2026-10-23-integrated-expansion-mvp.md) records commands, source rulings and retained receipts. Historical capture reviews below are explicitly not candidate visual acceptance.

## Completed authoring capture review

All eighteen retained images in the authoring owner's `output/playwright/neighborhood-review-1792749867240/` were visually inspected across the initial and follow-up integration review. The capture source manifest contains 45 files; entry, exit and current hashes match. `.runtime/integration/authoring-capture-audit.json` records the report and image hashes. The `compare_skill_views.mjs` command independently confirmed compatible metadata for the manual Market and default generated Market south-approach pair. This establishes comparison conditions, not visual acceptance.

| Capture set (overview and south approach) | Observed difference / judgment | Integration decision |
| --- | --- | --- |
| `manual-market-street`, `manual-garden-neighborhood` | Plain blockout masses and simplified trees; these are starter-region references, not the rendered District | Useful layout references only; do not treat passing comparison as District parity |
| `garden-market-sparse-baseline` versus `garden-market-default` | Sixteen-building default visibly fills more frontage than the eight-building sparse baseline; broad empty spaces and repeated isolated building silhouettes remain | Preserve generator correction evidence, but do not substitute this fixture for the finished Bayou Market scene |
| `garden-market-review-0`, `garden-market-review-5` | Seed changes alter massing while retaining the road grid and broad building distribution; ivory/teal material treatment stays consistent in these views | Supports repeatable preset variation; no collision, preservation, GPU, or human acceptance inferred from pixels |
| `garden-court-default`, `garden-court-review-0`, `garden-court-review-5` | Six scattered buildings around large open areas; glass entrances and height variation visible at approach | Further destination-level dressing and route context would be needed if used as the final player destination |

Capture conditions: private Three.js Studio comparison rig, 1280×800, DPR 1, vertical FOV 45°, south-approach camera `[0, 1.68, 60]` in east/up/south metres, fixed Studio daylight, ACES exposure 1, no environment map, empty occupancy. The fixture is not the multiplayer world and does not show the final District-to-Market seam. No scene or original capture was changed during inspection.
