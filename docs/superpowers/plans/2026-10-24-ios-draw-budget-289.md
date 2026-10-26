# #289 iOS draw-call budget (host-measured)

Objective: halve the phone-profile draw count at the Gardens spawn (proposed target
at most 440 draws, from about 874 recorded on 2026-10-22) without a visible change,
and report the District to Commons arrival. Physical iPhone timing stays with Val.

Owner: claude:ios-draw-budget-289 (4c25a886), by handoff (below). Branch:
`perf/ios-draw-budget-289-20261024`, worktree
`river-oaks-ios-draw-budget-289`, base `origin/main` 091b0ddc (was 55b88b31).

## Handoff (2026-10-26)

The first owner, claude:ios-draw-budget-289 (4c7867dc), stopped on 2026-10-24
while its browser-lock turn was still queued. Its lease expired at 13:30Z that day.
No process used the worktree, and nothing in it had changed since. Val authorized
the transfer to session 4c25a886 on 2026-10-26 (register `handoff` field, 20:29Z).

- The prepared, uncommitted work was backed up before the move:
  `.runtime/ios-draw-289/prepared-55b88b31/` (`tracked.patch`, `untracked.tar`,
  `SHA256SUMS`), with a copy in the session scratchpad.
- The branch was fast-forwarded from 55b88b31 to 091b0ddc (0 commits ahead, 179
  behind), and the work was reapplied. The one conflict was `bird-cams.js`
  `dispose()`, where main added `releaseBackground()`. Both sides are kept.
- The comparison checkout `river-oaks-ios-draw-budget-289-base` was clean and was
  moved, detached, to 091b0ddc.
- No measurement had run (`turn-001.log` and `census-001.log` end while still
  waiting for the lock). Every number below comes from turn 002 on 091b0ddc.

Files owned: this ledger and the client draw-reduction source named under each change.
Not edited: files owned by world-streaming-582-583, integrated-expansion-mvp-20261023,
bayou-luxe-polish and crime-release-599. No movement, collision or authority change.

## Method

- Draw counts: `experiments/ios-probe/draw-census-local.mjs` (local WebKit, Gardens
  revision `river-oaks-gardens-3`, penthouse office, 440×796 at DPR 3, AO off). Draw
  counts do not depend on GPU speed; timings here are not phone timings.
- Browser runs go through `scripts/browser-lock.mjs`, one wrapped shell script per
  turn (`.runtime/ios-draw-289/turn-NNN.sh`). The inner harnesses see the held lock
  and go straight through. Each turn logs the source hashes it measured, and no
  source is edited while a turn runs, because the fixture serves this worktree.
- Scene parity (`experiments/ios-probe/draw-budget-local.mjs`): the development-only
  `still()` audit hook renders the current instant again without advancing anything.
  Each variant frame is compared with a reference rendered at the same instant just
  before it, so the variant is the only difference (the two-render control is 0).
- A parity view proves something only if it can see the change. Framed views (`frame`,
  `frameRoom`) are therefore gated by a sensitivity variant that switches the casters
  off and must change the frame. The harness reframes (next bird, next room, a moment
  later) until it does, then compares every variant at that same instant.
- `experiments/ios-probe/verify-image-parity.mjs` checks the shipped character PNG
  decoders. It cannot see a scene change, and no character code changed here.

## Baseline (main 091b0ddc, turn 002, 2026-10-26 20:44Z)

Receipts are under `.runtime/ios-draw-289/002/`. The phone profile is local WebKit,
440×796 at DPR 3, AO off, Gardens revision, penthouse office, at spawn.

| Census | Draws | Shadow pass | Main pass |
| --- | ---: | ---: | ---: |
| main, all casters | 874 | 452 | 409 |
| main, development lean set | 687 | 256 | 413 |
| branch, as shipped (bike, bird, 48 m tree proxies) | 776 | 354 | 411 |

The main census equals the 2026-10-22 phone figure (874). Attribution on main,
draws per frame:

- Boutique interiors: 123 in the shadow pass and 105 in the main pass, plus 33 for IPIC
  in the main pass and 2 in the shadow pass. About 263 in all.
- Mature trees: 56 shadow, 52 main.
- Parked bikes: 44 shadow.
- Player character: 20 shadow, 20 main.
- Bird cams: 27 shadow.

On the branch, the tree shadows are 16, the parked bikes 0 under their own key (one
proxy draw), and each bird 3.

**Harness defect found in turn 002:** `draw-budget-local.mjs` compared every variant
with a single reference frame. Its `byPass()` waits on real animation frames, so from
the second variant onward the scene (the idling avatar) had moved on. Every later
variant showed the same diff box around the avatar, even the proxies, which are
identical by construction. The first variant, `lean-shadows`, was clean (0 changed
channels). Turn 002's parity numbers are void, except for that first variant and
the Commons ones, where nothing in view animated. Turn 003 renders a fresh reference
at the same instant before every variant.

## Changes

All five are sun-shadow-pass changes. The shadow pass draws depth only, so a caster's
finish does not matter there, and the same triangles at the same matrices can be
submitted in fewer draws. Each change is a development toggle in
`__riverRenderAudit.drawBudget`, so the harness can compare it against main's
behaviour at the same instant. All ship switched on.

1. **Shared helpers** (`shadow-proxy.js`). `plainDepthMaterial` mirrors three
   0.186's `WebGLShadowMap.getDepthMaterial`: front-sided, no shadowSide, no cutout
   (alphaTest with a map or alphaMap), no alphaToCoverage, no displacement, no
   shadow clipping and no wireframe. It also refuses array materials. The other
   helpers are `rigidCasters`, `shadowProxyGeometry` and `shadowProxyMesh`. A proxy
   is hidden except while the sun draws its map.
2. **Parked bike shadow proxy** (`plaza-salon.js`). The four parked bikes cast
   through one instanced proxy of the first bike's own casting triangles, in the
   bike's frame. Its instance matrices are relative to the rack. A ridden bike's
   instance collapses. Regression: `plaza-rack.test.js`.
3. **Bird body shadow proxy** (`bird-cams.js`). Each bird's six rigid, front-sided
   body parts cast through one child proxy. The flapping wings and the double-sided
   tail keep their own casters. Regression: `bird-cams.test.js`.
4. **Tree shadow batches** (`landscape-models.js`). Shadow proxies always draw the
   silhouette level, so they batch on 48 m tiles instead of the crowns' 12 m detail
   tiles, with the same instance matrices. Regression: `tree-shadow-batches.test.js`.
   The 96 m tiles were measured as a variant: only −2 more at spawn, so they were
   not adopted.
5. **Interior shadow batches** (`store-interiors.js`, new in this session).
   Interior fixtures are batched per building × geometry × material. The batches of
   one building and geometry whose materials pass `plainDepthMaterial` now cast
   through one hidden InstancedMesh. It uses the same geometry object and copies the
   exact instance matrices, so no geometry is duplicated (the old estimate was 17 MB
   for a baked copy). In the district, 156 batches cast through 21 proxies. The
   visual batches keep receiving shadows and drawing as before. Regression:
   `interior-shadow-batches.test.js`:
   - every proxy's matrices equal its member batches' matrices, in order, on the
     same geometry;
   - only plain-depth materials are merged;
   - switching off restores every member and leaves the others untouched;
   - draws fall by the number of members minus the number of proxies.

   Both batching tests fail on main's `store-interiors.js`.
6. **Hidden-layer guard** (`landscape-models.js` `castShadowsFromProxies`). A proxy
   is shown for the shadow pass only when it is inside the shadow frustum and none
   of its ancestors is hidden. Before this, a proxy under a hidden layer (an
   interiors layer that is off, or Commons streamed out) was set visible, never
   drawn, so never re-hidden. It could then flash white in a later non-shadow
   render. Regression in `interior-shadow-batches.test.js`; it fails on main's
   `landscape-models.js`.

Not shipped (measurement only): `interior-shadow` (interior casters off) is −125 at
spawn with no change there, but it removes visible shadows inside stores (41,240
changed channels in Hermès). The batching keeps those shadows.

Development audit additions (`main.js`, development `render-audit` only):
- `still()`;
- `frame(name, { shadow })`;
- `frameRoom(index)`;
- the `drawBudget` toggles and three sensitivity toggles (`tree-shadow-none`,
  `bike-shadow-none`, `bird-shadow`).

## Results (turns 004–005, final source, base 091b0ddc)

| View | main | branch | Shadow pass | Parity (shipped set vs main) |
| --- | ---: | ---: | --- | --- |
| Gardens spawn (census) | 874 | **700** (−174, −19.9%) | 452 → 278 (−38.5%) | 0 changed channels |
| Commons arrival | 514 | 477 (−37) | 262 → 225 | 0 changed |

Per change at spawn: interior batches −76, bike proxy −43, tree batches −40, bird
proxy −15. The main pass is unchanged at 409.

Each framed parity view below is gated: switching that reduction's casters off
must visibly change the frame first.

| View (turn) | Sensitivity (casters off) | Reduction | Parity |
| --- | --- | --- | --- |
| Bike rack (004) | 145,052 channels | bike proxy −43 | 39 channels, max 3/255 |
| Bike rack (004) | trees: 1,539,335 | 48 m tree batches −50 | 0 |
| Bird shadow, attempt 2 (004) | 4,971 | bird proxy −15 | 0 |
| Hermès interior (005) | 41,240 | interior batches −62 | 0 |
| IPIC Theaters interior (005) | 2,772 / 3,972 | interior batches −78 | 0 |

The bike proxy is the only change that is not bit-identical. It bakes the bike's
triangles into the bike frame in float32, so 13 pixels differ by at most 3/255. The
other proxies reuse the original geometry and matrices.

## Checks

- Focused: `plaza-rack`, `bird-cams`, `tree-shadow-batches` 11/11. Related
  `ipic-*`/`interior-*` 150/150. `interior-shadow-batches` 5/5, and 2/5 fail on
  main's interiors, 1 on main's landscape-models.
- Full preview unit suite on the merged tree: 4176 tests, 4175 pass, 1 skipped
  (existing), 0 fail.
- `pnpm run verify` (core): passed, 2026-10-26 21:03–21:18Z, on this tree (receipt `.runtime/agent/core.json`,
  log `.runtime/ios-draw-289/verify-core-1.log`, Python 3.12 on PATH). Counts:
  agent 274/274; preview 4180 pass, 1 skipped, 0 fail; server 915 pass, 225 skipped
  (Redis and live-service cases, outside core), 0 fail; desktop 120 pass, 3 skipped;
  build; ruff; pytest 170 passed; demo and demo-verify; secrets scan clean.
- Not run: `verify full` (Redis, browser journeys, dependency audit). The
  experience journeys were not run. The changes are shadow-pass only, and parity
  above is the scene evidence.

## Gaps

- **Target not met.** 700 draws, not 440. All of the 174 come from the shadow pass.
  The main pass (409) is untouched, and halving needs it. The largest main-pass
  owners are:
  - interiors: 105, plus 33 for IPIC;
  - trees: 52;
  - unnamed instanced meshes: 40;
  - the player: 20;
  - street furniture: about 30.
- Physical iPhone frame timing, GPU time and memory (Val). Draw counts map onto the
  phone; local timings do not.
- Only the spawn and Commons arrival were censused. The framed views prove parity
  at the bike rack, under a bird and inside two stores; there is no all-district
  sweep.
- Turn 002's parity numbers are void (stale reference). Turn 003's two bird views
  ran on mixed source and never saw a bird shadow. Both are superseded by turns 004
  and 005.

## Next

Main-pass interiors. Merge the per-building batches of one geometry and material
across the buildings in a coarse tile, keeping instance colours, and measure the
triangles this adds against the draws it saves. Then the trees' main-pass crowns:
52 draws over 12 m detail tiles.
