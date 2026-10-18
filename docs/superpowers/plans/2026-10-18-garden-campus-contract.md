# #506 Garden campus: measured campus, floor and connection contract

## Objective and ownership

Turn #506's numeric design into one shared, versioned contract and a runnable validator for the three-tower campus that replaces the garage `osm-way-625330790` (parent #505). Renderer, collision, level authority, unit inventory and tests read the same geometry.

- Register task `garden-campus-contract-506`, owner `claude:garden-campus-506 (1e70822d)`.
- Branch `feat/garden-campus-contract-506-20261018` in `../river-oaks-garden-campus-506-20261018`, from `origin/main` `153471bc2075e0d02e764a97b0a72129d6da5207`. That is the audited baseline itself; the district blob `566d7c52` matches.
- Scope: contract, validator, published artifacts and review views. #507 (district overlay, shells, collision, migration) and #508 (traversal) belong to the #505 tracker owner `river-oaks-95` (task `garden-campus-tracker-505`). That owner agreed not to edit this task's files.

## Files owned

- `shared/garden-campus-layout.js` (new): the contract and its functions.
- `preview/tests/garden-campus-layout.test.js` (new): focused behavioural tests.
- `scripts/garden-campus-views.mjs` (new): publishes `docs/design/garden-campus/{layout-contract.json, manifest.json, views/*.svg}`; `--check` gates.
- `docs/design/garden-campus/` (new): `brief.md`, `avatar-envelope.json`, `measure-avatar-envelope.mjs`, the generated files.
- `preview/e2e/fixtures/garden-campus.{html,js}` (new): 3D review page.
- `docs/offices.md`: a short "planned" pointer only.

## Interface versions

`GARDEN_CAMPUS_VERSIONS` = `{schema 1, layout '3.0', floors 1, support 1, units 1}`. Published contract SHA-256 is in `docs/design/garden-campus/manifest.json`.

Exports:
- `GARDEN_CAMPUS_LAYOUT`
- `campusLevels`, `campusSupportAt`, `campusSurfacesAt`
- `campusRoute`, `campusGraph`
- `campusUnitInventory`
- `sourceToCampus`, `campusToSource`, `campusToScene`
- `validateGardenCampus`, `checkCampusCompatibility`
- `CAMPUS_ELEVATIONS`, `campusLevelId`, `CORE_DECISION`

Pushed for consumers as `8921ca42`; later commits add files without renaming any export or id.

## Audit (153471bc)

- **Parcel:** the garage ring transformed with the pinned basis gives the issue's polygon to float precision; area 6,838.98290517 m². The basis is orthonormal.
- **Context:**
  - IPIC is `osm-way-625330798`: 18.5 m on a base of 18.32118 m. Its east edge is the campus wall from v 82.5438 to 181.2216.
  - The office is `osm-way-625330785`: 33 m on a base of 18.28383 m, nominal roof 51.28383 m absolute.
- **Entries:** E1–E3 are garage vertices, and their lanes exist. Lane vertex altitudes minus the base are −0.0311, −0.0112 and +0.0586 m. Terrain under the plot runs 17.56–18.42 m (NAVD88), so z 0 is an authored plinth.
- **Collision:** the garage ring is `collisionPolygons[1]` exactly; the whole parcel blocks walking today.
- **Support:** `groundSurfaceHeight` returns the highest triangle at x/z, so a bridge must never be registered as ground.
- **Storeys:** the generic recipe stacks 4.2 then 3.5 m storeys; the campus is 5 then 4 m.
- **Body:**
  - `AVATAR_ENVELOPE` is 0.505 / 0.888 / 2.45 / 1.27 m. Its comment cites 22 appearances measured 2026-10-11 at `eb62862`, which predates the human-only catalog (#496).
  - Remeasured here: all 11 current looks, with the same fixture and seat path (`avatar-envelope.json`, measured at `8921ca42`): widest body 1.01 m (Jevica), tallest 2.45 m (forest aristocrat), turning 0.561 m (Lyra), seated reach 0.932 m (forest aristocrat, feminine).
  - The constants bound every look; body width and height are exact.
- **Stairs:** the office stair walks 22 risers over 3.8 m with an 8.4 m run, and its height is derived on the server. Generated interiors pair stair portals instead.

## Decisions and logged adjustments

- **Levels:** keyed by elevation campus-wide, `garden-campus/l0..l7`. Proposed by the #508 owner and accepted on both sides as `support 1`.
- **Cores:** each 5 × 6 m envelope is kept: lift 3 × 2.6 m, enclosed stair 3 × 3.4 m, lobby 2 × 6 m meeting the spur. Stairs are level-change portals; the lift is the step-free route. Not adopted, with its measured effect: a walked code-like switchback needs about 5 × 9.4 m, costing about 28.9 m² of suite per upper floor and about 549 m² across the campus (`CORE_DECISION`). #508 accepted portals.
- **Roof access:** a 3 m headhouse inside each core reaches z 28 / 32 / 28, under the 28.1 / 32.1 / 28.1 caps.
- **Spines:** every upper floor carries the 3 m spine at u 14.5–17.5 so suites stack. It stops 1 m short of facades without a portal; those 1 m ends are service residual.
- **Terrace passages:** 1.8 m wide, across the east band to each terrace door.
- **Suites:** at least a 3 m short side, a 1.7 m door, and 1.27 m seated desk clearance. The 1.5 m top-tier east strips are service residual. Result: 43 suites, 3,279.7 m² net; commercial terms unset (#509).
- **Seams:** follow the parcel vertices, so the E1 bend is exact. The first four-corner version missed E1 by about 0.3 mm and the validator caught it.
- **Cameras:** five named, matching the issue's proposed set; `05-office-terrace-outlook` is an approximate office roof edge.

## Evidence

- `node --test preview/tests/garden-campus-layout.test.js`: 15/15, covering:
  - provenance, the collision fact, frames;
  - 6/7/6 floors, roofs and caps against the office roof;
  - facade-to-facade spans;
  - the public F4 route through both decks with no suite;
  - support below and above each deck, never the highest surface;
  - levels, portals and reachability;
  - units;
  - the envelope receipt against the catalog;
  - versions;
  - defects;
  - the IPIC wall and seams;
  - published artifacts up to date.
- Defects demonstrated failing:
  - a shifted B12 endpoint (`endpoint`, `span`);
  - a B23 deck at 12.5 m (`elevation`);
  - a T3 tier off the parcel (`offsite`);
  - a suite into the gallery (`overlap`);
  - a planter on the T2 south landing (`blocked`, `route`);
  - a kiosk on B23 (`route`);
  - a roof bed beyond its deck (`support`);
  - a headhouse above its cap (`silhouette`);
  - a missing T3 headhouse (`reach`);
  - P5 opened onto the IPIC wall (`ipic`);
  - a broken seam (`seam`);
  - a floors-2 requirement (`version`);
  - a deck injected on the ground level (the support model keeps the ground).
- `node scripts/garden-campus-views.mjs --check`: ok, no findings, nothing stale.
- Views inspected after rendering (site plan, Floor 4, long section at u 16). Clipped labels were fixed after inspection.
- Review page: served from this worktree's Vite on port 5196 (`/e2e/fixtures/garden-campus.html`). Checked headlessly under the browser lock with no page errors: massing and the l3 bridge walk, validator ok. Opened for Val.

Gates and PR: see "Delivery" below.

## Delivery

(Filled at PR time.)

## Open and next

- **#507 (tracker owner):** `attachGardenCampus`, removal of `collisionPolygons[1]`, shells, street rooms, collision and the content revision.
- **#508:** server-side levels and portals on `campusLevels`.
- **#509:** leases keyed on unit id plus `units`/`layout` versions.
- **Not claimed here:** in-world rendering, GPU cost, two-player traversal, device evidence, production. Merging and activation are separate release actions.
