# Legacy starter districts

Five original synthetic layouts retained for JSON import in World Studio. The primary **Space templates** picker now offers a house, office, boutique and café; see [furnished spaces](world-studio.md#furnished-spaces). These are editable blockouts,
not replicas of Houston districts or finished environments. All dimensions are
proposed metres. No downloaded assets or external artwork are included.

## Start in two minutes

1. In World Studio, export any current work you want to retain.
2. Use **Open JSON** and select one of the files in
   `preview/public/data/starter-districts/`.
3. Select a building in Scene objects and use **Frame selection**. Change one
   dimension or move it with the handles. **Undo** restores an ordinary edit.
4. Use **Walk through** to inspect the district from arrival. Return with Escape.
5. **Save on device** keeps one local draft; **Export JSON** keeps a separate file.

Opening a template replaces the working document as an undoable edit,
just like Open JSON. Unsaved changes require confirmation. It never saves over
the device draft automatically or publishes a shared world. A canceled chooser
leaves the document unchanged. Export before replacing a draft you want to keep.

## Choose by activity

| District | Spatial idea | Good for | First edit |
| --- | --- | --- | --- |
| Market Street | Six shops flank one pedestrian spine; a larger hall terminates the view | Browsing, cafes, small vendors | Resize one shop while keeping the promenade clear |
| Garden Neighborhood | Six low homes surround a planted loop and central green | Quiet social spaces, small residential communities | Reposition a home outside the loop |
| Arts Courtyard | Gallery and studio wings frame an open sculpture court | Exhibitions, workshops, gathering | Vary the gallery height or rename exhibition stops |
| Civic Square | Two broad walking axes meet between four pavilions and a tall hall | Public events, orientation, community services | Establish the hall silhouette |
| Innovation Campus | Two connected garden courts serve eight workspaces | Learning, collaboration, workplace communities | Change one workspace height |

Each district is 160 × 160 m with flat terrain, a south arrival and at least four
named destinations. Paths are 4–8 m wide; building and tree placement keeps the
full path width clear. These are design targets, not accessibility certification.
North is up in the plan cards. Dark rectangles are buildings, circles are tree
canopies, pale lines are paths, and the orange dot is arrival.

## Design and customization limits

Buildings have purposeful slug IDs (such as `market-hall` and `public-hall`).
Civic and campus buildings use the schema's retail massing category; that category
does not provide an actual library, laboratory, job simulation or furnished room.
Named places are navigation markers, not furniture. Tree canopies are proxies.
The templates intentionally omit interiors and account ownership.

Keep the main routes, arrival and meeting areas unobstructed when enlarging
buildings. Preserve the low-to-tall hierarchy and the visible destination at the
end of each approach. Roads and terrain can be imported and preserved, but this
version of World Studio has no path-control-point or terrain-brush editing.

## Verification

`node --test preview/tests/studio-templates.test.js` validates all five packages
through the actual editor and server compiler, checks independent copies and
edit/undo/export roundtrips, then checks route graph connectivity, destination
placement, building separation and sampled full-width path clearance.

The World Studio browser journey now covers the four furnished spaces, rendered
views, Escape/focus recovery, unsaved-change cancellation, narrow layout and
preservation of the saved device draft. The legacy packages retain unit coverage. These checks do not establish human accessibility,
production publishing, provider authentication or native Unreal acceptance.
