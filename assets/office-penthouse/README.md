# Jevica's penthouse: asset package (#362)

Original furnishings for the penthouse layout `office-penthouse-1`. They are exported from their JS
master, `preview/src/office-penthouse-furnishings.js`, which the game renders directly.

- **No kit art and no kit bytes.** The desk footprints are the supplied kit's measured colliders,
  imported as numbers only (R19, Val, 2026-10-15).
- **Original placement.** The lounge, meeting, terrace and planting footprints are this package's own.
- **No generated or purchased imagery.** The three surfaces are seeded, tileable noise.

## Files

| Path | What |
| --- | --- |
| `models/<asset>.glb` | One asset in its own frame. Its nodes are `LOD0` and `LOD1` (meshes named `<asset>_LOD<n>:<finish>`), a `COL_<asset>` box on its footprint, and its anchors (`SEAT`, `SEAT_1`, `SCREEN`). |
| `office-penthouse.glb` | The placed office: the shell, every furnishing as its own named node, `COL_<id>` proxies on the plan footprints, `SCREEN:<display>` and `SEAT…:<seat>` anchors, and the five lamps as punctual lights. |
| `office-penthouse.blend` | Editable Blender project made from the placed GLB, packed. Collections follow the visibility groups, `COL_*` are wire-only and never render, and the review cameras are O1–O4. |
| `textures/*.jpg` | The shared surfaces: travertine, rose stone and wood. sRGB, 512 px, the same images the GLBs embed. |
| `materials.json` | One material per finish, with its PBR parameters, tint rule and surface. |
| `export.json`, `blender.json` | Receipts: hashes, the browser reimport of every GLB, and the Blender import counts. |

The manifest entries (id, version, zone, paths, SHA-256, dimensions, pivot, LODs, collision,
anchors, provenance, owner) are in `docs/design/office-ipic/asset-manifest.json`, with the ids
`repo-penthouse-*`.

## Conventions

- **Units and axes.** Metres. The GLBs are Y up, with −Z into the office (d), so the plan's `(x, d, h)`
  is Three.js `[x, h, -d]`. In the `.blend`, Z is up and +Y is d.
- **Pivots.**
  - Floor pieces pivot at the centre of their footprint, at floor contact.
  - Wall pieces pivot on the wall face at floor level.
  - Pendants pivot at the drum's centre.
- **Front.** A seat faces +d; a display's screen faces −d, toward its sitter.
- **Transforms.** Applied: mesh nodes carry no transform of their own.
- **UVs.** Metric box projection: wood grain runs along a part's length, and stones are 1.2 m (travertine) or 1 m (rose stone).
- **Normals.** Outward. Leaves, grass and lamp shades are double-sided open surfaces.
- **Screens.** Each display surface uses the material `SCREEN_DYNAMIC`: dark, neutral and idle, with no content. The
  displays never show private desk text, agents or remote desktops.
- **Collision.** The server's numbers in `preview/src/office-layouts.js` are authoritative. The `COL_` proxies copy
  them, and the art stays inside them. The botanical canopy and the pendants overhang walkable
  floor only above the tallest body plus 0.3 m.
- **Runtime batching.**
  - A repeated piece is one instanced draw per finish.
  - One-off pieces are one static draw per finish and visibility group (`furnishings:main-floor`, `:terrace`, `:mezzanine`).
  - Each piece keeps its plan zone, so `preview/tests/office-penthouse-graybox.test.js` holds every piece to its footprint.

## Rebuild

```sh
node scripts/export-office-penthouse.mjs export                           # GLBs, textures, materials, reimport, captures
/Applications/Blender.app/Contents/MacOS/Blender --background \
  --python scripts/export-office-penthouse-blender.py -- --render          # .blend and Blender-preview stills
node scripts/office-ipic-reference-index.mjs --write-penthouse            # manifest entries
node --test scripts/tests/office-penthouse-assets.test.js preview/tests/office-penthouse-*.test.js
```

A change to the plan makes the package stale: its `planDigest` no longer matches, and
`scripts/office-ipic-reference-index.mjs --check` fails until the package is re-exported.
