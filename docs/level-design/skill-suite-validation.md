# Skill-suite validation record

Date: 2026-10-07. Source baseline `5b26f3a` plus the uncommitted skill-suite patch
on `main` in `/Users/buns/Documents/GitHub/BunsDev/river-oaks`.

## Author-executed tabletop tests

Method: read each final skill, its shared contract and the corresponding inputs
in [the fixture document](skill-suite-fixtures.md); perform the requested
inspection as a text-only exercise and record the resulting decision below.
These are author walkthroughs, not independent-agent trials, engine executions or
human visual acceptance. The fixtures deliberately contain both sufficient
synthetic evidence and missing/contradictory evidence. “Pass” here means the
inspection handled that fixture correctly, including refusing unsupported claims.

| Skill | Successful-use output actually produced | Failure-case output actually produced | Result |
| --- | --- | --- | --- |
| Reference Board | REF-01 supplies south entry, 4 m width, matte plaster/calm mood and queue beside R1; height remains proposed | Unseen social image cannot yield a sourced card or measured scale; source/rights needed | Pass / pass |
| Blockout Builder | Specification: 4×6 m shell, E1 arrival alignment, base 0, R1 1.2 m and separate Q1; playable artifact not built | Occupied Q1 blocks sole route; retain B0 and propose a duplicate layout with Q1 outside R1 | Pass / pass |
| Map Scale & Blockout | 100 cm = 1 m; 120−70 = 50 cm nominal lateral remainder, not a traversal pass | Standard human is not the active collision/load profile; carried-object and occupied-route measurements missing | Pass / pass |
| Player Path & Collision | Synthetic Wall-1 sweep identifies a blocking corner; correction proposal needs corner/straight/wall negative reruns | AABB is only a candidate, no cause established; capsule shrink and presumed step solver rejected | Pass / pass |
| Room Logic | Public and staff adjacency is plausible in the supplied plan; physical connections not played | Locked bathroom exit and staircase/ceiling conflict require a connected public exit and corrected vertical endpoint | Pass / pass |
| Modular Kit Checker | Kit A nominal slot size/pivot/grid and supplied rights agree; pilot import/material/collision still needed | Kit B unknown rights block reuse; corner pivot and scale 100 conflict with centered 100 cm slot | Pass / pass |
| Camera & Framing | E1/L1 cue sequence uses silhouette and sign shape; request threshold/motion/HUD/low-light checks | Separate wall clipping from dark threshold; unimplemented global dithering is no verified solution | Pass / pass |
| Blockout Review | Supplied synthetic occupied forward/return record supports fixture-only readiness; no live-world claim | Overhead still omits player-height/return travel, so review incomplete | Pass / pass |
| Developer View | Keep exact Wall-1 normal distinct from approximate bounds; zero off-query count applies only to supplied trace | Disabled enumeration and mislabeled collision are defects; no zero-cost claim or movement change | Pass / pass |
| Shape Language & Depth | A 0.30 m recess expresses threshold; B 0.45 m canopy provides shelter; retain both for matched views and route test | 1.20−0.50 = 0.70 m, equal to capsule diameter: no nominal clearance; preserve B0, readiness rejected pending correction/sweeps | Pass / pass |
| Reference-to-Scene Comparison | Helper allows changed artifact/revision with equal conditions; pixels and art judgment remain absent | Changed FOV axis is unmatched; absent exposure is invalid, even if missing from both | Pass / pass |
| Lighting & PBR Diagnostics | Controlled synthetic roughness change supports a material hypothesis; pilot remains reversible and multi-time/cost checks untested | Noon still and 0.3 ms single sample cannot support 4K/60; no global ray-tracing change | Pass / pass |
| Vegetation Placement & Collision | Tree-7 has distinct trunk movement hit and crown/facade visual intersection; propose one placement repair with trunk-negative and route reruns | Tree-8 AABB is unconfirmed; no broad deletion/canopy collider; no native replication claim | Pass / pass |
| World Workflow & Evidence | C proceeds through inspection and a bounded proposal; no editor means collision/time/performance stages stay incomplete | D stops acceptance at unknown rights, unavailable voice and absent playback; no approval fabricated and no paid calls/publication | Pass / pass |

Additional composition inspection: A routes scale anchors before blockout and
withholds detail until review; B retains two alternatives and user selection;
C separates light/material review from tree intersection and then collision,
time-of-day and cost; D carries identity/voice and shot IDs through playback and
approval; E requires reproduced cause before minimal patch and applicable server/
client validation. The orchestrator does not install missing tools or execute
these real-world workflows during this test.

## Automated checks

- `node --test scripts/tests/skill-views.test.js`: 7 passed, 0 failed, 0 skipped.
  Initial red run failed because the helper did not exist. A subsequent adversarial
  extension exposed missing rotation convention/render settings checks and aspect
  consistency (3 failing tests); those were corrected and all 7 passed again.
  Tests exercise actual metadata decisions and CLI exit behavior, not skill prose.
- `python /Users/buns/.codex/skills/.system/skill-creator/scripts/quick_validate.py
  .agents/skills/<name>` run for all fourteen folders: 14 valid. This establishes
  frontmatter/naming/scaffold validity only.
- Inline Python link/anchor and YAML check: 19 Markdown files, 89 local links
  and 14 UI metadata files passed. No broken local paths or fixture anchors.
- `npm run verify`: passed (exit 0). Agent tests 17 passed; preview 653 passed;
  server 267 passed, 101 skipped (Redis-dependent coverage); desktop 9 passed;
  Python 139 passed with 2 dependency deprecation warnings. Build, Ruff,
  synthetic demo and worktree secret scan passed. Demo verification's exit 2 is
  the catalog's expected blocked domain result, not production acceptance.
  Receipt: `.runtime/agent/core.json`; console log:
  `/tmp/river-oaks-skill-suite-core.log` (local-only).
- The core runner began before the final helper hardening. All seven helper tests
  passed after those changes; `npm run verify -- tooling` then passed 17 tests,
  0 failed/skipped on the final script. Receipt: `.runtime/agent/tooling.json`.
- `git diff --check`: passed. Diff review includes all added skills, the shared
  contract, index, fixtures, helper and tests; no runtime source/config changed.

## Limits and deferred work

No scene geometry, native configuration, asset import or paid service was changed.
No real screenshots, Unreal build/play, target GPU benchmark, animation playback,
voice audition, human accessibility review or native multiplayer test occurred.
Synthetic tabletop success establishes explicit decisions and proof boundaries,
not future agent reliability or runtime acceptance. Independent agent trials and
real task pilots remain useful follow-up validation, not performed evidence.

The core gate does not cover Redis/browser/native/live auth/production acceptance;
full and hosted CI remain separate. Skill instructions explicitly require those
checks when a future runtime change needs them. Dithering implementation, native
replication, production asset importer and licensed native character/voice assets
are deferred implementation work, not secretly provided by the suite.

See the [coverage audit and rollback instructions](skill-suite-audit.md) and
[task ledger](../superpowers/plans/2026-10-07-game-skill-suite.md).

## Completion audit against the supplied brief

| Requirement | Current evidence |
| --- | --- |
| Phase 1: inspect nine skills and actual runtime/tooling | Audit names all nine, source/config owners, tests and platform limitations |
| 30-topic coverage and extend/merge/create/defer decisions | Audit table contains entries 1–30 with explicit destinations/deferred implementation |
| Phase 2: inputs, inspection, modification, outputs, acceptance/failure, dependencies, approval, rollback | Four priority entrypoints and orchestrator plus linked shared contract; all nine extended entrypoints link the contract and examples |
| Design, rendering, collision and safe-iteration rules | Source-grounded units/controller; matched views; PBR diagnosis; geometry/instance checks; retained baselines and scoped approvals |
| Representative fixture and successful/failure test per implemented skill | Fourteen fixture sections, 28 recorded author-executed inspection outcomes; seven automated helper tests |
| Composable workflows A–E | World Workflow table and character/shot, peer feedback, recovery and diagnostic sections |
| Updated discoverable skill index and usage examples | Fourteen linked entries in `docs/level-design-skills.md`, invocation examples and UI metadata |
| Validation results, limits, deferred work, summary and rollback | This record, coverage audit, shared contract and task ledger |

The requested suite work is complete locally. No commit/push/PR was authorized;
these edits remain undelivered in Git. Preserve the worktree until delivered.
