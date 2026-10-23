# Versioned world manifest

`preview/public/data/world-manifest.json` is the bundled location registry. `preview/src/world-manifest.js` validates it in both browser and server through their existing shared `attachDistrictGalleryPlan` loading seam. It describes content in the existing GIS coordinate frame; it does not create multiplayer rooms, authorize travel, enlarge movement bounds, or supply collision geometry. The District scene and its entity IDs remain unchanged.

## Version 1 contract

| Field | Meaning |
| --- | --- |
| `schema_version` | Integer `1`; unknown or missing versions fail closed. |
| `axes`, `units` | `east-north-up`, `metres`. |
| `origin`, `crs` | Longitude/latitude origin and `EPSG:32615` projection, matching the bundled District. |
| `default_location` | Existing authored location ID. |
| `locations` | Between 1 and 64 locations. |
| Location `id` | Stable identity, independent of multiplayer room IDs and display names. |
| `status` | `authored` or `reserved`; neither grants movement permission. |
| `bounds_m` | Local `[west, south, east, north]` rectangle with positive finite area. Heights remain part of entry positions and authoritative surface geometry. |
| `translation_m` | Local-to-world `[east, north, up]` translation in metres. No rotation or scale in v1. |
| `content_revision` | Opaque revision of this location's authored content, independent of schema version and the existing server-selected District overlay revision. |
| `entries` | Up to 64 `{id, position_m: [east, north, up]}` local entry positions inside the rectangle. IDs are unique within their location. |
| `adjacent` | Unique neighboring location IDs. Links must be reciprocal and transformed rectangles must share an edge of positive length. |

Location IDs, entry IDs and content revisions contain a lowercase letter followed by up to 63 lowercase letters, digits or hyphens. Keep IDs stable across renames, geometry changes and content revisions; use a new ID only for a new identity. Revision strings are compared for equality, never sorted as semantic versions. Bump a content revision when its authored content changes. Reusing a retired location or entry ID for different content would invalidate persisted references and is prohibited by the authoring contract.

`validateWorldManifest` rejects missing required fields, unsupported frames, malformed, sparse or nonfinite coordinates, duplicate IDs, invalid defaults, dangling/self/one-way adjacency, gaps/corner-only adjacency, positive-area overlap, arithmetic overflow, area underflow and translated rectangles that collapse through floating-point precision. Shared edges are allowed. It returns a detached copy without modifying the input. Additional JSON metadata fields are preserved for forward-compatible annotations; they cannot alter v1 behavior. Changes to required fields, transforms, units or adjacency semantics require an explicit schema-version migration and compatible loaders, not silent interpretation of a future version as v1.

## Coordinates and adding a location

`localToWorld(location, point)` adds the translation; `worldToLocal` subtracts it. Both accept three finite components and reject overflow. `locationWorldBounds` converts the local rectangle to the common world frame. The horizontal origin is the projected longitude/latitude offset used by `LocalFrame` in `src/river_oaks/geo.py`. It has no vertical component: bundled District heights retain their terrain's NAVD88 elevation datum, and vertical translations are offsets within that same datum. EPSG:32615 names the horizontal projection; these helpers perform no vertical datum conversion. A new authored location must align its heights with the served world before connecting walkable surfaces. The renderer's existing east/up/negative-north conversion remains a separate boundary; do not send Three.js coordinates directly to the server.

The bundle retains the authored `east-garden-commons` destination and three empty reservations east of `river-oaks-district`. The reservations demonstrate empty location registration without loading content. To add a location, append a stable ID, local bounds, translation, content revision and entries; add reciprocal adjacency to each bordering neighbor; then validate the complete manifest. For example, a local rectangle starting at `[0,0]` can translate to the District's east/south corner. Registration requires no scene rewrite. Removing a location also requires removing every adjacency reference to it and selecting another authored default if necessary. The automated round-trip test adds an authored translated fixture, serializes it, removes it, and confirms that the original District remains unchanged.

Registration is separate from content installation. An authored destination still needs a loader, renderable content, server-owned movement/collision rules and a supported content-revision rollout before it can be visited. Reserved locations are deliberately empty. The integrated Commons blockout uses the existing renderer, walking, flight, furniture, shared games and checkpoint authority; its registration and three reserved rectangles retain the expansion branch's partition. Adding registration is data-only. Installing authored content still requires a bounded composition/loader and shared collision geometry; v1 does not provide automatic streaming or a generic content plugin system.

## Legacy compatibility and persistence

`validateDistrictLocation(manifest, district)` validates the manifest, requires the registered District's identity transform, checks the pinned `district-v1` content revision, and compares the existing schema version, scene, origin, projection and bounds. It returns the same District object without adding IDs or changing entities, geometry, spawn, vegetation or overlays. Unsupported content revisions fail instead of silently pairing new registration with stale bundled data. A new District content revision must deliberately update this compatibility contract and tests.

The existing gallery attachment runs this check before applying its approved plan. Both the browser's District loading path and `server/district-data.js` use that attachment; Gardens remains an existing subsequent overlay. `district-v1` names the base derivative, while `river-oaks-gardens-3` and other server overlay revisions retain their existing synchronization and checkpoint semantics. No new location field is added to poses, sessions or checkpoints, so historical District/Gardens checkpoints need no migration. Tests restore an occupied legacy checkpoint against newly loaded data and compare players exactly. Registration never bypasses server bounds, collision, speed validation, authorization or checkpoint fingerprints.

## Verification

Run `node --test preview/tests/world-manifest.test.js server/tests/world-manifest.test.js server/tests/district-building-interiors.test.js server/tests/district-gallery-levels.test.js server/tests/district-gallery-transition.test.js`, then `PATH=/opt/homebrew/opt/python@3.12/libexec/bin:$PATH pnpm run verify` on this macOS environment. Test evidence and remaining gates are recorded in the [task ledger](superpowers/plans/2026-10-22-world-manifest-581.md). Exact composed-data equality establishes unchanged scene inputs; it is not a visual, physical-device, hosted or production acceptance claim.
