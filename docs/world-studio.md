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

Space files use `document_type: "studio-space"`, are limited to 128 KiB and 160
objects, and export as `world-studio-space.json`. Save, reopen, import and undo work
as for regions. They are private Studio documents; the shared-world region
publisher does not accept this format. Existing schema-v1 region files remain
compatible, and **New region** still starts the original region workflow.

## Build a region

Start with **New region**, **Open JSON**, or the saved device draft. The initial
region contains a path, four meeting places, and an arrival point. Add a building,
tree or place from the scene panel. Select through that panel or click an object
in the viewport. **Frame selection** moves the camera close enough to edit it.

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
Use WASD or arrow keys to move, drag to look, and Shift to move faster. **Escape**
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

## World Designer

The Electron editor now offers dedicated local familiar and general design-agent paths. See [setup, scope and verification](world-studio-designer.md). Remote Cave pairing remains incomplete.

## Agent chat

The **Describe the scene you imagine…** pill opens a side chat with a World Studio
expert agent that runs through your Claude or Codex CLI. See
[agent chat](world-studio-agent.md).
