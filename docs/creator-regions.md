# Creator region packages

The publishing and region editor controls require both `VITE_WORLD_MAP=true`
and `VITE_CREATION_TOOLS=true` before development starts or the frontend is
built. Both flags default off; account permissions still apply when enabled.

Jevica can publish a region from **Explore → Publish a world**. Choose
**Design a region** to create one on a map, or upload a JSON file. The studio
edits terrain height samples, roads, buildings, walk-in venues and homes, named land parcels, trees, arrival, and named
places. Click a tool and the map to add an item; choose **Select** and click
an item to edit its fields or remove it. A road takes two clicks to start and
more clicks to extend. **Use this region** attaches the draft to the publish
form. The draft remains on this browser device, and **Download JSON** exports
it for backup or further editing. Choosing a JSON file and then opening the
studio imports it into the map editor.

The published world gets a permanent `?world=<id>` link, its own
shared room, and its own terrain, roads, buildings, interiors, trees, and named places.
Guests can visit; only Jevica can publish, build, or grant wishes. Start from
the [sample package](../preview/public/data/sample-region.json).

The package has `schema_version: 1` and these fields (optional fields are marked):

| Field | Format |
| --- | --- |
| `bounds_m` | `[west, south, east, north]` in local metres; each side 40–512 m |
| `terrain` | `width`, `height` (5–65 each), and row-major `heights_m` with one height per grid cell, from south to north |
| `spawn` | `[x, north]`, a walkable arrival point |
| `roads` | 1–64 named roads with unique slug `id`, `kind` (`residential` or `footway`), `width_m`, and 2–128 `[x, north]` points |
| `buildings` | Up to 80 structures with unique slug `id`, `center`, `size: [width, depth, height]`, `yaw_deg`, and `kind` (`retail`, `residential`, or `parking`) |
| `buildings[].interior` | Optional on up to eight buildings at least 6 × 6 m. `name` (1–64 characters), `category` (`art`, `clothes`, `restaurant`, or `wellness` for retail; `home` for residential), and `entrance` (`south`, `east`, `north`, or `west`) select a walk-in room and its door on that face of the building. Residential homes may set `access` to `owner` for Jevica and invited visitors, or `public` for everyone. Omitted `access` is public. |
| `buildings[].interior.generation` | Optional versioned levels for a retail venue or home. `version: 1` and `levels` (1–8) are required when present; `seed`, `levelSeeds` and `overrides` are optional. The building must have enough height and entrance clearance for the requested stack. |
| `buildings[].interior.space` | Optional on a retail `restaurant` venue, instead of `generation`. `id`, `revision` and `sha256` name one reviewed furnished-space revision; nothing else is accepted. See [approved furnished spaces](#approved-furnished-spaces). |
| `trees` | Up to 256 trees with unique slug `id`, `position`, `height_m`, and `crown_radius_m` |
| `places` | 4–64 named spots with unique slug `id` and `position` |
| `parcels` | Optional list of up to 32 named, nonoverlapping rectangular plots. Each has `id`, `name`, and `bounds_m: [west, south, east, north]`; each side is at least 6 m. `owner_id` may name an account. |

All coordinates use the same local metre system. The terrain grid spans the
full bounds. Points must stay at least one metre inside the bounds, and whole
building footprints must fit there. Height samples must be between -50 and
500 m. The road, tree, and building dimension limits are checked on upload;
the [compiler](../server/region-package.js) is the exact format authority.
The complete publish request is limited to 128 KiB. Region IDs are unique
across roads, buildings, parcels, trees, and places.
The studio's **Parcel** tool takes two opposite corners. Jevica can assign an
unassigned plot to her account or an accepted contact in the inspector. The
owner account ID is stored with the published region and retained in revision
drafts and version history. The world map shows parcel boundaries and tells
the signed-in owner **Your parcel**. Ownership is descriptive for now: it does
not grant building, furnishing, wish, home-entry, or publishing permission.
The entrance face is chosen in the building's local footprint, then rotates
with `yaw_deg`. Publication rejects an interior without a safe indoor arrival and
an outdoor exit.

### Generated interiors and levels

Add `generation` to a building's existing `interior` to request a reproducible,
multi-level plan. For example, the sample region's `moon-pavilion` can use:

```json
{
  "name": "Moon Pavilion Gallery",
  "category": "art",
  "entrance": "south",
  "generation": {
    "version": 1,
    "seed": "moon-gallery-01",
    "levels": 2,
    "overrides": [
      { "targetId": "moon-pavilion/l0/finish/floor", "material": "concrete" }
    ]
  }
}
```

The building's stable ID supplies the seed when `seed` is omitted. An explicit
seed is 1–128 characters, starting with a letter or digit and then using only
letters, digits, `_`, `.`, `:` or `-`. `levelSeeds` may assign the same kind of
seed to an individual level index, such as `{ "1": "gallery-upper-02" }`.
Only indexes below `levels` are accepted. Regenerating one untouched level
changes its finish choice without changing its floor, portal or object IDs.

`overrides` may contain at most two entries per level, each with a unique
`targetId`. Version 1 accepts the generated `building-id/lN/object/wall-display`
slot for a local two-coordinate `position` and/or `material`, and
`building-id/lN/finish/floor` for `material` only. Materials are `limestone`,
`oak`, `terracotta` or `concrete`. The server checks moved fixtures against the
building footprint, entrance aisle and vertical landing. Edited levels cannot
be regenerated until their overrides are explicitly reset in World Studio.

The server derives the plan from the building ID, center, rotated footprint,
terrain elevation, entrance, seed and generator version, then stores an approved
SHA-256 digest. It rejects impossible floor stacks under the authored roof and
does not accept client-invented doors or collision. Keep a published world's
seed, primitive and overrides when revising it; changing them is an explicit
region revision subject to compatibility checks. A legacy `interior` without
`generation` retains its existing single-room behavior. [World Studio](world-studio.md)
provides previews, level and layer controls, authored edits, undo and export
before publication.

### Approved furnished spaces

A restaurant venue can place one reviewed furnished space instead of a built-in or
generated layout. The pilot offers one: **Corner Café, revision 1**, the World Studio
template Val accepted on 2026-10-17 (#418). In the region editor, select the building
and choose it under **Furnished layout**. In a package file, give the building's
interior a reference:

```json
{ "name": "Corner Café", "category": "restaurant", "entrance": "south",
  "space": { "id": "corner-cafe", "revision": 1,
    "sha256": "ab210ecbd57ea7bfb00fb549832b3f33e05aa36d19c757b56bc88f166f6ad5ef" } }
```

The reference is all the region carries. The server resolves the layout from the
repository's reviewed record (`preview/src/approved-spaces.js`), never from the
upload, and refuses an unknown revision, a digest that doesn't match it, or assets
that changed since its review. Approval or profile claims in the file are refused
as unknown fields. Private Studio documents can't be published this way.

The reviewed doorway is placed on the building's mapped entrance with one rigid
turn and shift; nothing is resized. The building must hold the 16 × 12 m café floor
behind that face, at least 16.2 m wide and 12.1 m deep. The terrace, its furniture and the
arrival stand outside the facade on level ground (within 5 cm of the doorway's
height), clear of roads and their drawn curbs and sidewalks, trees, other buildings,
other parcels, arrivals and named places. Publication then walks every required route with the game's own movement:
from the arrival to seating, service, preparation and the terrace and back, and
from the arrival to the nearest street. Any failure leaves the region unpublished
and names the rule, for example `approved_space_fit` or `approved_space_route`.

Visitors and the server use the same compiled plan: the café's furnishings are its
collision and its rendering. Walking, entry, exit and reconnecting work as in other
venues; the café has no residents, and its furniture offers no seating or other
actions yet. A world with an approved space needs the current browser: an older
page gets **Refresh** for that world and can still visit every other world.

Only the world's owner can place an approved space in a revision. Applying a
revision checks the reviewed record again, and the commit itself refuses a revision
that has been revoked in the catalog meanwhile, leaving the previous world live.
Revocation stops new placements and revisions that keep the café; a world already
showing it keeps it until its owner revises it away. Creations can't be placed where
they would block the café's routes.

The server validates and compiles the package once, then stores the compiled
world and its SHA-256 digest alongside its catalog entry. The browser and
shared simulation load that same compiled geography. A damaged or missing
region fails closed. Jevica can open a published region in the studio, save a
private versioned draft, and apply it to that same world ID. Applying checks
existing creations against the revised map and refuses a layout that would
strand them. Visitors reconnect into the revised region; active NPC wishes
reset while chat, account preferences, inventory, and valid creations survive.
The last eight published region versions are retained in Redis. Jevica can load
one into her private editor, save it as a new revision draft, then apply it
through the normal compatibility checks. Retail venues and residential lounges
use bounded built-in layouts and are entered through server-checked doors.
Homes have a sofa, bookshelves, artwork, and residents. Jevica can reserve a
home's entry for herself in the studio, then invite accepted contacts from the
People panel. Each home allows up to 16 invited accounts. Invitations survive
reconnects and compatible region revisions; revoking one moves a guest outside.
Entry does not grant building or wish permissions. Other visitors may still
arrive outside the home.
With Build & decorate, Jevica can place, move, save, and remove creations inside
homes as well as outdoors. New lounge chairs and side tables can be placed in
either area. The server keeps furniture clear of room walls, built-in fixtures,
other creations, visitors, and the doorway. Retail interiors remain unavailable
for building. Home creations survive reconnects and compatible region revisions.
New saved designs belong to Jevica's account and can be placed in other published
worlds where the local placement rules allow them. Older designs stored in one
world can be copied into the account library from Saved designs.
This entry rule does not hide the home or its residents from world data.
Region packages do not yet support custom meshes, textures, scripts, multiple
rooms per home, or owner-managed parcel permissions. Live creations and
wishes remain scoped to the published world and to Jevica's permissions.
