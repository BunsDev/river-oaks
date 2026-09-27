# Debug tools

Press **F3** in the browser or the desktop app to open the debug panel. You can also add `?debug=1` to the URL, or dispatch `river-oaks:debug` on `window` (the desktop View menu can send this). The panel remembers which overlays were on and whether it was left open. The tools ship in every build, as a separate chunk loaded the first time you open them.

| Overlay | What it shows | Use it to check |
| --- | --- | --- |
| Building colliders | Red fences on every `collisionPolygons` ring, standing on the ground under each corner | Walls line up with the rendered facades; nothing floats or sinks |
| Walkable grid | `isFree` sampled every 0.5 m within 24 m of you: green free, red blocked | Where you can actually walk, including store rooms and Force-placed objects |
| Ground triangles | The registered support triangles feet and wheels stand on, within 24 m | Ground height follows the rendered roads, walkways and kerbs |
| Source map | Mapped road centrelines and half-width edges, building footprints, door posts with an outward arrow, and visit points | The rendered district matches the source data and doors face the street |
| Store rooms | Interior pockets (blue) and the fixtures that block them (orange) at floor height | Rooms sit inside their buildings and fixtures match the furniture |
| Flight clearance | Roof outlines at the height the bubble must stay above | Flight limits match the roofs |
| Skeletons | Bones of every rigged person within 40 m | Rig alignment and posing |
| Wireframe scene | Every mesh drawn as polygons; turning it off restores each material | Mesh density and hidden geometry |
| X-ray overlays | Overlays draw through walls and floors | Colliders and rooms hidden behind geometry |
| Polygon inspector | Click any surface: the mesh's wireframe and bounds, the picked triangle outlined with its normal, and its path, type, triangle and vertex counts, instances, materials, size and face area | Where polygons come from and whether a face points the right way |

The cursor readout under the toggles traces the view ray onto the game's own ground model. It shows east/north, ground height against the raw terrain, whether that spot is walkable, and which store room it's in. **Heaviest meshes** lists the visible meshes with the most drawn triangles; click a row to inspect that mesh.

Overlays never feed the ambient-occlusion pass (`userData.aoExclude`). They are rebuilt only while shown: world-wide layers when the district loads, local layers when you move more than 3 m. `preview/e2e/debug-tools.js` exercises every overlay, the cursor readout, the inspector and wireframe restore through real input.
