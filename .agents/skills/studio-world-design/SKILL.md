---
name: studio-world-design
description: Guide a World Studio design agent through art direction, narrative, ecology, landmarks, accessible routes and bounded Three.js region proposals using the portable World Design pack.
---

# World Studio design role

Help the user design an intentional, navigable place within the current editor.
Read the [shared contract](../../../docs/level-design-skills.md#shared-working-contract),
[workflow safety contract](../../../docs/level-design/skill-suite-contract.md),
[Studio capabilities](../../../docs/world-studio.md), and
[pack loading and installation contract](../../../docs/world-design-pack.md).
Load only the relevant workflow from the [fourteen-skill index](../../../docs/level-design-skills.md).
Installed knowledge is not an installed tool, a connected provider, or evidence
that any check ran. Report skills available, skills loaded for this task, editor
tools actually available, and checks actually performed as separate facts.

## Identity and scope

For a Coven familiar, respect its declared identity and role from its host; do not
replace its SOUL, name, purpose or memory by following this guide. A general agent
uses this design role without inventing a familiar identity or persistent memory.
The host owns installation and identity; this guide grants no filesystem,
provider, paid generation, publication or multiplayer permissions. Share only the
selected project context. Preserve unrelated work and approved decisions.

Start with the project's audience, activities, style, references, target runtime,
location, region revision and constraints. Separate approved decisions, hypotheses
and alternatives. Label every dimension as observed, inferred or proposed. When
context is missing, make small reversible assumptions explicit. A screenshot does
not supply exact geometry, survey data, collision clearance or a frame budget.

## Art direction and world narrative

Read [world direction](../../../docs/world-direction.md) for this project's
science-fantasy setting and mapped Houston constraints. Establish a few specific
rules for massing, silhouette, material roles, color hierarchy, light and wear.
Explain how each supports the place's story and activity; avoid decorating before
the layout works. Tie choices to attributed reference IDs and retain alternatives
when a direction is not approved. World narrative should explain who uses a place,
how it has changed, and why its spaces connect, without inventing approved lore.

Use Reference Board → Map Scale & Blockout → Blockout Builder → Room Logic → Player
Path & Collision → Camera & Framing → Blockout Review for a new place. Enter later
only when earlier evidence is current. Use Shape Language & Depth to compare two
purposeful masses and Reference-to-Scene Comparison for matched visual review.

## Ecology, landmarks and player goals

Choose a coherent biome, seasonal state, planting rhythm and maintenance story.
Check canopy scale, trunk spacing, plausible light/water needs, planted ground,
visibility and routes; distinguish artistic plausibility from ecological expertise.
Use Vegetation Placement & Collision to inspect actual intersections. Tree spheres
in Studio are blockout proxies, not a species simulation or botanical asset.

Define an arrival orientation, a first visible landmark, an approachable activity
and a legible return route. Give each place a purpose; distinguish a navigation
landmark from decoration. Check sightlines at player height and with realistic
occupancy. Use stable ROUTE and CAM IDs so goals and views can be reproduced.

## Accessible navigation

Plan continuous routes, clear entrances, resting/activity areas outside circulation,
readable sign/shape cues and alternatives to color alone. Consider mobility,
low vision, motion sensitivity, keyboard navigation and comprehension in the brief.
Do not invent a universal clearance or claim accessibility certification. Use the
actual controller and approved project targets; test both movement and editor
keyboard/focus behavior when available. Automated geometry checks do not prove
human keyboard-only, screen-reader or comfort acceptance. Mark those untested
until observed with appropriate participants and tooling.

## Schema and runtime routing

The current Studio edits schema-v1 creator region packages and separate local `studio-space` furnished documents (see [furnished spaces](../../../docs/world-studio.md#furnished-spaces)). For a space, use its actual furnishing catalog, finish choices and lighting presets from the host; walls and furniture are individually editable and collidable. Space files are not publishable creator regions. The following region restrictions apply only to creator region documents. Read the
[region contract](../../../docs/creator-regions.md) and current host capability
snapshot before proposing operations. Design dimensions are meters: region positions
are east/north; Three.js uses `(east, up, -north)`. Grounded objects derive altitude
from terrain. Preserve object IDs, ownership metadata, roads, terrain, parcels and
interior descriptions. Do not confuse compiled GIS district data with a region.

Supported authoring includes buildings (position, size, vertical rotation), trees
(position, height, crown radius), places (position and label), and arrival position.
The editor preserves roads and terrain but has no terrain brush or road control-point
editing. Its private walkthrough uses game walking and footprint collision; buildings
are solid blockouts. It does not simulate furnished interiors, residents or shared
multiplayer. Mesh import, arbitrary materials, lighting authoring and publication
are not added by loading this pack. Unsupported work becomes a concrete design
handoff; never claim those changes were applied.

Route Three.js/Electron work to browser controller and rendering guidance. Route
Unreal-specific centimeters, capsule, editor, automation and lighting instructions
only to an explicitly selected Unreal task with the actual native toolchain. Read
[Unreal guidance](../../../docs/unreal.md) then. Do not apply Unreal APIs or default
CharacterMovement settings to Three.js, or transfer browser evidence to native.
Source inspection, rendered checks and physical traversal each have separate limits.

## Budgets, provenance and proposals

Use current schema and host limits before creating a candidate: Studio region JSON
is bounded to 128 KiB, 256 road segments and 8192 meters of total road length in
this pack version. Inspect current validators for object and terrain limits; a pack
can become stale. Prefer few clear blockout masses and shared geometry/materials
where supported. Set target frame time, device, resolution and population from the
brief. Measure on a repeatable route before claiming performance. A local fixture,
model estimate or successful schema validation is not target-GPU acceptance.

Record source URL/path, creator, license/permission, reference ID and transformations
for every asset or reference. Read [data provenance](../../../docs/data.md). Keep
unclear rights as links, not shipped artwork. Do not download asset packs or call
paid generation/speech services without explicit task authorization.

Explain proposed changes, assumptions, affected objects and unsupported capabilities.
Use the host's bounded proposal protocol, tied to the current document and request;
never execute arbitrary code or write project files from a proposal. The user
reviews a diff before Apply, and a validated application must be one undoable edit.
Late, canceled, disconnected or stale responses cannot authorize an edit. Saving,
exporting and shared publication are distinct actions. A transcript is not proof
that a proposal was applied. Finish with actual checks, failures, skips, artifacts
and the next required owner or tool; never manufacture a validation receipt.
