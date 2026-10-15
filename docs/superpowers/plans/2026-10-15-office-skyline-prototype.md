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
   for the capture. The eye stands inside the mapped 28 m tower, so for the capture only (restored right after):
   - **The tower's own skin:** host facade instances (`userData.buildingIndices`) that reach above the office floor or stand
     wholly above the host's lower roof (the top of its massing below the floor, plus a 1.2 m parapet allowance). A
     building's exterior skin cannot be seen from inside it. The rule exists because every capture showed two thin navy
     rings below the horizon; a raycast probe from the eye traced both to the tower's floor-line bands (colour `#283a66`)
     about 19–20 m out, the 24.3 m line just under the office floor and the 20.45 m line 3.9 m lower. A stepped host's
     lower wing (the Le Colonial parapet below the terrace) and its street frontage stay; a single-mass host hides its
     whole facade.
   - **Its massing** (`userData.districtBuilding`) and **anything else whose centre stands in its footprint** (the mapped
     ring, 1 m margin), where they reach above the office floor. This caught the retro-futurist rooftop ornament (instanced
     spheres, tori and cylinders tagged only with `storeIds`) that drew a large ring overhead about 4 m from the eye.
   - A district-wide merged mesh that merely overlaps the footprint (the sign sheet) is never hidden. Lower roofs and every
     neighbour stay.
4. **Shown as** `scene.background`, at intensity 1 (the faces already hold the sky at its own intensity), with blur and
   rotation cleared. Every face clears; the sun's shadow maps from the last street frame are reused rather than redrawn
   six times. No lights are added, no network or asset loads. The fixed light pool, which by `closingEnd` has been blended
   to the cabin and office lights, is put back on the street's own lights (the shop interior lights picked within 32 m of
   the street camera) for the capture and returned to the cabin right after, so the faces never show the district lit by
   the cabin.
5. **Restored** on every exit path through the visit's `dispose` (leave, revoke, disconnect, world rebuild): background,
   intensity, blur and rotation return, unless the sky changed while inside (time of day or weather), which then belongs
   to the street. The render target is disposed. A capture requested after dispose does nothing; a failed capture
   restores everything it borrowed and shows no backdrop.
6. **No GPU wait.** The capture never calls `gl.finish` (review of #408): it only submits the six faces. Stats report the
   host search (`traverseMs`), the CPU submission (`submitMs`), the whole `capture()` (`ms`) and the shader programs three.js
   first compiled for it (`newPrograms`). The host search rejects most instances from their translation and bounding reach
   before any exact box.
7. **Sizes.** 1024 per face at full render scale, 512 below 0.75, capped by `maxCubemapSize`. **CPU software acceptance
   takes no capture:** six full-district views on SwiftShader pushed the repository penthouse smoke past its 60 s wait for
   the office (first run below), and that profile already leaves visual quality to GPU runs. **Switch:**
   `?office-skyline=off` in development builds.

## Files owned

`preview/src/office-skyline.js` (new), `preview/tests/office-skyline.test.js` (new), `preview/src/office-world-scene.js`
(skyline hook: created inside the visit's try block, captured with the street lighting before going inside, released
through the visit's returned `dispose`, `inspect().skyline`; kept off the `dispose` line #405 changes), `preview/src/office-world-presentation.js`
(`captureOfficeStreet` carries `renderer` and `skyline`), `preview/src/main.js` (passes the renderer, the size and the
switch), `docs/offices.md` (one paragraph, clear of #405's edit), this ledger, the register entry.

## Measurements

GPU memory per capture: colour 6 × size² × 8 bytes (RGBA half float) plus depth 6 × size² × 4 bytes:
**72 MiB at 1024**, 18 MiB at 512. It lives for the visit and is released on leaving.

Capture time, `inspect().skyline`, Chrome Headless Shell 156.0.8078.4, Metal ANGLE, 1440 × 900, on a Mac shared with
other sessions' browser runs and dev servers. Rows before 09:38Z still waited on `gl.finish` (since removed), and their
`ms` excluded the host search.

| Run | Size | Host search | Submit | Whole capture | New programs | Longest frame | Hidden |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 08:40Z first ever, `gl.finish` | 1024 | — | — | 1319.7 | — | — | 155 inst. |
| 09:05Z probe, `gl.finish` | 1024 | — | 119.3 | 119.3 | — | — | 155 inst. |
| 09:26Z footprint rule, `gl.finish` | 1024 | — | 97.4 | 97.4 | — | — | 160 inst., 3 meshes |
| **09:38Z fresh browser, first visit** | 1024 | 12.9 | 150.0 | **162.9** | **0** | 200 ms | 160 inst., 3 meshes |
| **09:38Z same page, second visit** | 1024 | 6.5 | 16.9 | **23.5** | 0 | 33 ms | 160 inst., 3 meshes |
| 09:38Z same page, 19:00 | 1024 | 3.0 | 14.8 | 17.8 | 0 | 33 ms | 160 inst., 3 meshes |
| 09:44Z / 09:50Z combined with #405, fresh browser | 1024 | 13.6 / 13.8 | 133.5 / 146.5 | 147.2 / 160.6 | 0 | 433 / 183 ms | 160 inst., 3 meshes |
| 10:04Z / 10:05Z all host facade hidden (branch / combined) | 1024 | 11.7 / 13.0 | 132.0 / 117.6 | 144.4 / 130.8 | 0 | 167 / 150 ms | 2119 inst., 3 meshes |
| **11:14Z tower skin rule (branch / combined)** | 1024 | 12.7 / 14.1 | 151.4 / 128.4 | **164.3 / 142.5** | 0 | 200 / 167 ms | 177 inst., 3 meshes |

Inside frames (09:26Z): median 16.7 ms, p95 16.8 ms, the same as `?office-skyline=off` (16.7 / 16.7 ms). The host search
is 3–14 ms, small beside the first submission, so it is not cached.

**The first-visit cost (review item 4).** Three.js compiles no new shader programs for the capture (`newPrograms` 0, even
in a fresh browser), yet the first capture in a page submits in 130–150 ms and a later one in 15–17 ms. So the first-use
cost sits below three.js: most likely the GPU pipeline states ANGLE/Metal create for the existing programs drawing into a
new target format (single-sample RGBA16F cube faces; the street draws into a 4-sample composer target), plus first uploads
for district objects the street camera had not yet drawn. That is an inference from these numbers, not a profile. The
1,320 ms first-ever figure also waited on `gl.finish`, on a cold machine, and was not reproduced. Mitigation if a device
shows a visible hitch: the capture already lands while the cabin doors are closed; spreading the six faces over the
closing frames would cut the single frame to about a sixth. A warm-up render earlier would move the same cost into a frame
the visitor can see, so it is not recommended.

**Lighting at capture (review item 3).** The dev build has no night: the time-of-day control runs 07:00–19:00, and the
presets are 13:00, 17:30 and 16:00 haze. A 19:00 capture (latest available, 09:38Z run) is lit by the low dusk sun, warmer
on the rooftops, under the same sky image (`review/a-1900-terrace-south-street.png`, `review/a-1900-terrace-west.png` in
the session scratchpad). The pool lights are shop interior lights (intensity 10, 10 m range) near the street camera; they
are now restored for the capture, and at 26 m their effect is not visible in these shots. A true night check needs a
night setting the build does not have.

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
| GPU views, skyline on, footprint rule (09:26Z) | captured, 160 host instances and 3 meshes hidden, no page errors; the ring overhead is gone. West: the Le Colonial wing roof below, a neighbour's edge, then the mapped district's flat ground to the horizon. (The thin dark lines also visible then were the host's floor-line bands, fixed below, not district edges as first written.) South: the neighbouring residences, rooftops and parking deck. Screenshots in the session scratchpad, not committed. |
| Near-field probe (temporary, not committed) | ring overhead = `Retrofuturistic garden district` instanced ornament, ~4 m from the eye, no building index |
| `pnpm run verify` (core) after the footprint rule and the software skip | passed: agent 109/109, preview 3101/3102 (1 skipped), server 534/681 (147 Redis cases skip without `REDIS_URL`), desktop 69/69, Python 141; receipt `.runtime/agent/core.json` |
| `node --test preview/tests/office-skyline.test.js` after the review fixes | 9/9 (adds: no `gl.finish`, the timing and program fields, the street pool lighting the faces then returned to the cabin; removing the restore fails the test) |
| `node --test preview/tests/office-*.test.js` after the review fixes and `origin/main` | 80/80 |
| `git merge-tree` with `origin/feat/office-penthouse-glazing-20261015` (#405, `bef644ee`) | clean after moving the hook and the docs paragraph (it conflicted on the `dispose` line and the docs bullet before) |
| Signed merge of `origin/main` (`b5d99a13`) into this branch | `175b6e0c`; the register merged by task id, valid JSON; `project:check --tasks <primary>` adds no gap for this task (the only new one was the scratch worktree, since removed) |
| `pnpm run verify` (core) after the merge | passed: agent 109/109, preview 3113/3115 (1 skipped, 1 todo), server 549/698 (148 skipped without `REDIS_URL`, 1 todo), desktop 69/69, Python 141 |
| Combined #405 + this branch, detached scratch from `origin/main`, office tests | 84/84 |
| Combined GPU walk (09:44Z and 09:50Z, browser lock) | see Combined view below; no page errors |
| Raycast probe from the capture eye at the two dark lines' depressions, 5.3° and 16°, eight azimuths (temporary, not committed) | first hits at 19–20 m: host facade instances 50, 51 and 85 (building index 0), colour `#283a66`, spanning −0.21…−0.07 m and −4.06…−3.92 m from the office floor; other azimuths hit neighbours' roofs and facades or the ground |
| `office-skyline.test.js` with the host-skin regressions (written first, red) | 11/11: from inside, the host's floor lines and facade below the floor go while a neighbour's band stays; with the eye outside only parts above the floor go; a stepped host keeps its wing parapet and street frontage |
| `node --test preview/tests/office-*.test.js` | 82/82 (combined scratch with #405 `bef644ee` and `origin/main` `a079271a`: 86/86) |
| GPU recapture, all host facade hidden (10:04Z branch, 10:05Z combined) | both navy lines gone in every view, but the wing parapet below the terrace was gone too, so the terrace looked out over flat ground |
| GPU recapture, tower skin rule (11:14Z branch and combined) | navy lines gone in the front, east, mezzanine and terrace views; the wing parapet is back below the terrace; no page errors; street restored after leaving |

## Combined view with #405's glass (review item 5)

A detached scratch worktree from `origin/main` `b5d99a13` merged `origin/feat/office-penthouse-glazing-20261015` at
`bef644ee` (#405 had moved on from `75aaea13`) and this branch at `175b6e0c`. Nothing was pushed; the scratch was removed
with `git worktree remove`. It was recreated at 10:04Z and again at 11:14Z (from `origin/main` `a079271a`) for the ring
fix, and removed the same way. Current screenshots, in the session scratchpad `rings2/`: `combined-front-glass.png`,
`combined-east-glass.png`, `combined-mezzanine-to-front.png`, `combined-terrace-to-office.png`,
`combined-terrace-west.png`, `branch-terrace-south-street.png`, `branch-terrace-west.png`. The earlier set (with the navy
lines) is in `combined/`.

What it looks like, honestly:
- **It now reads as an enclosed glass penthouse.** Full-height clear glass with bronze mullions runs along the front and
  east walls. The actual neighbouring residences, rooftops and parking deck stand behind it at the right scale and under
  the same sky. The closed bronze lift doors sit in the solid centre panel of the front wall.
- **From the mezzanine**, over the glass guard and bronze rail, the front and east glass corner frames the district below.
- **From the terrace looking back**, the terrace openings, with glazed transoms above, show the double-height room, stair
  and mezzanine, with the front curtain wall and the residences on the right.
- **Still a graybox inside.** Plain finishes, cylinders for chairs, no desks. The office's point lights leave small bright
  glints on the glass.
- **West is the weakest view.** Below the terrace the Le Colonial wing's roof and parapet, then the mapped district ends in
  flat ground to the horizon. There is no distant skyline because the mapped area has none.
- **No dark lines.** The two thin navy rings below the horizon in the first set were the host tower's own floor-line
  bands seen from inside it; they are gone since the tower skin rule.
- **Parallax.** From the mezzanine (5.5 m above the capture eye) nearby roofs sit slightly off where the eye would expect
  them; at a glance it is not noticeable.

## Limits

- A cube backdrop has no parallax: it is exact only at the capture point (x −4, d 10, standing height on the main floor).
  From the terrace (15 m away) or the mezzanine (5.5 m higher), nearby roofs shift a little; distant ones do not.
- The picture is from the unraised 28 m building. The penthouse's own ceiling is 31.9 m; the raise to 33 m is held for
  activation. West of the tower the mapped district ends soon, so that side shows mostly flat ground.
- The capture freezes the district, its people, cars and sky at the moment the doors close. A time-of-day change while
  inside replaces the backdrop with the plain sky (the street owns it); it is not re-captured. No night exists to test.
- 72 MiB at 1024 is a lot for phones. The size drops to 512 when the render scale is reduced, but there is no device
  measurement. All timings are CPU submission on one shared Mac, not GPU time or device evidence.
- CPU software acceptance (hosted CI's profile) never captures, so the CI journeys do not exercise the capture; the unit
  tests and the local GPU runs do.

## Next

Independent review; phone measurement (memory and the first-capture frame) before activation; spreading the six faces over
the closing frames if a device shows a visible hitch; a lower-memory format if phones need it; re-check after the building
raise.
