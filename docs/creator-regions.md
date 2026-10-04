# Creator region packages

Jevica can publish a region from **Explore → Publish a world**. Choose
**Design a region** to create one on a map, or upload a JSON file. The studio
edits terrain height samples, roads, buildings, trees, arrival, and named
places. Click a tool and the map to add an item; choose **Select** and click
an item to edit its fields or remove it. A road takes two clicks to start and
more clicks to extend. **Use this region** attaches the draft to the publish
form. The draft remains on this browser device, and **Download JSON** exports
it for backup or further editing. Choosing a JSON file and then opening the
studio imports it into the map editor.

The published world gets a permanent `?world=<id>` link, its own
shared room, and its own terrain, roads, buildings, trees, and named places.
Guests can visit; only Jevica can publish, build, or grant wishes. Start from
the [sample package](../preview/public/data/sample-region.json).

The package has `schema_version: 1` and these required fields:

| Field | Format |
| --- | --- |
| `bounds_m` | `[west, south, east, north]` in local metres; each side 40–512 m |
| `terrain` | `width`, `height` (5–65 each), and row-major `heights_m` with one height per grid cell, from south to north |
| `spawn` | `[x, north]`, a walkable arrival point |
| `roads` | 1–64 named roads with unique slug `id`, `kind` (`residential` or `footway`), `width_m`, and 2–128 `[x, north]` points |
| `buildings` | Up to 80 structures with unique slug `id`, `center`, `size: [width, depth, height]`, `yaw_deg`, and `kind` (`retail`, `residential`, or `parking`) |
| `trees` | Up to 256 trees with unique slug `id`, `position`, `height_m`, and `crown_radius_m` |
| `places` | 4–64 named spots with unique slug `id` and `position` |

All coordinates use the same local metre system. The terrain grid spans the
full bounds. Points must stay at least one metre inside the bounds, and whole
building footprints must fit there. Height samples must be between -50 and
500 m. The road, tree, and building dimension limits are checked on upload;
the [compiler](../server/region-package.js) is the exact format authority.
The complete publish request is limited to 128 KiB. Region IDs are unique
across roads, buildings, trees, and places.

The server validates and compiles the package once, then stores the compiled
world and its SHA-256 digest alongside its catalog entry. The browser and
shared simulation load that same compiled geography. A damaged or missing
region fails closed. Jevica can open a published region in the studio, save a
private versioned draft, and apply it to that same world ID. Applying checks
existing creations against the revised map and refuses a layout that would
strand them. Visitors reconnect into the revised region; active NPC wishes
reset while chat, account preferences, inventory, and valid creations survive.
The last eight published region versions are retained in Redis for recovery;
there is no rollback control in the studio yet. Region packages do not yet
support custom meshes, textures, scripts, interiors, or parcel ownership. Live creations and
wishes remain scoped to the published world and to Jevica's permissions.
