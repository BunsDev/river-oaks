# Movement and world review

This patch improves the existing Three.js game, its debug tools, and decoration authoring. The district geometry and engine stay in place.

Reviewed and resumed on October 3, 2026. The movement patch was recovered from the `cody/movement-world-review` worktree, committed as `fb22345`, and integrated with `main` at `43717da`. This retry added thin/grazing stem recovery, reachable close hints, and finite tree metadata defaults. The integrated branch was verified again as described below.

## Phased plan and scope

1. **Implement locally:** bounded bird motion and optional route hints, Jev route/sensing overlays, narrow tree-clearance improvements, outdoor grid selection, indoor/outdoor coordinate receipts, and fitted bare-arm vines.
2. **Verify:** deterministic movement and obstacle cases, busy synthetic scenes, the existing gameplay browser journeys, shared-town placement and appearance replication, rendered evidence, and a production build.
3. **Design separately:** region streaming and handoffs, a persistent indoor decoration editor, a new tree-themed district, or an Unreal migration. These change architecture, content, or authority and need an explicit design decision.

## Existing implementation

| Area | Source and finding |
| --- | --- |
| Playable engine | `package.json`, `preview/src/main.js::initializeRenderer`: Three.js `0.186.0`, `WebGLRenderer`, Vite, plain JavaScript modules. `desktop/main.js` wraps the same game in Electron. |
| Unreal | `unreal/Source/RiverOaks/Private/RiverOaksWorld.cpp::MoveAgents` implements separate native movement and collision. The existing native foundation is not the browser's renderer or multiplayer client. Historical build acceptance is documented in `docs/engine-acceptance.md`; it was not rerun here. |
| Multiplayer | `server/world.js` owns players, commands, residents, wishes, builds, and checkpoints. `server/app.js` steps the standalone town every 50 ms and broadcasts whole snapshots every 200 ms. `server/redis-room.js` coordinates one leased/fenced writer per namespace with a 200 ms tick interval and compressed state. `preview/src/remote-players.js` interpolates snapshots and loads selected appearances. Production authentication uses WorkOS; loopback development uses local identities. No live hosted authentication claim is made here. |
| Birds and interaction | `preview/src/bird-cams.js` simulates three client-local birds. `main.js::birdInterests` ranks residents, conversations/helping, the player, peers, and community locations. Ride-along, manual W/A/S/D/Space/C, T to return control, N to switch, and Escape to return to the walker remain. The name “Jev autopilot” describes local deterministic interest scoring, not a model request for every flight step. Bird positions are not shared authoritative entities. |
| Jev | `carriage-driver.js`, `prince-companion.js`, `companion-navigation.js`, and `prince-flight.js`: the optional model chooses a stance; local code owns geometry. Walking uses worker routes with door/fixture connections. Flight already samples ahead every 120 ms, tries turn/lift candidates, and sweeps each movement step. `main.js` also wires a separate auto-visitor route service. This patch targets Prince Jev's physical companion path. |
| World | `preview/public/data/district.json`: about 254 × 290 m, nine building footprints, 30 stores, 39 road features, 30 community destinations. `main.js::loadWorld` also loads `district-vegetation.json`, with 201 branch supports and 18,832 foliage voxels. Four fallback trees exist in the district file. Coordinates are meters: authoring uses east/north; scene space uses x/elevation/negative-north. |
| Placement | `store-rooms.js` plans rooms and theme-specific fixtures in facade-relative coordinates; `store-interiors.js`/`retail-interiors.js` render them. `street-furniture.js` derives outdoor furniture from roads and clearances. `shared-build.js`, `shared-build-ui.js`, and `server/world.js` allow owned seats, planters, lamps, and sculptures outdoors, enforcing reach, roads, players, collision, and limits. This is not a general scene editor. |
| Characters | `shared-appearances.js` maps selectable identities onto shipped GLB rigs. `avatars.js` loads/caches and animates them; `reference-archetypes.js` adds procedural Silvan vines. Bare upper-arm vines used a fixed cylinder. Boot/bracer vines follow authored clothing and remain unchanged. Asset receipts live beside the GLBs in `preview/public/assets/characters/`. |

## Implemented changes and trade-offs

| Change | Root cause or limitation | Implementation and trade-off | Changed production paths |
| --- | --- | --- | --- |
| Bird smoothing | Altitude displacement was clamped before an exponential gain divided by delta. That nearly doubled the named climb rate and allowed immediate reversal when clearance changed. | Persistent vertical velocity, capped at 4 m/s and 6 m/s². Turning, banking, interest ranking, and player controls remain. Climb response is gentler; an obstructed bird can pause horizontally while gaining clearance. | `preview/src/bird-cams.js` |
| Optional hints | Transit steered directly toward the selected interest. A cruise-speed turn circle could also trap a close lateral node. | Up to 64 finite scene-space nodes per interest, with slowing near a node and an acceptance radius above the minimum-speed turn radius (about 3.89 m). Hints are soft guidance, not a navmesh or exact landing points. Safety/ceiling rules override altitude; node completion is horizontal. Manual control bypasses hints. | `preview/src/bird-cams.js`, `preview/src/main.js` |
| Bird obstacle recovery | Sparse lookahead could miss a thin stem; endpoint movement could skip an obstacle. Grazing contact could leave zero climb velocity forever. | Fixed 0.5 m forward samples, swept movement at intervals no greater than 0.2 m, and a blocked flag that asks the same bounded controller to climb. More collision queries, bounded independently of interest count. | `preview/src/bird-cams.js`, `preview/src/tree-flight.js`, `preview/src/main.js` |
| Jev tree clearance and sensing | Flight inspected desired direction but omitted current momentum. Ground routes only read observed supports, even when the renderer used fallback trees. | Preserve existing sampling and add a momentum probe. Include fallback trees in main-thread and worker navigation. Bird/Jev flight wraps existing collision with conservative trunk cylinders. Foliage stays permeable and player/network collision is unchanged. Tree heights are cached with finite defaults. This remains local avoidance; it is not global flight planning. | `preview/src/prince-flight.js`, `preview/src/companion-navigation.js`, `preview/src/carriage-driver.js`, `preview/src/tree-flight.js` |
| Debug overlay | Ground routes and actual flight probes were invisible. | F3 → **Jev routes & sensing** draws cyan routes, green clear probes, and red blocked probes. The geometry refreshes at most roughly eight times per second while enabled and is disposed when switched off. Existing walkable-grid/fixture overlays remain available. | `preview/src/debug-tools.js`, `preview/src/carriage-driver.js`, `preview/src/companion-navigation.js`, `preview/src/main.js` |
| Placement workflow | Outdoor placement always snapped to 0.1 m; finding coordinates for procedural indoor fixtures required manual conversion. | Grid selector: 0.1/0.5/1 m. Reach reserves the rounding diagonal so snapping cannot extend beyond server reach. F3 → **Copy placement coordinates** exports east/north, ground height, and, indoors, store ID plus local coordinates. Clipboard failure displays the JSON for manual copying. Indoor authoring still requires editing the existing fixture definition; the copy action does not mutate the town. | `preview/src/builder-mode.js`, `preview/src/shared-build-ui.js`, `preview/src/shared-build-ui.css`, `preview/src/debug-tools.js`, `preview/src/placement-coordinate.js`, `preview/src/main.js` |
| Silvan vines | Fixed-radius upper-arm spirals ignored the actual mesh's taper and offset. | Measure skin-weighted rest-pose limb bands once, interpolate an elliptical surface, and fit stems/leaves/flowers with a small clearance. Attachments keep following their bones; no GLB regeneration or per-frame skin scan. Missing profile data preserves the authored shape. This does not establish zero clipping across every pose. | `preview/src/limb-fit.js`, `preview/src/reference-archetypes.js` |

## Author a bird route

Add a `birdPathHints` object to `preview/public/data/district.json`. Keys match `main.js::birdInterests`: `player`, `player:<account-id>`, `local:<resident-id>`, or `spot:<community-location-id>`. Values are `[east, absoluteElevation, sceneZ]` nodes, where `sceneZ = -north`.

For example, this optional configuration directs birds through two high approach points when watching Toulouse. It is an authoring example, not a new grove or a route inserted into the shipped world:

```json
{
  "birdPathHints": {
    "spot:osm-node-6374756992": [
      [-2825, 45, 1285],
      [-2815, 45, 1285]
    ]
  }
}
```

Keep nodes inside the district, outside solid obstacles, and below the local flight ceiling. Use wide, separated approach points for a future tree-themed area. Hints do not make unreachable destinations reachable: an obstructed/out-of-bounds hint can still hold transit. Invalid vectors are ignored, and only the first 64 entries are considered. Clearances and small-node behavior have tests; these example coordinates have not received an authored-flight visual acceptance pass.

For indoor decoration, enter a boutique, open F3, point at its floor, and copy the placement receipt. Use its `storeId` to find the room and its `local: [a, d]` coordinates with the existing `store-rooms.js` fixture helpers. Outdoor receipts use `position: [east, north]`. Shared outdoor builds still persist through the server's existing command/checkpoint path.

## Practical world growth

**Recommendation:** keep Three.js for the next measured expansion. Its installed `LOD` class supports distance levels and hysteresis. The [official LOD reference](https://threejs.org/docs/pages/LOD.html) describes both. The game already batches trees into 12 m cells and switches detail at 22/60 m (`landscape-models.js`); distant peers are hidden beyond 120 m (`remote-players.js`). `render-quality.js` also reduces pixel scale/AO under sustained load. These mechanisms reduce rendering work but do not unload all distant assets or shard simulation.

1. Establish target hardware, resolution, concurrent players, and frame/network budgets before adding content. Record p50/p95/p99 CPU/GPU frame time, draw calls, triangles, texture memory, scene load time, navigation latency, server tick duration, snapshot bytes per client, and reconnect behavior. A 60 Hz target provides 16.67 ms per frame; no sustained 60 fps claim is supported by this patch.
2. Reuse spatial cells for activation/culling and asset loading, then add lower-detail building/prop meshes and distant character animation throttling. Retain full collision and interaction detail near players, and preserve conversation targets during LOD transitions. Add hysteresis to avoid boundary flicker. Test memory release and crossing/reload behavior before increasing world extents.
3. Add spatial interest filtering/deltas to the existing authoritative town before splitting simulation ownership. Current snapshots contain every player, local, wish, and build. Rendering LOD does not reduce that bandwidth or server work. The current route planner also rejects grids above 80,000 one-meter cells (`navigation.js`), so simply enlarging the district bounds is not a safe scaling strategy.
4. Consider separate regions when measured per-room tick/queue or state/bandwidth budgets are exceeded despite culling/filtering, or when distant districts should operate independently. Client chunk streaming may be needed much sooner than server regions. There is no evidence-based player count or map-area threshold yet.
5. Region handoff needs stable entity IDs, explicit source/destination ownership epochs, a destination reservation and validated spawn, durable/idempotent transfer state, replay protection, reconnect recovery, and a decision about conversations, companions, wishes, builds, and cross-border visibility. Test disconnects and process replacement at every transfer phase. The existing fenced Redis writer is useful groundwork, but it is not a cross-region transfer protocol.

[Unreal World Partition](https://dev.epicgames.com/documentation/en-us/unreal-engine/world-partition-in-unreal-engine) supplies grid-based world streaming and integrates with HLOD. That addresses content streaming, not automatic migration of this game's JavaScript simulation, WorkOS/Redis town, UI, characters, or account state. An Unreal comparison should be a separately scoped vertical slice on the same hardware and gameplay workload, with explicit browser-distribution and asset-pipeline costs. No migration or world rebuild was performed.

## Verification evidence

The original review receipts are retained locally in `../data/reports/movement-retry/completion.json`; generated reports are not committed. Test harnesses changed in `preview/tests/movement-review.test.js`, `limb-fit.test.js`, `prince-flight.test.js`, and `preview/e2e/{movement-review,bird-cams,debug-tools,multiplayer-dev,experience-runner}.js`.

| Deliverable | Classification | Exact evidence under this worktree |
| --- | --- | --- |
| Repository review and phased plan | Verified | `docs/movement-world-review.md` |
| Birds: smoothing, hints, obstacle and busy-scene checks | Verified within tested scope | `data/reports/movement-retry/unit-final.log`, `motion-metrics.json`, `browser-verified.json` |
| Jev: route/sensing debug and narrow avoidance improvements | Verified within tested scope | `data/reports/movement-retry/unit-final.log`, `browser.json`; `output/playwright/jev-navigation-sensing.png` |
| World-scale and engine assessment | Verified as an assessment; expansion not implemented | This report's Practical world growth section and linked official references |
| Indoor/outdoor placement workflow | Verified within tested scope | `data/reports/movement-retry/browser-verified.json`, `shared.json`; `output/playwright/indoor-placement-coordinates.png`, `builder-coarse-grid.png` |
| Silvan bare-arm vine fit | Verified within tested scope | `data/reports/movement-retry/unit-final.log`, `browser.json`, `shared.json`; `output/playwright/silvan-fitted-full.png`, `silvan-shared-district.png` |

Final checks:

- `npm test`: **645/645 passed** after integration; the earlier patch passed 629/629 on its original base.
- `node --test server/tests/world.test.js`: **35/35 passed** after integration. This is the focused world suite, not the full server suite.
- `npm run build`: **exit 0** after integration.
- Five browser journeys passed: movement review (6 checks), bird cameras (15), debug tools (24), carriage/companion (11), and two-player development (28). `browser.json` contains the first four; `browser-verified.json` supersedes bird/debug results; `shared.json` contains the final two-player run.
- After integration, `npm run test:experience -- movement-review bird-cams debug-tools carriage-companion` passed all four journeys, and `npm run test:shared -- development` passed the two-browser journey with the current character picker and saved designs.
- `python3 scripts/check_secrets.py --all`: **exit 0**, no leaks found (`secrets-final.log`). An earlier scan flagged the disposable Node compile cache created by the test runner's temporary directory. That generated cache was removed; no source allowlist or scanner rule was weakened. The final scan includes tracked and unignored source/artifact files.
- `git diff --check`: **exit 0** (`diff-check.log`).

- `motion-metrics.json`: at 30/60/120 Hz, the original altitude controller peaked at 7.74/7.87/7.93 m/s and 464/944/1904 m/s² on reversal. The patch measured 4 m/s and 6 m/s². This is a synthetic controller measurement, not a claim about every terrain/contact discontinuity.
- Busy simulation: three birds, 500 interests, 500 trunk obstacles, ten runs of ten simulated seconds, zero collision violations. CPU elapsed time was 35.9–72.0 ms per run. This excludes rendering and multiplayer transport. A regression also checks that 500 interests use the same number of collision queries as one.
- Browser journeys use the actual district route for bird controls, walking/flight debug, indoor coordinate copying, shared placement, and local/remote Silvan appearance. Isolated rig renders supplement those journeys with full/profile/walking inspection; they do not replace the production scene.
- The optional Jev service was unavailable or stubbed. These receipts verify local movement/fallback and UI, not live model decision quality, hosted WorkOS, production Redis failover, or native Electron/Unreal behavior.
- Vine fitting is limited to feminine Silvan's bare upper arms. Independent rest-mesh sampling flagged possible millimeter-scale tube contact at a few points. Screenshots support the visible improvement; exhaustive pose/art acceptance remains open.
- The reload-heavy debug journey logged texture requests aborted during navigation and unavailable loopback service requests. Rendered captures were inspected; this is not a claim of a warning-free console or live provider availability.
- The build emits the existing warning about chunks above 500 kB. Large-world GPU capacity and multiplayer load capacity remain unmeasured.

The branch retains the patch. Keep the worktree until the pull request has been reviewed and its local evidence is no longer needed.
