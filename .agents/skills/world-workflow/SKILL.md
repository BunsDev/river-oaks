---
name: world-workflow
description: Compose River Oaks location, storefront, lighting/tree, character/clip and bug-fix workflows with recoverable baselines and evidence scoped to each runtime.
---

# World Workflow & Evidence

Read the [shared working contract](../../../docs/level-design-skills.md#shared-working-contract)
and [skill safety and validation contract](../../../docs/level-design/skill-suite-contract.md).

## Inputs and routing

Require the requested outcome, location/runtime/revision, authorized edit scope,
existing evidence and available tooling. Read the shared contract before selecting
only the stages needed. Missing tooling yields a scoped handoff, not fabricated
completion. Preserve baseline source, maps, settings and artifact IDs before edits.

| Workflow | Composition and decision gates |
| --- | --- |
| A: New location | Reference Board → Map Scale & Blockout (anchors/controller) → Blockout Builder → Room Logic → Player Path & Collision → Camera & Framing (wayfinding) → Blockout Review → detail only after readiness |
| B: Flat storefront | Reference-to-Scene Comparison → Shape Language & Depth → two blockout alternatives → matched player-height comparison → traversal → user approval of selected variant |
| C: Lighting and trees | Lighting & PBR Diagnostics inspection → Vegetation Placement & Collision intersection review → authorized small-area correction → collision → multi-time lighting → performance comparison |
| D: Character or promotional clip | Approved references and rights → character/voice checks below → shot continuity → actual playback review → user-approved artifact record |
| E: Bug fix | Reproduce → Developer View/owning diagnostics → verified cause → minimal patch → behavioral regression → server/two-client check when relevant → evidence handoff |

## Inspection and peer feedback

Keep confirmed findings, hypotheses and preferences separate. For each peer note,
record source, revision, station/timecode, expected/observed behavior and whether
reproduction supports it. Resolve conflicting notes against the approved brief.
Acknowledge a concern without claiming it fixed; rerun the affected check after
any correction. Reports and previous green gates belong to their recorded revision.

For D, inspect approved character/appearance catalogue IDs, stature, garments,
voice identity/consent and allowed portrayal. Read `docs/astra-integration.md`,
`docs/skeletal-backend-acceptance.md`, `tests/test_appearance_catalogue.py` and
`tests/test_voice.py` as relevant. Inventory actual assets/rig/animation and voice
availability. Missing native assets, licensed voice or rendered playback blocks
those acceptance claims; marker fallback and mocked speech are not equivalents.
No paid speech, model calls or new media generation follows merely from routing.

Track shot IDs, character/wardrobe/voice versions, screen direction, eye line,
action endpoints, world time/light and audio timing. Review the assembled playback
for continuity, clipping, foot contact, audible transitions and caption readability.
Record approved artifact path, revision/hash, rights and reviewer decision only
after actual approval. A render existing on disk is not approval to publish.

## Modification, recovery and acceptance

Inspection does not authorize fixes. Within authorized fixes, change one area,
retain alternatives and rerun affected checks. Never treat rebuild as deletion
permission. For destructive/broad/expensive work, first prepare the bounded diff,
backup/restore plan and cost, then obtain approval unless already granted.

Before recovery, inspect dirty state and ownership. Restore only owned paths or
map duplicates from the recorded baseline; never blanket-reset, clean or overwrite
other agents' work. Reopen the recovered scene and repeat one known route/view.
A Git branch alone does not back up ignored `.umap` assets: make a verified,
recoverable copy without credentials before editing those assets.

Handoff includes file/artifact paths, branch/worktree, exact commands/results,
skips, runtime/hardware, cause confidence, unresolved risks and next owner/check.
Use `npm run agent:list` for existing gates, `npm run verify` for core and
`docs/agent-workflow.md` for full/Redis/browser/native boundaries. Do not create
new fake native multiplayer integrations: web authority lives in the Node service;
native local simulation and HTTP decisions are a different boundary.

Accept a workflow only when every selected stage has scoped evidence and all
required approvals are recorded. Missing evidence means incomplete, not pass.
Rollback the owned pilot, validate restoration and leave the ledger open for any
remaining required work. No merge, deployment or public release is implied.

## Examples and validation

Use the [world-workflow fixture](../../../docs/level-design/skill-suite-fixtures.md#world-workflow)
for a successful-use example and a failure case. Execute its inspection scenario
before claiming skill validation; follow the fixture's proof limits.
