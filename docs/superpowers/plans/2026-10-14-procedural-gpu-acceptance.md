# Procedural interiors: physical GPU acceptance plan

Objective: the procedural interior stack (#349–#358, #382) is merged, but every frame
measurement so far comes from one machine: Apple M3 Max, Chromium on ANGLE Metal, at
1440 × 900. Hosted CI runs on software rendering and does not run the `generated-gallery*`,
`world-studio-generated-levels` or perf journeys at all. This plan names what still has to
be measured on physical GPUs before any of these items counts as accepted, or ships as
a default beyond the pilot gallery.

Owner of the plan: task `procedural-landing-follow-through`. Owner of the runs: Val or
whoever Val names; each run needs the physical device. Nothing here has run yet.

## Items under test

| # | PR | What must hold | Local evidence so far (M3 Max / Metal) |
| --- | --- | --- | --- |
| A | #351 | Exterior culling (`canCullExterior`, `renderWithoutExterior`) removes the district only when the opaque interior fills the view. Glazed frontage must still show the street, trees and neighbours. | Inward gallery 812 calls at 16.8 ms p95; frontage view keeps the exterior (`gallery-render-frontage.png`); five-minute stationary soak 16.7–16.8 ms p95. |
| B | #354 | Auto's tail rule: two 45-frame windows with ≥12% of intervals ≥26 ms, while the median is ≤18 ms, drop AO at native scale. Recovery takes 120 calm windows plus 12. | After main was merged in, Auto with AO already off still showed 33.3 ms moving p95 on all five visits, so the AO benefit was not isolated. Since the follow-up PR, the rule is opt-in (`?aotail=on`) and is not on by default. |
| C | #358, #382 | Gallery AO with the exterior masked out, and the fixed contact layer Auto uses inside approved generated rooms. Appearance must hold, and moving frames must not regress. | Val approved the Auto contact-shading appearance in two captures (cycle 1 and 5). Auto moving p95 was 16.8/33.3/33.3/16.8/16.8 ms; the AO-off control was 16.8 ms on every visit. |
| D | #349 | Lift and stair portal pacing between levels: preparation time, frame pacing during ascent and descent, and reduced-motion reconnect, on a phone-class GPU. | Cold/return preparation 384–456 / 171–215 ms; upper floor 16.7/16.8 ms p95 at 933 calls. No mobile run. |

## Device matrix

At least one run per row. A row without a run stays open; it is not passed by inference
from a faster device.

| Class | Example | Browser / backend | Why |
| --- | --- | --- | --- |
| Apple silicon laptop (baseline) | M-series MacBook Air or Pro | Chrome, ANGLE Metal | Repeats the local numbers on a second, quieter machine |
| Integrated x86 laptop | Intel Iris Xe or AMD Radeon 680M | Chrome on Windows, ANGLE D3D11 | The most common desktop GPU class; Windows desktop builds (#369) target it |
| Discrete desktop | Any NVIDIA or AMD dGPU | Chrome on Windows | Checks the culling and AO choices do not regress fast GPUs |
| Phone | Recent iPhone | Safari (WebKit, Metal) | #349 portal pacing on mobile; WebKit is a different compositor (see the iOS probe, #309) |
| Phone | Mid-range Android | Chrome, ANGLE GLES/Vulkan | A tile-based mobile GPU |

Record the GPU string from `chrome://gpu` or the WebGL renderer in each receipt.

## How to run

From a checkout of current `main`, on a quiet machine (no other browser journeys, builds,
or agents; the local browser lock in `scripts/browser-lock.mjs` only orders runs on one
machine):

```sh
pnpm install --frozen-lockfile
# A, D: render cost, culling and upper-floor views, Sharpest, AO on
pnpm run test:experience generated-gallery-render-cost
# A, C: five entries, moving frames, eviction and return
RIVER_OAKS_GALLERY_CYCLES=5 RIVER_OAKS_GALLERY_CANVAS_CAPTURE=1 pnpm run test:experience generated-gallery-cycle-soak
RIVER_OAKS_GALLERY_CYCLES=5 RIVER_OAKS_GALLERY_AO=off pnpm run test:experience generated-gallery-cycle-soak
RIVER_OAKS_GALLERY_CYCLES=1 RIVER_OAKS_GALLERY_QUALITY=sharp RIVER_OAKS_GALLERY_CANVAS_CAPTURE=1 pnpm run test:experience generated-gallery-cycle-soak
# A: stationary soak, five minutes
RIVER_OAKS_GALLERY_SOAK_MINUTES=5 pnpm run test:experience generated-gallery-soak
# D: levels, reconnect with reduced motion, two clients
pnpm run test:experience generated-gallery-levels
RIVER_OAKS_SHARED_JOURNEY=creator-four-levels pnpm run test:shared development-publish
```

For B, compare Auto with the shipped tail rule off and the opt-in rule on. Repeat
each command at least three times on the same device. The receipt includes
`aoTailMode`; keep the runs separate so run-to-run spread can be compared.

```sh
RIVER_OAKS_GALLERY_CYCLES=5 RIVER_OAKS_GALLERY_AO_TAIL=off pnpm run test:experience generated-gallery-cycle-soak
RIVER_OAKS_GALLERY_CYCLES=5 RIVER_OAKS_GALLERY_AO_TAIL=on pnpm run test:experience generated-gallery-cycle-soak
```

Phones cannot run the Playwright journeys. The current Vite/browser fixture binds
to `127.0.0.1`, and the local identity accepts only a loopback origin. A plain
LAN URL is therefore not yet a working authenticated phone fixture; prepare a
dedicated test-only phone access path without relaxing production origin or
CSRF checks before recording a phone result. Once available, open it with
`?render-audit=1&motion-debug=1`, then walk the same route by hand: enter the
gallery, walk to the back wall, go up, come down, leave, visit Cartier, and return. Read
`window.__riverRenderAudit` from a remote inspector (Safari Web Inspector, or Chrome
`chrome://inspect`).

Keep the JSON receipts under `.runtime/` and the captures under `output/playwright/`. Copy
both into `~/worktree-backups/river-oaks/gpu-acceptance-<date>/` before the checkout is
retired. Restore any tracked `data/reports/*.json` the runners rewrite; they are not
evidence of this run.

## Pass criteria

- **A, culling:** the frontage capture still shows the street through the glass, and no
  interior capture shows a missing district through an opening. Moving p95 does not
  exceed the street's own p95 on the same device. Calls and triangles drop inside, as on
  the M3 Max.
- **B, tail rule:** turn it on by default only if, on the integrated x86 laptop and on
  one phone, `aotail=on` lowers moving p95, or the count of intervals above 25 ms, by a
  margin larger than run-to-run spread over at least three five-cycle runs. The district
  must not lose AO after a gallery visit (`pipeline.ao` equal to `quality.occlusion`
  outside; that journey check already exists). Otherwise keep it opt-in, or remove it.
- **C, contact shading:** Val's appearance approval covers the M3 Max captures only.
  Each other class needs a capture pair (Auto at cycle 1 and cycle 5, plus Sharpest) that
  Val reviews. Moving p95 under Auto must not exceed the AO-off control by more than one
  refresh interval on the same device.
- **D, portals:** cold preparation under 1 s and return under 0.5 s on the phone. Ascent
  and descent show no stall over 250 ms in the render audit. The reduced-motion reconnect
  lands the player on the upper floor and not outdoors, which the 30 s local reconnect
  grace exists for (regression test in `server/tests/shared-transport.test.js`).

Record every device and run, including failures and skipped rows, in this ledger's
results table. A green local or hosted gate is not a substitute for these runs.

## Results

| Date | Device / GPU | Browser | Item | Result | Receipt |
| --- | --- | --- | --- | --- | --- |
| — | — | — | — | Not run yet | — |
