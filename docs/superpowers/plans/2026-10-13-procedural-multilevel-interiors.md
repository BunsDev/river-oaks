# Building-anchored procedural interiors and levels

**Status:** Design guide. Val's subsequent long-running goal authorizes implementation; the live execution record is `2026-10-13-procedural-interiors-implementation.md`.

**Objective:** Generate reproducible, walkable interiors from a building primitive's footprint and coordinates. Allow a building to gain additional floors and optional authored layers without moving its entrance, losing saved edits, or making clients disagree about collision. Deliver the shared district first, then use the same contract in World Studio.

**Owned file:** This plan. **Branch/worktree:** `docs/procedural-multilevel-interiors-20261013` in `../river-oaks-procedural-interiors-plan-20261013`.

## Current seams

- `preview/src/store-rooms.js` derives one ground-floor room per mapped storefront from its facade and the building ring. It fits the room inside the ring and lays out fixtures in doorway-local `(a, d)` coordinates. `preview/src/district.js`, `store-interiors.js`, and `retail-interiors.js` render it.
- `preview/src/walking.js` indexes rooms in two dimensions. Its `roomAt`, `groundAt`, collision and step checks assume a single floor at each horizontal coordinate. `server/world.js` uses the same walking contract for authoritative shared movement. A second rendered slab alone would therefore be unreachable or unsafe.
- A creator region's `server/region-package.js` building has `id`, `center`, `size`, `yaw_deg`, `kind`, and optional one-room `interior`. The compiled world includes a ring and facade. Adding a new field requires bounded server validation, round-trip export, publication compatibility, and a migration decision.
- `preview/src/studio/space-templates.js` supplies four furnished, single-level local documents; `space-document.js` validates editable objects and `space-scene.js` builds their geometry. These documents are private Studio files, not published creator region packages.
- `preview/src/main.js` loads the district manifest and builds the street at world entry. Materials, characters, and interiors can finish loading after first street reveal. There is no per-building seed-and-proximity content stream. The office elevator has its own authored sixth-floor visit flow; it is not a general level system.

## Decision and alternatives

| Approach | Benefit | Cost |
| --- | --- | --- |
| Seed each room independently from its door | Small change to the current store planner | Different doors can claim the same interior; upper floors cannot share a stair/core plan reliably. |
| **Recommended: building-anchored level manifest** | One footprint and origin for all floors; stable identities and shared traversal; authored overrides survive regeneration | Requires an explicit vertical movement and server collision contract. |
| Generate an entire district from one seed | Compact initial data | A small generator change can shift many unrelated buildings and invalidate edits, routes, and checkpoints. |

Use a stable **building ID, world/region ID, generator version, and building seed** to derive each level. The seed selects only unconstrained layout details. Footprint, entrance, exits, stairs, safe route widths, and access rules are constraints, never random outcomes. Store the resolved manifest/hash for shared worlds so every client uses the server-approved result. A seed is not a content or access token.

## Geometry and identity contract

1. **Anchor:** Each building has one local 2D frame in metres, fixed to its primitive's center and yaw. Transform `(u, v)` to district east/north using the same `center`, `yaw_deg`, and ring as `server/region-package.js`; transform back for editing and collision. For mapped nonrectangular rings, choose and store a deterministic origin and basis from the building's canonical ring, then clip all usable cells to the polygon. Do not infer a new anchor from array order or a changed storefront name.
2. **Height:** `baseElevation_m` is the server-approved ground/entry datum. Level `0` retains the existing street threshold. Each level has an explicit `floorElevation_m` and `clearHeight_m`; slabs, stairs and roof must remain inside the primitive's usable height. The building silhouette must reflect any added occupied levels. Adding a level cannot silently extend above an authored roof or stepped mass.
3. **Stable IDs:** `buildingId/levelIndex/spaceId/objectId` identifies generated geometry and overrides. Derive candidate IDs from the stable input IDs and named layout slots, never a traversal index. A generator version change does not silently replace an occupied world's IDs.
4. **Generation:** First reserve the entrance, circulation core, vertical shaft, window/service zones, and bounded room polygons. Then select a layout archetype by building kind/category and seeded choices; finally place fixtures within verified clearance. The generator returns a serializable plan, not Three.js objects. It must reject impossible footprints with a specific reason and preserve the existing single-floor room as a fallback during migration.
5. **Layers:** A level is vertical occupancy and collision. Within it, separate `shell`, `partitions`, `fixtures`, `finishes`, and `authoredOverrides` in data and rendering. Finishes can be hidden or changed without changing a route. Any layer that changes walkability or access requires server validation and a new approved plan revision.

Illustrative target shape, **not** a currently accepted package:

```json
{
  "buildingId": "market-hall",
  "generator": { "version": 1, "seed": "market-hall-01" },
  "baseElevation_m": 12.4,
  "levels": [
    { "id": "market-hall/l0", "index": 0, "floorElevation_m": 12.4, "clearHeight_m": 3.9, "use": "retail" },
    { "id": "market-hall/l1", "index": 1, "floorElevation_m": 16.6, "clearHeight_m": 3.2, "use": "gallery" }
  ],
  "overrides": []
}
```

The first implementation should derive the initial seed from the existing immutable building ID when no seed is authored. Explicit seeds permit a deliberate reroll before publication. Once published or edited, retain the seed, generator version, building anchor and approved plan revision; editing any of these is a migration, not a background regeneration.

## Entry and level transitions

- Keep a low-detail exterior shell visible from the street. Prepare the building's plan and collision before showing an enter control. Preload/render the interior near the entrance; on entry, switch visibility only after the required shell, floor and collision are ready. Cancel stale loads on world change and release disposable GPU resources on eviction. Preserve a bounded cache for a quick return visit.
- The first shared-district slice uses one existing public storefront with level `0`, then one selected building with `0` and `1`. Existing stores keep their current one-floor behavior until explicitly migrated. This makes visual and route comparisons possible without changing all 30 storefronts at once.
- Level movement begins with a validated stair or elevator portal. The server accepts a transition only when the player is at its source portal and the destination floor/landing is free and authorized. It assigns the destination `buildingId` and `levelId`; clients interpolate or play a transition after acknowledgement. Ground walking remains continuous through the existing entrance.
- All queries involving indoor occupancy become `(east, north, elevation, buildingId, levelId)` aware. `roomAt`, `groundAt`, collision, sight/conversation, interaction reach, navigation and spawn recovery must select the same floor as the authoritative player. No automatic choice of a floor solely from horizontal position. Outdoor flight and roofs still use their existing world-space heights.
- Public/private access stays server-side. Entering a cached scene, using a direct link, or guessing a level ID cannot bypass an owner-only home or a closed portal. Shared fixtures, workers and player presence are associated with level IDs before replication is filtered by proximity.

## Shared data and Studio authoring

**Phase A — shared district contract.** Add a pure generator and versioned building-level plan in the world data seam. Keep legacy `storeRoomsFor` results for unconverted buildings. Compile/validate plans on the server and use the same pure geometry and collision definitions in the browser. The browser may generate display meshes locally from the approved plan but must not invent shared doors, obstacles or access. Bound level count, objects, plan bytes and generation time before exposing the format in creator publication.

**Phase B — shared traversal and streaming.** Migrate one representative public building to two levels. Implement level-aware authoritative movement, entrances, stair/elevator transitions, room queries, visibility and scene loading. Only then generalize to additional building categories. Keep the current snapshot protocol compatible for players in legacy spaces; define an explicit protocol/schema bump for level state rather than overloading `altitude` (which currently also describes flight).

**Phase C — World Studio.** Let a Studio building primitive expose its anchor, seed, generated level list and layer tree. Add **Add level** and **Regenerate unedited level** controls with a preview diff. Lock or preserve an edited level's override IDs; never reroll it implicitly when a floor below changes. Translate existing furnished-space documents into a single `level 0` view in the editor without changing their saved bytes on open. Publish a multi-level creator region only after the server package format and round-trip tests are ready.

**Phase D — broader content.** Add archetypes and finish sets for homes, shops, offices and public buildings after one vertical route is proven. Measure memory, draw calls, first entry latency and revisit latency before expanding preload radius or the number of active interiors. Any neighborhood-scale content streaming is a separate world-growth decision.

## Verification gates

- **Determinism:** Same world/building/seed/version and primitive yields byte-identical normalized plan and IDs across Node and browser; reordering unrelated buildings changes nothing. A version or seed change yields an explicit different revision. Invalid rings, tiny footprints, absent portal clearance and impossible vertical stacks fail bounded validation.
- **Spatial safety:** All rooms and fixture obstacles remain inside the building ring on each level; doors, stair landings and evacuation routes remain connected with avatar clearance. Test rotated rectangles and irregular mapped polygons, terrain changes, neighboring storefront claims, slab/roof clearance and a blocked landing.
- **Authority:** Two clients agree with the server on floor, position, interaction reach and visibility through entrance, stairs/elevator, reconnect and world replacement. Test owner-only denial, stale transition acknowledgement, old checkpoint recovery and generator-version mismatch.
- **Experience:** Browser journey enters the pilot storefront, visits level `1`, returns outside, reloads, and repeats with reduced motion. Inspect player-height views and roof/facade continuity. Studio journey adds a level, edits a furnishing, saves/reopens/exports, regenerates only an untouched level, and verifies the edited level remains stable.
- **Performance:** Record cold plan generation, first entry, return entry, active geometry/textures and frame timing on named hardware. Set budgets from the pilot baseline before rollout; a passing core test does not establish a smooth arrival or visual quality.
- Run focused unit/server tests during each phase, then `pnpm run verify`; use isolated Redis and browser prerequisites for `pnpm run verify full`, shared two-client and Studio journeys, and hosted `preview` on an up-to-date branch before a merge. Native Unreal parity remains a separately scoped acceptance item.

## Decisions to confirm before implementation

1. Pilot building and intended upper-floor use: a public retail/gallery building is the default so no private-home permission flow is needed in the first vertical slice.
2. Maximum initial occupied levels: propose two for the pilot; the schema and IDs allow more once height, circulation and performance gates pass.
3. Whether an added floor may change the exterior roofline. Default: no; require an explicit authored building-height change and visual review.
4. Whether World Studio should publish generated interiors immediately. Default: editor-only until the shared server package and migration checks pass.

**Implementation note:** Val's subsequent long-running goal authorizes the phased build. Laura Rathe Fine Art is the provisional public gallery pilot after a footprint fit against the current district; actual traversal and visual review still determine whether it is usable. Do not treat this design as verification or as permission to migrate existing published worlds.

## Planning check and handoff

- Inspected the current room planner, building renderer, walking environment, creator-region compiler, Studio space documents/templates, world-loading path, and existing office transition. The plan describes their present contracts; it does not claim a working multi-level prototype.
- `git diff --no-index --check /dev/null docs/superpowers/plans/2026-10-13-procedural-multilevel-interiors.md` passed. The primary task register remains valid JSON. `pnpm run --silent project:check --tasks <primary>/docs/project-management/tasks.json` found this branch registered and preserved its dirty plan; it exited 1 for 16 unrelated pre-existing reconciliation gaps.
- No code, tests, render, schema migration, publication, PR, or core verification ran. The plan worktree must remain until the document is reviewed and delivered.
