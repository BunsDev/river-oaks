# Penthouse skyline prototype (#363 views, kit guide P26)

- **Task:** `office-skyline-prototype` (live register), owner `claude:river-oaks-penthouse (7a57e655)`.
- **Branch / worktree:** `feat/office-skyline-prototype-20261015` in `../river-oaks-office-skyline`, from `origin/main` `9d83cd31`.
- **Issues:** #363 (bounded views, terrace exterior), #362 / kit guide P26 (outdoor scenery: a cosmetic backdrop that
  never moves the office, replaces geography or alters authority).

## Objective

Once the elevator doors close, `borrowOfficePresentation` hides every street object, so the penthouse terrace (and the
glass a sibling branch is adding) looked out at bare sky. Show the actual district instead: a local picture, penthouse
only, at no cost to the legacy room.

## Approach

1. **One capture per visit** (`preview/src/office-skyline.js`). A `CubeCamera` renders the district into a half-float
   `WebGLCubeRenderTarget`, from the middle of the ground floor's whole plan (main floor and terrace, x −4, d 10) at
   standing height, at the office's final elevation (frame + 24.3 m) whatever the cabin's position.
2. **When.** `office-world-scene.js` calls `capture()` on the first frame that goes inside, just before
   `lease.inside(true)` hides the street: as the doors finish closing, or on the first frame when the arrival is skipped
   or reduced motion is on. The district is still drawn then; the player sees only the closed cabin.
3. **What is left out.** The office stage, the borrowed lobby and cabin, the visitor's avatar and the peer root are hidden
   for the capture. The eye stands inside the mapped 28 m tower, so everything of the host building that reaches above the
   office floor is collapsed for the capture only and restored right after: its facade instances by building index
   (`userData.buildingIndices`), its massing by id (`userData.districtBuilding`), and anything else whose centre stands in
   its footprint (the mapped ring, with a 1 m margin for parts on the wall). The last rule exists because the first GPU
   capture showed a large ring overhead: a near-field probe traced it to the retro-futurist rooftop ornament (instanced
   spheres, tori and cylinders tagged only with `storeIds`) about 4 m from the eye. A district-wide merged mesh that merely
   overlaps the footprint (the sign sheet) is never hidden. The podium below the floor and every neighbour stay.
4. **Shown as** `scene.background`, at intensity 1 (the faces already hold the sky at its own intensity), with blur and
   rotation cleared. Every face clears; the sun's shadow maps from the last street frame are reused rather than redrawn
   six times. No lights are added (the fixed light pool is untouched), no network or asset loads.
5. **Restored** on every exit path through the visit's `dispose` (leave, revoke, disconnect, world rebuild): background,
   intensity, blur and rotation return, unless the sky changed while inside (time of day or weather), which then belongs
   to the street. The render target is disposed. A capture requested after dispose does nothing; a failed capture
   restores everything it borrowed and shows no backdrop.
6. **Sizes.** 1024 per face at full render scale, 512 below 0.75, capped by `maxCubemapSize`. **CPU software acceptance
   takes no capture:** six full-district views on SwiftShader pushed the repository penthouse smoke past its 60 s wait for
   the office (first run below), and that profile already leaves visual quality to GPU runs. **Switch:**
   `?office-skyline=off` in development builds.

## Files owned

`preview/src/office-skyline.js` (new), `preview/tests/office-skyline.test.js` (new), `preview/src/office-world-scene.js`
(skyline hook: create, capture before going inside, dispose, `inspect().skyline`), `preview/src/office-world-presentation.js`
(`captureOfficeStreet` carries `renderer` and `skyline`), `preview/src/main.js` (passes the renderer, the size and the
switch), `docs/offices.md` (one bullet), this ledger, the register entry.

## Measurements

GPU memory per capture: colour 6 × size² × 8 bytes (RGBA half float) plus depth 6 × size² × 4 bytes:
**72 MiB at 1024**, 18 MiB at 512. It lives for the visit and is released on leaving.

Capture time, `inspect().skyline` (`submitMs` CPU submission, `ms` until `gl.finish` returns), Chrome Headless Shell
156.0.8078.4, Metal ANGLE, 1440 × 900, on a Mac shared with other sessions' browser runs and dev servers:

| Run | Size | ms | Hidden host instances | Inside frame median / p95 |
| --- | --- | --- | --- | --- |
| skyline on, 08:40Z (first visit after start) | 1024 | 1319.7 | 155 | 16.7 / 16.8 ms |
| `?office-skyline=off`, 08:40Z | — | — | — | 16.7 / 16.7 ms |
| skyline on, probe run, 09:05Z | 1024 | 119.3 | 155 | — |
| skyline on, footprint rule, 09:26Z | 1024 | **97.4** | 160 instances, 3 meshes | 16.7 / 16.8 ms |

`submitMs` equalled `ms` in the later runs, so Chrome's `gl.finish` returned without waiting there: these are CPU
submission times, not measured GPU time. The 1.3 s first figure came from the first visit after a fresh server start on a
loaded machine (likely shader programs first used by the capture); it was not reproduced.

Showing the backdrop costs nothing measurable once captured (inside frame medians match with it off); the capture itself is
one long frame (about 0.1 s here) while the cabin doors are closed. Auto quality ignores it (a 45-frame median, frames over 250 ms discarded).

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/office-skyline.test.js`, written first | red (module missing), then 8/8 |
| `node --test preview/tests/office-*.test.js` | 79/79 |
| `pnpm run verify` (core) | passed: agent 109/109, preview 3100/3101 (1 skipped), server 534/681 (147 Redis cases skip without `REDIS_URL`), desktop 69/69, Python 141, build, lint, secrets; receipt `.runtime/agent/core.json` |
| `node --test preview/tests/office-skyline.test.js` after the footprint rule | 9/9 (the new case: an unindexed ornament and a wall part are left out, a neighbour, a low part, one 3 m out and the district sign sheet stay) |
| `node --test preview/tests/office-*.test.js` after the footprint rule | 80/80 |
| GPU views (Metal ANGLE), skyline on and `?office-skyline=off`, terrace walk (08:40Z, before the footprint rule) | on: captured, 1024, 155 host instances hidden, no page errors; the district shows past the terrace rail and through both terrace openings; a large ring overhead (the rooftop ornament, fixed below). Off: plain sky. Street restored after leaving in both. |
| `node preview/e2e/office-penthouse-runner.mjs` (software) with a 64 px capture | **failed**: timed out at 60 s waiting for the office phase; the failure screenshot shows the office reached late |
| same, software acceptance taking no capture | **passed** 6/6 checks, 47 s (09:05Z) |
| GPU views, skyline on, footprint rule (09:26Z) | captured, 160 host instances and 3 meshes hidden, no page errors; the ring overhead is gone. West: the Le Colonial wing roof below, a neighbour's edge, then the mapped district's flat ground to the horizon, crossed by thin dark lines from the district. South: the neighbouring residences, rooftops and parking deck. Screenshots in the session scratchpad, not committed. |
| Near-field probe (temporary, not committed) | ring overhead = `Retrofuturistic garden district` instanced ornament, ~4 m from the eye, no building index |
| `pnpm run verify` (core) after the footprint rule and the software skip | passed: agent 109/109, preview 3101/3102 (1 skipped), server 534/681 (147 Redis cases skip without `REDIS_URL`), desktop 69/69, Python 141; receipt `.runtime/agent/core.json` |

## Limits

- A cube backdrop has no parallax: it is exact only at the capture point (x −4, d 10). From the terrace, 15 m away, nearby
  roofs shift a little; distant buildings do not move.
- The picture is from the unraised 28 m building. The penthouse's own ceiling is 31.9 m; the raise to 33 m is held for
  activation. West of the tower the mapped district ends soon, so that side shows mostly flat ground to the horizon.
- The capture freezes the district, its people, cars and sky at the moment the doors close. A time-of-day change while
  inside replaces the backdrop with the plain sky (the street owns it); it is not re-captured.
- 72 MiB at 1024 is a lot for phones. The size drops to 512 when the render scale is reduced, but there is no device
  measurement yet. The timings above are CPU submission on one Mac, not GPU time or device evidence.
- CPU software acceptance (hosted CI's profile) never captures, so the CI journeys do not exercise the capture; the unit
  tests and the local GPU runs do.
- With the current opaque graybox walls, the district shows only through the terrace openings. The sibling glazing branch
  (#405) makes the front, east and terrace walls glass.

## Next

Independent review; device measurement (memory and capture time on a phone) before activation; spreading the six faces
over the closing frames if a device shows a visible hitch; a lower-memory format if phones need it; re-check the view once
the building is raised and the glazing lands.
