# Shared skill safety and validation contract

Applies to all skills listed in [the index](../level-design-skills.md). Read each
skill's specific inspection, output and acceptance rules alongside this contract.

## Preconditions and inspection

Record task intent, authorized scope, scene/runtime/revision and dirty state,
reference/source IDs, active controller and available tools. Read the owning
source and scoped AGENTS.md before edits. Missing required inputs or unavailable
runtime evidence means the affected acceptance item is incomplete. Reversible
assumptions may support a proposal, but never become measurements.

Use meters for design; preserve east/north/up → native east/south/up centimeter
conversion. Read actual dimensions, do not assume a standard person. At audited
revision `5b26f3a`, the native pawn initializes radius 35 cm and half-height 80 cm,
with camera relative Z 80 cm; camera world height depends on the pawn datum.
Re-read `RiverStreetPawn.cpp` before using these values. Keep collision, visual
stature and eye height distinct. Use scale buddies, grids and player-height views.

Inspection produces findings and proposed changes. It does not alter scenes,
import assets, enable expensive rendering, call paid services or publish media.
Every finding names observed facts, hypotheses, expected behavior and evidence.

## Modification and recovery

For authorized edits, capture baseline revision/diff, values, source/generator,
scene/asset IDs and recoverable local copies of ignored binary assets. Verify
copies exist and can be opened before risking the original. Keep copies outside
shipping assets and never include `.env` or private runtime state. A commit hash
cannot restore untracked maps. Start with one representative area.

Keep inspection and modification as separate report sections. Request approval
for destructive, broad or expensive changes unless the session already grants
that exact scope. Rebuild means a retained alternative, never permission to delete.
Preserve intentional stylization and accessible route/contrast cues. Validate the
blockout before detail and respect asset licenses before reuse.

Rollback restores only owned changes from the recorded baseline, including
settings/material overrides and generated source. Inspect current edits before
restoring; preserve concurrent changes and never run blanket reset/clean. Reopen
restored assets and repeat the baseline route/view. For an inspection-only task,
rollback consists of removing temporary helpers and restoring diagnostic settings.

## Acceptance, failure and evidence

Return pass/fail/not-tested/unsupported per check, with exact command or manual
procedure, actual result, runtime/revision, artifact path and proof limit. A
failed required check blocks readiness; unavailable evidence leaves it incomplete.
No acceptance status may exceed its evidence:

- Source/unit tests establish only the tested source behavior.
- Matched metadata enables comparison but does not establish visual quality.
- Screenshots support visual observations, not collision, multiplayer or cost.
- Movement evidence needs actual geometry/query hits and attempted traversal.
- Shared behavior needs server and client evidence; native local play does not
  prove replication. Keep live auth separate from local fixture identities.
- GPU claims need named target hardware and a repeatable timed workload.
- Visual judgment requires rendered/manual review; preserve reviewer and scope.

Use each [representative fixture](skill-suite-fixtures.md) as a small successful
and adversarial inspection scenario. Record your actual decisions and artifacts,
not only expected answers. These tabletop tests assess instructions and evidence
boundaries. They do not execute a game, validate an editor integration, or prove
that a future agent will reliably follow the skill. For modifications made using
these skills, run focused behavioral checks and repository gates, then the real
runtime/manual checks the modified behavior needs. Never mark a skill's future
runtime task complete based on its synthetic example.

Related skills are linked from their entrypoints and composed in
[World Workflow & Evidence](../../.agents/skills/world-workflow/SKILL.md).
