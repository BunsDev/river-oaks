# Tests that protect behavior

Run `uv run pytest -q` for deterministic local checks. Tests use synthetic geometry, in-process HTTP transports, and temporary repositories. They do not download live GIS, call paid Jev inference, or require a GPU.

Run `npm test` for browser simulation and UI contracts, `npm run test:server` for authentication, shared state, transport, and abuse-control regressions, and `npm run build` for the production bundle. `npm run dev` joins the local shared town, which locks the character to Jevica and hides the invasion and auto visit. Run the solo browser scripts below (character forms, invasion, auto visit, render budget) against `VITE_MULTIPLAYER=off npm run dev`. `preview/e2e/multiplayer-dev.js` covers the town itself: two browsers join as development identities with no WorkOS, see each other, and arrive on separate spots. Production builds stay single player unless built with `VITE_MULTIPLAYER=required`.

Run `npm run test:experience` for the solo browser suite, including loading, graphics persistence, responsive controls, and movement/vehicle journeys. Run `npm run test:shared` for development onboarding plus authenticated two-player and keyboard recovery fixtures. These runners start and stop their own servers; see [commands, port requirements, and acceptance limits](experience-polish.md). The current [shared receipt](../data/reports/shared-experience.json) records all three shared journeys.

For an interactive two-player check, run `node server/tests/browser-fixture.js`, then:

```sh
npx --yes --package @playwright/cli playwright-cli -s=multiplayer open 'http://127.0.0.1:5180/?motion-debug=1' --headed
npx --yes --package @playwright/cli playwright-cli -s=multiplayer run-code --filename preview/e2e/multiplayer.js
npx --yes --package @playwright/cli playwright-cli -s=multiplayer run-code --filename preview/e2e/multiplayer-gate.js
```

This loopback fixture injects test identities in isolated browser contexts and uses the real WebSocket transport, world simulation, and rendered game. It checks peer avatars, shared wish consequences and undo, reconnect, movement, mobile layout, duplicate-account replacement, and logout. The [local acceptance report](../data/reports/multiplayer-e2e.json) records the checked scope. It does not establish live WorkOS sign-in, container deployment, or production proxy behavior. The fixture is excluded from the container image; production has no test login route. See [deployment acceptance](multiplayer.md).

The [September 28 controls check](../data/reports/multiplayer-controls.json) reruns `multiplayer.js` with the current Explore-panel labels and shared vehicle controls. It covers two players, wishes, reload, movement, mobile layout and logout; identities remain test fixtures.

For the Redis backend, put a test database URL in a private env file and run:

```sh
node --env-file=.env.redis-test --test server/tests/*.test.js
node --env-file=.env.redis-test server/tests/redis-browser-fixture.js
```

Run the same browser scripts against the Redis fixture. The [Redis browser receipt](../data/reports/redis-multiplayer-e2e.json) records the separate-instance acceptance run. Alice and Bob connect to separate backend servers; HTTP tickets may come from a different server than the socket. Redis tests use random `river-oaks:test` namespaces and delete only their own keys. They skip when `REDIS_URL` is absent; a skipped run is not Redis verification. Never use `FLUSHDB` for cleanup. The fixture uses test identities, so live WorkOS login and hosted Vercel routing remain separate acceptance checks.

| Risk | Test evidence |
| --- | --- |
| Wrong units or handedness | Python projection round trip in meters; separate UE coordinate tests |
| Partial GIS download | Missing object IDs reject the page; long-ID queries use POST |
| Corrupted generated geography | Shifted/missing roads, invalid bounds, and houses outside setbacks fail verification |
| Fabricated canopy accuracy | Missing/same-source reference blocks; equal coverage in a different location fails |
| LiDAR subset loses observations or invents ground | Additive EPT traversal includes ancestors; missing/cyclic hierarchies and excessive counts fail; vegetation needs nearby class-2 ground; vertical offsets preserve relative height |
| Canopy rendering uses stale geometry or loses map regions at LOD | Runtime frame/source hashes and return accounting are checked; every voxel belongs to exactly one spatial batch |
| Inference stalls or misbehaves | 500-agent deadline/cancellation, concurrency cap, invalid actions, partial answers, and local collision override |
| Service changes schedules | Night and midday jogger pauses persist with the service connected |
| Unbounded service queue | Concurrent request returns 503 while the first is active |
| Resident identities lose continuity or become misleading | Separate sourced public-figure portrayals, independent per-scene encounter memory, distinct voice assignment, bounded role context reaching the mocked Jev transport |
| Speech continues after mute or exhausts resources | Cancellation fences late audio and pending retries; explicit busy responses recover within bounded retries; missing models fail immediately; playback rejection frees URLs; timeout keeps the one-worker gate; WAV validation and cache bounds use injected synthesis |
| Walking or a mission has no real effect | Source-footprint collision, frame-rate-independent movement, finite resources, delayed visit completion, and achievable/failing community outcomes |
| Rapid arrival talks to the previous resident | Browser arrival, close and E occur in one task, before the HUD can refresh; the current nearby resident must respond |
| Resident motion crosses geometry or stalls the render thread | Bounded routes avoid footprints/trunks; actual browser navigation runs in a worker; speed caps, passing pedestrians, pause and conversation holds preserve positions |
| Old routes or reactions override a new situation | Weather, scene generation, request tick/age and current action fence late work; expired shelter reactions release residents |
| A visit awards support without anyone arriving | District work requires the assigned helper within 1.5 m; real routes go around footprints; pause and storms hold visits; inaccessible paths return unused capacity once; reset discards late routes |
| Invasion leaves unavailable neighbors interactive or breaks visits | Abduction blocks encounters, support, recruitment and inference; queued, traveling and assisting visits hold and resume without refunding capacity; world reload disposes old crew and releases residents |
| Street furniture leaves the mapped streets or blocks a junction | Kerb strips sit at their own lane edge and clear joining lanes; lamps, planters and bins stay beside a lane, outside footprints and off inner bends; window rows fit under every mapped parapet |
| Time of day only rotates shadows | Dusk lowers sun, sky, environment and exposure together and warms the light; every hour and weather stays finite and continuous |
| Secret accidentally committed | Index scan catches a synthetic token despite a clean unstaged replacement; `.env` force-add is rejected; missing scanner fails closed; actual Git commit is blocked in a temporary repository |

There is no arbitrary test-count or coverage-percentage target. Add a regression that reproduces a risk or failure before fixing it. Avoid snapshotting implementation details, mocking your own helpers, host-sensitive timing assertions, and tests that only assert source strings exist.

The 500-agent timing script records measurements without enforcing host-dependent pass thresholds. It measures local Python classification only. Full inference latency must include serialization, networking, provider time, batch deadlines, fallback rates, and all-agent update age. UE acceptance needs a frame-time trace recording resolution, upscaling, GPU/driver, scene, population, weather, and engine version.

Unreal Editor/Game builds and native automation have run on UE 5.8.2. See [native resident validation](native-residents.md#animation-and-verification) and [engine acceptance](engine-acceptance.md) for measured results. Source-only hosts can run `RiverOaks.Contracts`; the full `RiverOaks` group additionally requires the imported resident assets. These checks do not establish packaging, complete collision integration or target performance.

With both development servers running, the browser CLI scripts `preview/e2e/district.js`, `sidebar.js`, `personas-voice.js`, `resident-life.js`, `volunteer-visits.js`, and `visual-fidelity.js` operate real controls and record UHD/mobile screenshots. The voice script additionally needs the optional model and tests actual local synthesis/playback, alongside the hermetic unit tests. It does not run in dependency-only CI. None of these browser checks establishes target-GPU 60 fps or photographic accuracy.

`preview/e2e/jev-voice-picker.js` drives **Settings → ElevenLabs → Jev's voice** with the bridge's voice endpoints stubbed: it checks the named voices are offered, that choosing one sends its ID to the bridge, that the custom-ID path validates before sending, and that a reload shows whatever voice the bridge reports. `preview/e2e/jev-settings.js` needs the real bridge on 8765 (`uv run river-oaks serve`) with no keys configured.

`preview/e2e/places.js` drives the **Places** tab in solo play: the arrival label, one row per named place, a teleport beside a community spot, saving, reloading, returning to and removing a landmark, and the `?place=` and `?at=` links, including a link outside the district (ignored) and one into a building (refused).

`preview/e2e/debug-tools.js` opens the [debug tools](debug-tools.md) with F3 and checks every overlay against the district data: 9 colliders, 39 roads, 30 rooms, the walkable grid and ground triangles. It also checks the cursor readout, the polygon inspector (without starting a conversation), wireframe restore and the desktop menu event. Run it against `VITE_MULTIPLAYER=off npm run dev`.

For pointer regressions, start `npm run dev`, then run the Playwright CLI scripts:

```sh
npx --yes --package @playwright/cli playwright-cli -s=river-oaks open http://127.0.0.1:5173/ --headed
npx --yes --package @playwright/cli playwright-cli -s=river-oaks run-code --filename preview/e2e/pointer-gestures.js
npx --yes --package @playwright/cli playwright-cli -s=river-oaks run-code --filename preview/e2e/moving-people.js
```

`pointer-gestures.js` rejects secondary clicks and camera drags that return to
their starting point, then verifies primary selection. `moving-people.js` uses
the directory and keyboard to approach six rigs, clicks them while walking, and
checks conversation holds, resumed motion, and unchanged visitor positions.
The district simulation remains active. Read-only development diagnostics supply
screen coordinates; no simulation state is injected. Both scripts save images
under `output/playwright/` and work with the optional bridge offline. They don't
verify live Jev responses or native Unreal behavior.

`preview/e2e/reaction-transitions.js` runs all six shipped rigs through resting,
reaction, greeting and interrupted gestures. It measures actual bone rotations and
wrist displacement each frame, rejecting one-frame pose changes above 0.15 radians
or 6 cm at 60 Hz. Run it through the same Playwright CLI after starting dev. The
fixture uses deterministic frames and does not establish facial expression quality,
continuous collision, target-GPU performance or native Unreal parity.

## Frame budget and HUD

`preview/tests/frame-budget.test.js` checks that each skeleton uploads once per
composed frame, that every shipped rig renders from one shared skeleton, and
that the AO pass hides excluded objects immediately while preserving hidden subtrees.
`render-quality.test.js` covers the Auto resolution controller: it steps down
when a 60 Hz display misses refreshes, recovers gradually, settles on a
borderline GPU and ignores tab switches. `asset-progress.test.js` covers the
streaming count and the capped wait for surface textures.

`npm run test:experience -- hud-and-quality` starts its own solo server. It waits for the
progress pill to count every file and step aside, switches Settings > Graphics
between Auto, Smoothest and Sharpest while the canvas keeps native size,
reloads to check the choice persists, and toggles Clear view with H and the
chip. `render-budget.js` pins Sharpest, since it measures the full-quality
budget. Frame times on a shared GPU vary with load, so compare against an
unmodified checkout in interleaved runs before claiming a change.

The installed secret hook runs on commits in this checkout. New clones must install it. CI scans the worktree and complete fetched history; require its checks in branch protection to enforce the merge gate. Scanners cannot detect every secret format, and local hooks can be bypassed. Tests verify the configured guard's behavior rather than claiming absolute prevention.

## Manual Jev key override

Run `uv run pytest -q tests/test_jev_settings.py` to verify credential selection
for both inference engines, replacement, restoration, validation, and responses
that omit keys. These tests use a mocked provider.

The browser regression in `preview/e2e/jev-settings.js` expects the preview at
`http://127.0.0.1:5181` and a local bridge with no configured key. It submits only
fixture keys and intercepts inference requests so they never reach Jev. It checks
masked input, key clearing, browser storage, reload, replacement, reset, bridge
failure, and a save that succeeds on the bridge but loses its response.
Successful settings acceptance does not establish that a supplied key is valid
with the provider. Jev validates it on the next inference request.

## Jevica wishes

Run `npm test` to check the five wish lifecycles, room boundaries, overlapping
incidents, rendering restoration, and volunteer pause/resume rules. With the
preview running, verify the controls and effects with:

```sh
npx --yes --package @playwright/cli playwright-cli -s=jevica-wishes open http://127.0.0.1:5173/ --headed
npx --yes --package @playwright/cli playwright-cli -s=jevica-wishes run-code --filename preview/e2e/wishes.js
```

The script grants and undoes each wish through the conversation controls. It
checks the loaded resident models, egg hatching, flight height, clothes-only
invisibility, sadness, dog replacement, restored visibility, keyboard focus,
and mobile controls. It uses read-only development diagnostics and doesn't
inject simulation state. Results are recorded in
[the wish receipt](../data/reports/jevica-wishes-e2e.json); screenshots go to
`output/playwright/wish-*.png`. This covers the browser preview, not native Unreal
or human accessibility acceptance.

Run Playwright CLI from the repository root: speech and facial comparison scripts
load generated candidates from `data/raw/` relative to that directory. Generate
those optional candidates before running the comparison scripts. Solo directory
and nearby encounter sweeps cover 194 people: 24 outdoor residents, 169 indoor
residents, and Prince Jev, the carriage driver. Both wait for his model to load.
Older dated reports with 193 people predate the carriage encounter.
