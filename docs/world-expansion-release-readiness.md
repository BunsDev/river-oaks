# Connected-world expansion: MVP release readiness (#587)

**Recommendation: NO-GO for a player-facing MVP demonstration. GO for internal review.**

Assessed 2026-10-23 (UTC) on `main` at `638a157f5b0673381be893f1699434b1d24ec82c`, which includes East Garden Commons (PR #594, revision `east-garden-commons-blockout-1`), plus this gate's changes. Commons is stable. It loads, recovers from failures, synchronizes two players, blocks walking correctly, survives reconnects, and frees renderer resources on rebuild. The full two-player keyboard round trip passed 24/24 checks, and its performance cost is within budget. The no-go rests on scope that other active tasks own: the destination is still a grey-box blockout that is not visually credible beside the District (#584–#586), map sections are not yet streamed in and out (#583), and no target hardware has been agreed.

## What was assessed

| Item | Value |
| --- | --- |
| Head | `main` `638a157f` + this gate's working changes (listed under "Fixes made in this gate") |
| Destination | East Garden Commons, delivered by task `world-expansion-580-581` in PR #594 (merge `1cb79549`) |
| Gate branch / worktree | `test/world-gate-587-20261022`, `river-oaks-world-gate-587` |
| Host | Apple M5 Max, 18 logical CPUs, macOS, Chromium (Playwright) via ANGLE Metal, Sharp quality, reduced motion |
| Target hardware | **Not agreed.** #580 leaves physical mobile frame-time, memory and thermal limits undecided. Every figure below comes from one development host; the phone-sized viewport shares the desktop GPU. |

## Results on main `638a157f`

### Automated regression

| Check | Result |
| --- | --- |
| `pnpm run verify` (core, 11 phases) | **Passed.** Tooling 204/204; preview 3873 passed, 1 skipped; server 775 passed, 217 skipped (Redis-only cases); desktop 115 passed, 3 skipped; Python 149 passed. Build, lint, demo and secrets checks also passed. Log `.runtime/world-gate-587/core-main.log`, receipt `core-main.json`. |
| Focused Commons, manifest and location-label suites | 62 passed, 2 skipped (Redis-only), 0 failed |
| Commons Redis suites on isolated `127.0.0.1:16487` | 6/6 passed, 0 skipped (on the pre-merge snapshot; covers migration, rollback, epoch fencing, HTTP + WebSocket transport and reconnect). Delivery of #594 records them passing again with isolated Redis. |
| Gate browser journey `world-gate-587` | **Passed, 24/24 checks, 0 page errors, 694 s.** Finished 2026-10-23T12:57Z. Report `.runtime/world-gate-587/journey-9.json`, log `journey-9.log`. |

### Player journey: District arrival → Commons → return

Two rendered clients (`owner`, `alice`), 1440×1000 and 1280×900, reduced motion, Sharp quality, in-memory authority. Walking is **keyboard only**: arrow keys turn, W walks, Shift walks briskly; no pointer steering.

| Step | Result |
| --- | --- |
| First world-manifest request aborted | **Pass.** The client falls back to the default District. The first socket snapshot reports the served revision, and the page reloads once onto Commons. |
| District data file aborted during a rebuild | **Pass.** `#loading` (role `status`) shows "Preview unavailable … Use reload…". **The new "Reload world data" button takes focus, and Enter recovers Commons** with all assets loaded and 0 failures (fix 2). |
| Accessible names on movement/interaction controls; focusable scene | Pass |
| Both players arrive in the original District; routes reach the eastern gateway | Pass |
| Both clients walk District → promenade → plaza by keyboard | **Pass.** Owner 22.5 + 17.4 s, alice 36.4 + 32.2 s. |
| HUD names the location | **Pass.** "River Oaks District" at the gateway, "East Garden Commons" in the plaza (fix 1). |
| Each client sees the other within 1 m of its server pose | Pass at arrival, after reconnect and back home (measured drift 0 m each time) |
| Pavilion post, rain garden, plaza edge vs the empty reserve | All block walking (client and server) |
| Browser reconnect inside Commons (socket closed) | **Pass.** Same identity, position drift < 0.5 m, resynced in 1.0 s |
| Five District ↔ Commons crossing loops | **Pass.** Renderer geometries/textures 578 / 185 on every loop |
| Both players walk home across the seam | **Pass.** HUD reads "River Oaks District"; sync 0 m |
| Live-region announcements | **Pass.** Exactly 12 notices, alternating "Entering East Garden Commons" / "Back in River Oaks District": one per crossing |
| Twenty world rebuilds through the reload control | **Pass.** All twenty at 567 / 180 geometries/textures. No growth. |
| No page errors over the whole run | Pass |

**Session resources:** renderer counts are 545 / 154 at District arrival, 578 / 185 with Commons in view and through every loop, and 604 / 210 back home. They are stable across repeated crossings, but nothing is freed until a world rebuild. That is expected until map sections are streamed in and out (#583); it is not a leak.

### Performance against the #580 baseline (matched Gardens vs Commons)

`node preview/audit/world-gate-587.js` on `638a157f`. The setup matches on both sides: same host, browser, quality, camera, one player, and medians of three 30 s samples per view. Host load averages were 5–10. Report `.runtime/world-gate-587/perf-2026-10-23T12-57-36.798Z/report.json`.

| Arrival view | Gardens CPU p95 | Commons CPU p95 | Ratio | Budget ≤ 1.10 | Frame p95 G / C | Draw calls G / C | Triangles ratio |
| --- | ---: | ---: | ---: | --- | --- | --- | ---: |
| Desktop 1440×1000 @1 | 9.8 ms | 10.0 ms | 1.020 | Pass | 16.7 / 16.7 ms | 1629 / 1640 | 1.020 |
| Phone-sized 390×844 @2 | 8.4 ms | 8.4 ms | 1.000 | Pass | 16.7 / 16.7 ms | 1244 / 1237 | 1.023 |

- Frame p95 sits at the 60 Hz vsync cap in every sample, so frame time cannot tell the revisions apart on this host. CPU time per frame is the measure that distinguishes them.
- Commons plaza view: 236–244 draws, 6.0 / 5.5 ms CPU p95.
- Join readiness: 3.4 s vs 3.4 s desktop and 3.1 s vs 3.4 s phone-sized; 0 asset failures. Geometries at arrival +3; textures unchanged.
- Production build (measured on the pre-merge snapshot against its base): JS +4,514 B gzip (+0.23%). Commons adds no assets, so the 10% initial-download budget passes.
- The earlier snapshot run (`perf-2026-10-23T00-55-52.843Z`, host load 9–45) gave ratios of 0.894 and 1.023, which agrees within noise.

No high-impact rendering, memory, loading or network bottleneck attributable to the expansion was found. No optimization was warranted. The heaviest view is still the existing District arrival (≈1,640 draws, ≈5.5 M triangles), which predates the expansion.

### Visual consistency (screenshots inspected)

Inspected: `output/playwright/world-gate-587-{district-arrival,commons-gateway,commons-plaza,commons-pavilion,district-return}.png` from journey 9, and the perf captures.

- District arrival and return match the Gardens baseline view.
- **Commons is not visually credible for players.** The gateway shows the District's patterned paving ending abruptly at a plain ivory promenade across an empty field. The plaza is a flat ivory slab with a four-post box pavilion, box benches and a flat green planter, on a repeating brown ground texture that runs to the horizon with no edges, vegetation or façades. The reused salon chess table renders at District quality; the box structure around it does not. The palette is consistent with the District; the level of detail is not.
- Not inspected visually: the new "Reload world data" button in the error panel. It copies the existing "Report this problem" button's styles, and the journey checks its focus and behaviour, but no screenshot was taken.

## Fixes made in this gate

1. **Location orientation for keyboard and screen-reader players.** The walking HUD read "public district paths" everywhere, including inside Commons, and nothing announced a crossing. On a revision with a connected location, it now names the current location (River Oaks District / East Garden Commons) from the shared movement surfaces. Each crossing is announced once through the existing polite `#walking-notice` live region. Default and Gardens revisions are unchanged. Files: `preview/src/world-location-label.js`, `preview/src/walking-ui.js`, `preview/tests/world-location-label.test.js`.
2. **Keyboard recovery from a load error.** The error said "Use reload", but the reload button lives in the controls panel, which walking mode hides, so keyboard players could not reach it. The error panel now carries its own "Reload world data" button. It appears only for the world-data failure (context-loss and WebGL errors keep their existing copy), takes focus, and is hidden again when a reload starts. Files: `preview/index.html`, `preview/src/main.js`, `preview/src/hud-glass.css`. Covered by the journey check "A keyboard player can reload from the error, which takes focus".
3. **Gate tooling.** The `world-gate-587` journey (`preview/e2e/world-gate-587.js`, registered in `experience-runner.js` and run only when named) and the matched perf audit (`preview/audit/world-gate-587.js`).

## Release blockers

1. **Visual credibility (#584, #585, #586).** Replace the blockout with kit assets. Treat the plaza edges and reserve boundary with planting, low walls or façades, so bare ground is not visible to the horizon. Match the District's lighting and material detail. Owned by the active tasks `neighborhood-584-586` and `destination-slice-584-586` (draft PR #611, "Bayou Market Commons"). The gate must be rerun on that destination when it lands.
2. **Streaming map sections in and out (#583) and resident routing.** Commons is always loaded, so asset cleanup is proven only for whole-world rebuilds. Commons has no residents, and its benches have no sit interaction. #582/#583 are owned by the active task `world-streaming-582-583`.
3. **No agreed target hardware.** Physical-device budgets (#580) must be set and measured. The host numbers above cannot stand in for them. This needs a product decision.
4. **No human review.** A human visual approval and a human keyboard + screen-reader pass of the round trip have not been done.

## Remaining limitations of this evidence

- All browser evidence comes from one machine, with two fixture clients sharing its GPU, and from in-memory authority. Redis transport is proven by server tests only.
- No hosted, production-build, WebKit/iOS or physical-device runs.
- Automated accessible-name, focus and live-region checks are not a substitute for human review.

## History (pre-merge snapshot)

The gate first ran against a read-only snapshot of the then-uncommitted expansion (on base `6ff47ba1`):
- Core passed (preview 3782, server 742 passed).
- Perf ratios were 0.894 and 1.023.
- Journey attempt 8 passed 23/23 (`.runtime/world-gate-587/journey-8.*`). It surfaced the keyboard-reload defect fixed above.

Attempts 1–7 failed on the gate's own assumptions, not product defects:
1. An aborted manifest heals itself by design.
2. `#reload` is hidden while walking.
3. Spawns that land on the road need `allowRoads:true`. The `east-garden-commons` journey shares this latent flake.
4. The shared browser-queue lock threw errors under load.
5. The client pose was in Three.js axes, not east/north.

The snapshot copy was stashed in the gate worktree (`git stash list`) when the gate moved onto `main`. Every file in it is either identical to `main` or an earlier state of work committed in #594.

## Reproduce

```sh
node --test preview/tests/world-location-label.test.js preview/tests/east-garden-commons.test.js preview/tests/world-manifest.test.js server/tests/east-garden-commons*.test.js
REDIS_URL=redis://127.0.0.1:<isolated-port>/0 node --test server/tests/east-garden-commons-transport.test.js server/tests/east-garden-commons-migration.test.js
pnpm run verify
RIVER_OAKS_E2E_REPORT=world-gate-587.json node preview/e2e/experience-runner.js world-gate-587
node preview/audit/world-gate-587.js
```

## Release checklist

- [x] Destination committed; gate run on a committed `main` head (`638a157f`)
- [x] Core gate green; Commons Redis suites green with zero skips
- [x] `world-gate-587` journey green (24/24)
- [x] Matched perf: CPU p95 ratio ≤ 1.10 on both profiles; production JS gzip growth ≤ 10%
- [x] Keyboard-reachable reload in the load-error state
- [ ] Realistic destination (#584–#586) landed; gate rerun on it, and `east-garden-commons` (shared chess) journey green on the same head
- [ ] #583 streaming: twenty travel loops with no growth after eviction
- [ ] Target-device measurements recorded against agreed budgets
- [ ] Screenshots of gateway, plaza and pavilion approved by a human reviewer
- [ ] Human keyboard + screen-reader pass of the round trip
