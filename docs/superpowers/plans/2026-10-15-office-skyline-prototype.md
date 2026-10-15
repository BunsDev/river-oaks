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
3. **What is left out.** The office stage (cabin and office), the visitor's avatar and the peer root are hidden for the
   capture. The eye stands inside the mapped 28 m tower, so the host building's facade instances
   (`userData.buildingIndices`) and massing (`userData.districtBuilding`) that reach above the office floor are collapsed
   for the capture only and restored right after. Its podium below the floor, and every neighbour, stay.
4. **Shown as** `scene.background`, at intensity 1 (the faces already hold the sky at its own intensity), with blur and
   rotation cleared. Every face clears; the sun's shadow maps from the last street frame are reused rather than redrawn
   six times. No lights are added (the fixed light pool is untouched), no network or asset loads.
5. **Restored** on every exit path through the visit's `dispose` (leave, revoke, disconnect, world rebuild): background,
   intensity, blur and rotation return, unless the sky changed while inside (time of day or weather), which then belongs
   to the street. The render target is disposed. A capture requested after dispose does nothing; a failed capture
   restores everything it borrowed and shows no backdrop.
6. **Sizes.** 1024 per face at full render scale, 512 below 0.75, 64 under CPU software acceptance (which leaves visual
   quality to GPU runs), capped by `maxCubemapSize`. **Switch:** `?office-skyline=off` in development builds.

## Files owned

`preview/src/office-skyline.js` (new), `preview/tests/office-skyline.test.js` (new), `preview/src/office-world-scene.js`
(skyline hook: create, capture before going inside, dispose, `inspect().skyline`), `preview/src/office-world-presentation.js`
(`captureOfficeStreet` carries `renderer` and `skyline`), `preview/src/main.js` (passes the renderer, the size and the
switch), `docs/offices.md` (one bullet), this ledger, the register entry.

## Measurements

GPU memory per capture: colour 6 × size² × 8 bytes (RGBA half float) plus depth 6 × size² × 4 bytes:
**72 MiB at 1024**, 18 MiB at 512, 0.3 MiB at 64. It lives for the visit and is released on leaving.

Capture time (CPU submit plus `gl.finish`, reported as `inspect().skyline.ms`): see Checks.

## Checks

| Check | Result |
| --- | --- |
| `node --test preview/tests/office-skyline.test.js`, written first | red (module missing), then 8/8 |
| `node --test preview/tests/office-*.test.js` | 79/79 |
| `pnpm run verify` (core) | passed: agent 109/109, preview 3100/3101 (1 skipped), server 534/681 (147 Redis cases skip without `REDIS_URL`), desktop 69/69, Python 141, build, lint, secrets; receipt `.runtime/agent/core.json` |
| GPU browser views (Metal ANGLE), skyline on and off, and `node preview/e2e/office-penthouse-runner.mjs`, one browser-lock hold | pending: queued behind eight runs on the shared lock |

## Limits

- A cube backdrop has no parallax: it is exact only at the capture point. Walking 19 m to the terrace shifts nearby
  roofs a little; distant buildings do not move.
- The picture is from the unraised 28 m building. The penthouse's own ceiling is 31.9 m; the raise to 33 m is held for
  activation.
- The capture freezes the district, its people, cars and sky at the moment the doors close. A time-of-day change while
  inside replaces the backdrop with the plain sky (the street owns it); it is not re-captured.
- 72 MiB at 1024 is a lot for phones. The size drops to 512 when the render scale is reduced, but there is no device
  measurement yet.
- With the current opaque graybox walls, the district shows only through the terrace openings. The sibling glazing branch
  makes the front, east and terrace walls glass.

## Next

GPU screenshots and measured capture time from the queued browser run; the review; spreading the six faces over the
closing frames if the one-frame capture hitches; choosing a lower-memory format if phones need it.
