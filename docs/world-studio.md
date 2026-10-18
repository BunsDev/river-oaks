# World Studio

World Studio is the custom Three.js editor for creator regions. Open **Settings →
Open World Studio** in the game, or **Game → World Studio** in Electron. Its direct
path is `/studio.html` (`/studio` on the hosted clean-URL route). The existing
approved-account gate applies. The editor uses the browser renderer inside the
Electron shell; Unreal is not required for this authoring loop.

## Furnished spaces

Choose **Space templates** for four building-sized scenes: **Courtyard House**,
**Garden Office**, **Atelier Boutique** and **Corner Café**. Each contains editable
walls, glazing, floor zones, furniture and small decorative objects. The house
includes living, kitchen, bedroom, bathroom and patio areas; the office has
reception, workstations, meeting and kitchenette areas; the boutique has displays,
checkout and fitting rooms; the café has service, preparation, seating and terrace
areas. These are original proposed layouts in metres, not surveyed buildings.

Select an element to edit its dimensions, position, rotation, elevation, catalog
kind or material finish. **Add furnishing** inserts a chair that can be changed
with the inspector. Select **Lighting** in Scene objects for Daylight, Warm or
Evening. Agent chat can propose the same edits as one undoable batch. Agent chat
still needs the desktop app and its existing provider consent.

**Walk through** starts outside the entrance and uses wall and furniture footprint
collision. You can enter the space and walk between its rooms; furniture is visual
and does not simulate opening cabinets, cooking or other household activities.
The overhead view leaves the roof open for editing. Finish presets and built-in
geometry improve material and shape detail, but photorealism remains a visual
acceptance target, not a guarantee from automated tests.

Desks, chairs, pendants and plants are drawn at true size, so resizing one keeps its legs,
frame and rounded edges in proportion instead of stretching them. A pendant whose
footprint is at least twice as long as it is wide becomes a linear fitting on two
cables; others get a round shade. Plants have a tapered pot and leafy clusters on
their upper stems, from a café table vase to a floor plant. Interior concrete is a polished slab with
saw-cut joints every 4 m, and floor-standing glazing sits in a base shoe. Furnished
spaces reflect a neutral room, so glass and brass read as glass and metal, and the
Evening preset dims the sky as well as the sun. Saved v1 files are unchanged and pick
up the new forms when opened. The forms' catalog records, with measured size and
cost, are in `docs/design/garden-office/asset-manifest.json`; refresh them with
`node scripts/garden-office-manifest.mjs --write` after reviewing a change to
`space-furniture.js`.

The bed is drawn at true size as well: a timber frame, an upholstered headboard, a
mattress, a duvet that hangs over the sides and foot, a folded sheet, two pillows and a
throw, all in a soft textile finish that stays inside the bed's footprint at any size.
Cabinet, counter and sink doors and worktops keep crisp true-size edges however long the
run. Floor textures repeat at real unit sizes: terracotta is herringbone brick about
24 cm long and limestone is laid in 30 cm rows. Stone tables, worktops and basin
surrounds are one slab, never paving. A sink's worktop is at 0.77 of its height, so a
1.17 m sink meets 0.9 m kitchen cabinets.

Shelving is drawn at true size too: thin boards about 36 cm apart over a recessed kick,
bays at most 0.9 m wide, with folded garments and lidded boxes on some shelves. A few
variants come from finish and proportions rather than new fields. A cabinet in limestone,
concrete or terracotta is a solid display plinth. Raised glazing no deeper than 6 cm and
at least 0.8 m tall is a silvered mirror. Raised glazing deeper than 0.3 m, standing on a
counter, is a glass display case with a shelf and pastries. The other glazing stays clear
glass. Tables share the desk family: a 30 mm top on 45 mm legs with aprons, true-size at
any length. A cabinet, counter or appliance shows its doors and controls on its front, so
turn a service counter 180° to give customers a closed front.

Space files use `document_type: "studio-space"`, are limited to 128 KiB and 160
objects, and export as `world-studio-space.json`. Save, reopen, import and undo work
as for regions. They are private Studio documents; the shared-world region
publisher does not accept this format. Existing schema-v1 region files remain
compatible, and **New region** still starts the original region workflow.

New templates select their **Assessment program** explicitly. Accepted inspector
edits, completed drags and agent batches must preserve routes from arrival to the
program's required destinations and back to its exit. A blocked edit leaves the
accepted draft and undo history unchanged. The finding explains the route and
lets you select a changed or nearby furnishing in the inspector to repair it.
Dragging previews changes only the view; Escape cancels the drag. A valid final
agent batch is one undoable edit even when its intermediate layout blocks a route.

The selected program and its version are saved **on this device**, alongside the
v1 document. Bare JSON export contains only the v1 document, so importing it shows
**Not assessed** until you explicitly select a program. A document's name never
selects its program. Unknown or newer program versions cannot report a pass;
select a current program to reassess. These checks are local layout guidance, not
shared-world publication approval or a guarantee of visual quality.

An old draft can open, save and export even when newly selected route rules find
a problem. Repair it to accept a guided edit; undo can return to the recoverable
draft and shows its findings again. Required destination roles retain their IDs
and kinds, although their display names can change. **Restore required furnishings**
recovers missing roles from the selected template as one checked, undoable edit,
preserving other furnishings. Checks keep the viewport responsive and leave
changes pending until a result arrives. Failed assessments offer **Retry assessment**. Fixed recipe destinations
remain required when furniture is moved. A work-limit result is blocked, never
a pass; simplify the layout and assess again.

## Build a region

Start with **New region**, **Open JSON**, or the saved device draft. The initial
region contains a path, four meeting places, and an arrival point. Add a building,
tree or place from the scene panel. Select through that panel or click an object
in the viewport. **Frame selection** moves the camera close enough to edit it.

Select a retail or residential building to open **Generated interior** in the
inspector. **Preview level 0** derives a floor from that building's fixed ID,
footprint, center, yaw, terrain elevation and entrance. **Apply preview** adds
the versioned generation fields to the region draft. Increase the building's
height explicitly before using **Preview add level** where another floor needs
roof clearance. The preview lists the resulting level elevations and shell,
partition, fixture, finish and override layers. Undo, redo, save, reopen and
export preserve the level count; an impossible stack leaves the draft unchanged.
Use **View level** to replace the selected building's exterior block with its
generated floor footprint, stair opening, perimeter, display fixture and finish
in the viewport. The layer checkboxes control preview visibility; they do not
change saved collision or the published plan. **Show exterior** restores the
block. Walk through still uses the exterior collision blockout.
The editor uses a provisional world ID for preview finishes. Publication assigns
the final world ID and validates its own server-approved plan. In a selected level,
edit the display's local U/V position and material or the floor finish, then
**Preview furnishing and finishes** and **Apply preview**. Invalid moves across
walls, the entrance aisle or the stair landing leave the draft unchanged. Orange
outlines in **Authored overrides** identify edited slots; hiding that layer only
hides the outlines. Authored finishes survive publication's world ID assignment.

**Preview regenerate untouched level** lists the finish change and unchanged
level IDs before applying a new seed to that floor alone. Geometry and object IDs
stay fixed. Levels with authored edits are locked against regeneration; use
**Preview reset level edits** to explicitly remove their overrides first. Save,
reopen, undo/redo and export retain both overrides and per-level seeds. Existing
furnished-space files retain their single-level schema and are not rewritten
merely by opening them.

- Drag to orbit, right-drag to pan, and scroll to zoom.
- **Move / W**, **Rotate / E**, and **Size / R** choose transform handles.
- **F** frames the selection. Inspector fields provide precise dimensions and
  east/north positions in metres. Buildings rotate about the vertical axis;
  trees resize by height and crown radius. Positions stay grounded.
- Move handles snap to 0.5 m, rotation to 22.5°. Invalid bounds, dimensions or
  an obstructed arrival point restore the last valid draft.
- **Undo / Cmd-or-Ctrl Z** and **Redo / Cmd-or-Ctrl Shift Z** apply to whole edits;
  one gizmo drag is one edit. History retains the latest 80 edits in this tab.

## Keep your work

**Save on device** writes one region draft in this origin's browser profile.
**Cmd-or-Ctrl S** also saves when focus is outside a property field. Reloading
reopens that draft; undo history does not survive a reload. Browser and Electron
profiles keep separate device drafts.

**Export JSON** downloads `world-studio-region.json`; Electron offers its native
Save dialog. Keep exports for backups and multiple projects. **Open JSON** accepts
an existing schema-v1 creator region package, up to 128 KiB, 256 road segments
and 8192 metres of total road length. These editor limits bound per-edit rendering
cost; an oversized import leaves the current draft intact. It preserves roads,
terrain, parcels, ownership metadata and interior descriptions. Compiled GIS
`district.json` manifests and arbitrary 3D asset files are not region packages.

A stale tab refuses to overwrite a newer saved draft. Export your local edits,
then **Reopen saved draft**. Storage failures are displayed and never reported as
a successful save. Unsaved changes prompt before replacing or leaving a draft.
Saving is local authoring; it does not grant permissions or publish to a shared
world. Existing server publication validation remains authoritative.

## Walk through

**Walk through** starts a private blockout preview at the region's arrival point.
Use WASD or the up and down arrows to move, the left and right arrows or a drag to
turn (as in the office), and Shift to move faster. **Escape**
or **Return to editor** restores the authoring camera. Editing is disabled during
the preview; walking does not change your draft or contact the multiplayer server.

For creator region files, the preview reuses the game's walking and building-footprint collision code.
Buildings are solid blockout volumes here; furnished interiors, residents and
shared-world behavior are not simulated. Roads, terrain and parcels are retained,
but this first workspace does not provide brushes or control-point editing for
them. Imported meshes, asset catalogs, collaborative editing and publication UI
remain future editor work.

## Develop and verify

Use the repository's normal authenticated development setup (`pnpm run dev` or
`pnpm run desktop:dev`), then open World Studio through the game or native menu.
No new dependency, engine installation or provider call is needed for the editor.

```sh
node --test preview/tests/studio-*.test.js server/tests/studio-assets.test.js
pnpm run test:desktop
RIVER_OAKS_E2E_REPORT=world-studio-browser.json pnpm run test:experience world-studio
node desktop/studio-e2e.js
pnpm run verify
```

The browser and Electron acceptance harnesses use the existing loopback fixture
identities. They are not production WorkOS, packaged release, human accessibility
or physical-device performance evidence. Screenshots live in
`output/playwright/world-studio-*.png`; the browser receipt is
`data/reports/world-studio-browser.json` and the Electron receipt is
`.runtime/agent/studio-desktop.json`.

For a visual review of Garden Office, capture its six player-height stations under
all three presets. Each station stands on a required route target and faces the
furnishing it serves:

```sh
RIVER_OAKS_E2E_REPORT=garden-office-stations.json pnpm run test:experience studio-office-stations
```

It writes `output/playwright/garden-office-<preset>-CAM-0N-<station>.png`.
`studio-template-stations` does the same for any template, from its route profile:
the entry, each required destination facing the furnishing it serves, and the exit.

```sh
STUDIO_TEMPLATE=house STUDIO_CAPTURE_TAG=review pnpm run test:experience studio-template-stations
STUDIO_TEMPLATE=house pnpm run test:experience studio-template-journey   # the pilot journey for House or Garden Office
STUDIO_TEMPLATE=house node preview/e2e/studio-pilot-perf.mjs            # frame times for House
```

Captures go to `output/playwright/studio-<template>-<tag>-<preset>-CAM-0N-<station>.png`.

Pilot acceptance (#417) reuses four more checks against Garden Office:

```sh
pnpm run test:experience studio-pilot-journey   # edit, refusal, undo/redo, save/reopen, stale tab, walked route tour
pnpm run test:experience studio-pilot-soak      # one warm-up plus ten open/walk/replace cycles; STUDIO_SOAK_CYCLES=N for longer
pnpm run test:experience studio-pilot-assets    # missing, late and replaced-while-loading textures
pnpm run test:experience studio-pilot-a11y      # 320/390 px layouts, keyboard-only use, focus, reduced motion
node preview/e2e/studio-pilot-perf.mjs          # vsync-off frame times, load and transfer
```

`STUDIO_TEMPLATE=house` (or `boutique`, `cafe`) runs the soak and the texture check
against another template. The texture check measures a textured floor, because stone
worktops are plain slabs. Garden Office has no textured surface left, so its case first
changes the meeting-room floor to limestone. Each case must show the texture (a blocked
texture reads differently), and once its requests finish the floor must match the normal
reading within 3 levels.

The soak samples renderer counts from the viewport's `data-render-stats` (the game's
format plus `programs`, distinct scene `materials` and the viewport's own `renderTargets`),
heap, listeners and DOM nodes from Chromium after a forced garbage collection, and
pending loads: material image requests, live route-assessment workers and pending
timeouts. Persistent by design: the shared PBR texture cache, one reflection map, the
shadow map, compiled shader programs and up to 80 undo steps. The performance profile
writes `.runtime/acceptance/perf/receipt.json`; on macOS it also records the GPU
process's physical footprint at each phase (unified memory, so not a per-resource VRAM
figure).

## World Designer

The Electron editor now offers dedicated local familiar and general design-agent paths. See [setup, scope and verification](world-studio-designer.md). Remote Cave pairing remains incomplete.

## Agent chat

The **Describe the scene you imagine…** pill opens a side chat with a World Studio
expert agent that runs through your Claude or Codex CLI. See
[agent chat](world-studio-agent.md).
