# Game-development skill coverage audit

Audited 2026-10-07 from clean `main` at `5b26f3a`, before these skill additions.
All nine existing SKILL.md files and their index were read. “Covered” below means
instruction coverage, not runtime acceptance. The supplied brief authorizes these
skill edits; workflow approvals for actual scene changes remain separate.

## Runtime and tool inventory

- `unreal/RiverOaks.uproject`: engine association 5.8, C++ runtime and editor Python
  plugins. `docs/engine-acceptance.md` records an older 5.8.2 macOS build; it is
  historical evidence, not a build performed by this audit.
- `unreal/Config/DefaultEngine.ini`: Lumen GI/reflections, mesh distance fields,
  virtual shadows and SSAO configuration. Blockout material and bootstrap live in
  `unreal/Content/Python`; no finished licensed PBR kit is implied.
- `RiverStreetPawn.cpp`: 35 cm capsule radius, 80 cm half-height; swept movement
  constrained to street height, no CharacterMovement step/slope solver. Native
  world uses centimeter conversion of local GIS meters; browser uses meters.
- `RiverOaksWorld.cpp`: instanced blocking trunks and nonblocking crowns; geometry
  generated at BeginPlay. Native local NPC motion/HTTP decision bridge is not
  evidence of a replicated multiplayer world.
- `docs/multiplayer.md`, `server/`, `preview/`: Node authoritative HTTP/WebSocket
  shared town, Redis distributed storage; Three.js/Vite client, Electron shell;
  Python decision/GIS bridge. Existing local identity fixtures must retain their
  auth boundaries. Browser results do not establish native parity.
- Platforms: browser/web and Electron sources; Unreal Windows/macOS/Linux build
  instructions. Historical native acceptance is macOS M3 Max only. No current
  target hardware budget or cross-platform production acceptance is supplied.
- Available checks: `scripts/agent.mjs`, `config/agent-workflow.json`, Node tests,
  Python pytest, Playwright fixture runners, C++ `RiverOaks.Contracts` automation.
  Native tests require a built engine target; rendered tests require a renderer.
  `agent:doctor` passed prerequisite presence; this is not test execution.
- Relevant existing tests: `preview/tests/landscape-models.test.js`,
  `preview/tests/reflections.test.js`, `preview/e2e/landscape-trees.js`,
  `preview/e2e/shared-runner.js`, `tests/test_post_process.py`,
  `tests/test_appearance_catalogue.py`, `tests/test_voice.py`, native
  `Private/Tests/RiverDeveloperCollisionTests.cpp` and other native tests.

## Coverage and disposition

The final column describes the implemented instruction destination or explicit
defer. Shared safety, examples and validation contracts extend every existing skill.

| # | Topic | Before | Decision and resulting coverage |
| --- | --- | --- | --- |
| 1 | Reference Board | Covered | Extend shared contract/examples; source rights remain required |
| 2 | Blockout Builder | Covered | Extend recoverable alternatives and fixture |
| 3 | Map Scale & Proportions | Covered | Extend safety/fixture; keep active-controller measurements |
| 4 | Player Path & Collision | Covered | Extend server/two-client routing and fixture |
| 5 | Room Logic | Covered | Extend safety/fixture; no building-code claim |
| 6 | Modular Kit Checker | Partial | Extend asset inventory/import/provenance pilot below |
| 7 | Camera & Framing | Partial | Extend wayfinding, occlusion and interior visibility below |
| 8 | Blockout Review | Covered | Extend shared acceptance and fixture |
| 9 | Developer View | Covered | Extend scoped evidence/fixture; retain bounded diagnostics |
| 10 | Shape Language & Depth | Missing | Create priority skill, two purposeful alternatives |
| 11 | Landmarks & Wayfinding | Partial | Merge into Camera & Framing; no separate skill |
| 12 | Reference-to-Scene Comparison | Partial | Create priority skill plus matched-metadata helper |
| 13 | Lighting & PBR Diagnostics | Missing | Create priority skill; separate materials/light/exposure |
| 14 | Time-of-Day Validation | Missing | Merge into Lighting & PBR Diagnostics |
| 15 | Vegetation Placement & Collision | Partial | Create priority skill; mesh/instance and movement evidence |
| 16 | Camera Occlusion & Dithering | Partial | Merge diagnostics into Camera & Framing; defer dithering implementation until supported and requested |
| 17 | Interior Visibility | Partial | Merge camera threshold/exposure review; no new culling system |
| 18 | Rendering Performance | Partial | Merge into lighting and existing Developer View; target-hardware acceptance remains required |
| 19 | Asset Zoo & Inventory | Partial | Merge representative assembly/inventory into Modular Kit Checker |
| 20 | Asset Import & Provenance | Partial | Merge into Modular Kit Checker plus Reference Board rights |
| 21 | Character Continuity | Missing | Merge instruction route into World Workflow D; actual assets remain task inputs |
| 22 | Voice & Animation Validation | Missing | Merge into World Workflow D; defer paid voice/native asset production |
| 23 | Scene & Shot Continuity | Missing | Merge into World Workflow D and camera station evidence |
| 24 | Controlled Rebuild & Comparison | Partial | Shared recovery contract and comparison skill; retain original |
| 25 | Peer Feedback Intake | Partial | Merge into World Workflow; reproduce before accepting cause |
| 26 | Multiplayer World Validation | Partial | World Workflow E and collision skills use real web harness; native replication remains unsupported/unproven |
| 27 | End-to-End Diagnostics | Partial | World Workflow routes existing gates and Developer View; no invented test integration |
| 28 | Agent Handoff & Evidence | Partial | Shared contract and World Workflow scope results and gaps |
| 29 | Backup & Recovery | Partial | Shared contract covers ignored binary backups and restoration checks |
| 30 | Skill Suite Orchestrator | Missing | Create World Workflow for requested A–E compositions |

No checklist topic warrants a duplicate standalone skill merely to increase the
count. Five additions bring the suite to fourteen skills. Production dithering,
asset import tooling, native networking, animation content and paid media remain
separate implementation tasks; their absence is a documented boundary, not a
claim of engine capability.

## Delivery and rollback

See [fixtures](skill-suite-fixtures.md), [validation](skill-suite-validation.md),
[shared contracts](skill-suite-contract.md) and [index](../level-design-skills.md).
Changes are confined to skills, documentation and the pure metadata comparison
helper/tests. No world, runtime configuration or asset is modified.

To roll back, inspect the current diff/ownership first. Restore only this task's
modified skill/index paragraphs to `5b26f3a`, remove its five added skill folders,
its `skill-suite-*` docs and helper/test if unchanged by later work. Preserve the
ledger as evidence or remove it explicitly. Do not reset the whole worktree;
there are no scene changes to undo. No commit/push/merge was requested.
