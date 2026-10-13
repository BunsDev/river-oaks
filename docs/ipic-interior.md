# IPIC River Oaks interior

The IPIC destination now has a connected reception, two escalator runs, mural
landing, upper lounge and Tuck Room bar, cinema entrance and one furnished
auditorium. Enter IPIC from the existing destination controls or street door.
Walk up either clear escalator lane. At the top, the passage along the left
wall leads around the lounge furniture into Theater 1. Choose a nearby recliner
in the seating control, or press Z; Z stands up. Walk back down to the street.

## What is factual and what is inferred

The 44 original user photographs are in `assets/ipic/references/`, with SHA-256
hashes in `manifest.json`. They control the visible color/material direction,
reception desk, bronze lift doors, glass escalator rails, book-spine mural,
red patterned carpet, lounge furniture, hanging pendants, bar, floral artwork
and cognac recliners. Generated concept images were not used as reconstruction
or photogrammetry inputs. No external stock model or paid generation was used.

This is a playable **photo-guided reconstruction**, not a survey or a verified
pixel-perfect match. The 13 m frontage, 34 m interior depth, two 3 m rises and
sample eight-seat auditorium are authored estimates fitted inside the existing
mapped footprint. The rooms use a sequential circulation layout to preserve
the current shared movement contract, which has one support height per XY.
The actual venue's stacking, room adjacencies, floor heights, hidden spaces,
seat count and accessibility routes require measured references before a
literal architectural reconstruction. The brass lift doors are visual only;
public traversal currently uses the escalator slopes. Treads are static.

| Zone | Principal photos | Implementation |
| --- | --- | --- |
| Reception and entrance | IMG_9734–9741, 9777–9779 | Marble desk, fluted backing, limestone floor, signage and bronze lift |
| Escalator runs | IMG_9742–9751, 9768–9776 | Two continuous support slopes, steel treads, glass/metal rails and stone |
| Mural landing | IMG_9746–9748, 9771 | Original IMG_9771 texture with authored mesh UV sampling |
| Upper lounge | IMG_9752–9755, 9758 | Sofa, cognac tub chairs, oval table, pendants and script sign |
| Tuck Room bar | IMG_9756–9757 | Counter, leather stools, shelves and hanging greenery |
| Cinema corridor | IMG_9759–9763 | Original IMG_9761 floral wall texture, Express hatch, theater doorway |
| Auditorium | IMG_9765–9767 | Screen, sample recliners, aisle rail and guide lights; layout inferred |

Photographic artwork textures retain the source photos' baked light/perspective
and any visible occlusion. Timber, carpet and marble are procedural material
approximations. The movie screen uses a plain illuminated surface, not a movie
frame. No CC0 license is asserted for third-party artwork or venue marks.

## Source and assets

- `preview/src/ipic-plan.js`: dimensions, support heights, obstacles, seats and
  reference camera targets. Pure JS shared by browser and server.
- `preview/src/ipic-interior.js`: reproducible modular geometry, merged by
  zone/material and indexed to reduce exported size.
- `preview/src/ipic-materials.js`: finishes and original photographic textures.
- `preview/public/assets/ipic/ipic-interior.glb`: reusable metre-scale game mesh.
- `assets/ipic/ipic-interior.blend`: editable packed Blender project, zone groups,
  material nodes, four reference cameras and review lighting.

The live district builds the same authored scene through `buildStoreInteriors`;
it does not download an additional copy of the exported GLB. The GLB is for
external DCC/native import and reuse, with embedded textures capped at 1536 px
for a compact handoff. Original reference photographs remain full resolution.
GLB coordinates: +X across frontage,
+Y up, -Z into venue. Blender imports this as Z up, +Y into venue. Place it at
the existing room facade transform; avoid applying that transform twice.
Blender is an editable handoff generated from the JS master. To make edits
persist in the live game, update the JS master and regenerate; arbitrary manual
Blender edits are not automatically round-tripped into JS.

## Rebuild and review

From the repository root, after the normal locked dependency install:

```sh
node scripts/export-ipic.mjs
blender --background --threads 2 --python scripts/export-ipic-blender.py
node --test preview/tests/ipic-*.test.js server/tests/ipic-interior.test.js
node preview/e2e/ipic-runner.mjs
pnpm run verify
```

The export/visit runners own authenticated loopback fixture servers and acquire
the repository browser lock. `IPIC_CHROMIUM=/absolute/path/to/browser` can select
an installed compatible Chromium executable if the pinned browser download is
unavailable. Never point these fixture identities at a production server.
The model review page is `/e2e/fixtures/ipic.html` on the local fixture server;
buttons frame the recorded reference views and dragging orbits the model.

Export review images and JSON receipts go to `output/playwright/ipic/`.
The production visit uses the existing software acceptance mode; this proves
controls and server behavior, not material fidelity. Material views are
captured separately with real Three.js materials. This host's software browser
is not evidence of target-device performance, human accessibility or Unreal
integration. Verify the native runtime separately before shipping there.

## Recorded review

The five material views and machine-readable receipts are in [ipic-review/](ipic-review/).
These renders show the authored approximation; compare against the original
photos before accepting architectural fidelity.

![Upper lounge model review](ipic-review/lounge.png)
