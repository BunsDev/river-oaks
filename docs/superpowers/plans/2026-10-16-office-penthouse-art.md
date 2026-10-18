# #362: Jevica's penthouse asset package (original art, exports, reviews)

- **Task:** `office-penthouse-art-362` (live register), owner `claude:river-oaks-1b (47a21efe)`.
- **Branch / worktree:** `feat/office-penthouse-art-362-20261016` in `../river-oaks-penthouse-art`,
  stacked on `feat/penthouse-lighting-20261015` (#473, owned by `claude:penthouse-readiness`), whose
  noon/dusk lighting the reviews use. #473 lands first.
- **Issue:** #362, under tracker #359. The status and the keep/close sort were posted at
  issuecomment-6207194686 (2026-10-16 03:15Z).

## Objective

Deliver #362's production package as original art. Val's R19 (2026-10-15) imported only the kit's
desk footprints, as numbers. Kit art stays unpublished, and nothing is paid or generated.

1. A JS master for the furnishings, placed on plan footprints and held to the server's collision.
2. New plan collision for the lounge, meeting, terrace and planting pieces, with every route still walkable.
3. Exports, all reimported and checked:
   - per-asset GLBs (LOD0, LOD1, `COL_` proxies, anchors);
   - the placed office GLB;
   - an editable `.blend`;
   - textures and materials.
4. Manifest entries in the existing `asset-manifest.json` schema, pinned to the plan.
5. Captures labelled by stage:
   - **blockout:** #473's graybox captures;
   - **asset preview:** fixture lighting;
   - **Blender preview:** Cycles;
   - **runtime:** the game with two accounts, at noon and dusk, standing, seated and occupied.
6. A defect matrix with severity, proposed correction and owner. Unresolved visual decisions are recorded separately.

## Files owned

- `preview/src/office-penthouse-furnishings.js` (new): finishes, seeded surfaces, 24 assets, placements,
  batching, export models.
- `preview/src/office-layouts.js`: the `furnishings` footprints.
- `preview/src/office-penthouse-graybox.js`: uses the furnishings. It keeps #473's `relight`, lamps and
  glint rule. Floors and treads take the travertine map with metric UVs, and the `casts` rule defers to the furnishings.
- Tests:
  - `preview/tests/office-penthouse-furnishings.test.js` (new);
  - `office-penthouse-graybox.test.js` (zone kinds `rug`, `canopy`, `fixture`; a triangle-level doorway check; desks, draws and casters on the real art);
  - `office-layouts.test.js` (a furnishings plan test);
  - `scripts/tests/office-penthouse-assets.test.js` (new: GLB reimport);
  - `server/tests/penthouse-{office,seats}.test.js` (two walks rerouted around the lounge).
- The export side:
  - the fixture `preview/e2e/fixtures/office-penthouse.{html,js}`;
  - `scripts/export-office-penthouse.mjs` and `scripts/export-office-penthouse-blender.py`;
  - `scripts/office-ipic-reference-index.mjs` (`--write-penthouse`, and validation of package entries against their files and the plan digest);
  - the runtime review `preview/e2e/office-penthouse-review.mjs`.
- Docs: `assets/office-penthouse/` (package and README), `docs/offices.md`,
  `docs/design/office-ipic/camera-manifest.json` (O1-P, O2-P, O3-P, O4 available, O4-T), and the review in
  `docs/design/office-ipic/`.

## Decisions taken here (proposals for design review, not approvals)

- **Placement is original.** The furnishing footprints were placed against the contract's view
  anchors and checked by a scratch BFS before any art. The kit's other 43 colliders were not used.
- **The lounge is not seating yet.** The sofa and chairs carry seat anchors only. With the
  occupied-seat clearance (0.888 + 1.27 m), only one of two adjacent sofa seats could be taken, which
  needs its own design decision.
- **The botanical focal point stands between the terrace portals.** It is a standard tree whose canopy
  starts above the tallest body plus 0.3 m and stays 0.15 m inside the glazing.
- **Displays sit 0.65 m in from the sitter's edge,** not at the far edge of the 1.6 m executive desk.
- **Small objects share one finish.** Books, vessels and desk pads use a tinted `objects` finish, so decor costs no draws.

## Checks

| Check | Result |
| --- | --- |
| `pnpm run verify` (core) at 05:46Z | **passed**, all 11 steps: agent tests 116/116, preview 3381 (1 skip), server 599 (154 Redis skips), desktop 76, build, Python lint, format and tests, demo checks and the secrets scan. The receipt is `.runtime/agent/core.json`. |
| `node --test scripts/tests/office-penthouse-assets.test.js scripts/tests/office-ipic-*.test.js` | 18/18. The GLB reimport covers names, LODs, `COL_` proxies, anchors, applied transforms, normals against winding, 512 px JPEG maps, lamps and drums, and the manifest's hashes and plan digest. |
| `node scripts/office-ipic-reference-index.mjs --check` | 147 references and 84 assets (31 of them the package), 0 problems. The 17 drift notes are the baseline's own. |
| `node scripts/export-office-penthouse.mjs export` | 29 exports, each reimported in the page with its textures decoded. A re-export is byte-identical to the recorded hashes. The furnished office builds in 77 ms in the page; frames draw 44–98 calls with the sun's shadow pass. |
| Blender 5.2.2 (`export-office-penthouse-blender.py -- --render`, under the browser lock) | 184 meshes, 34 collision proxies, 15 anchors and 3 packed images, in a 1.6 MB `.blend`, with five Cycles stills |
| `node preview/e2e/office-penthouse-review.mjs` (two accounts, Metal, noon and dusk) | passed 24 checks with 16 captures at load 12, no reloads and no page errors. It was rerun after the Library view fix. |
| Mutation: a lounge chair moved onto the `lounge` anchor | the route test and the furnishings plan test both fail; reverted |
| Independent subagent review (read-only, its probes verified by running code) | 10 findings, all fixed with tests: double disposal of instanced draws, a drum over the reading lamp, 47–112 ms surface blocks (now idle slices, the longest under 40 ms), terrace furniture losing #473's outdoor sky, asset `COL_` proxies, the plan-digest scope, weak assertions, the review runner waiting on one page, and the pendant ceiling under the mezzanine |

## Gaps and next steps

- **Visual direction is not approved.** The open decisions and the defect matrix P1–P11 are in
  `docs/design/office-ipic/penthouse-review.md`, for #359 and Val.
- **Not covered:** real devices, Safari and iOS, and human visual or art-direction review.
- **Next:** a PR stacked on #473, which lands first. Then hosted CI, `pnpm run land` (with Val's
  authorization), the #362 handback, and retirement.
