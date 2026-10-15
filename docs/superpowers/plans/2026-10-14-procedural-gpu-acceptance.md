# Procedural interiors: physical GPU acceptance plan

Objective: the procedural interior stack (#349–#358, #382) is merged, but every frame
measurement so far comes from one machine: Apple M3 Max, Chromium on ANGLE Metal, at
1440 × 900. Hosted CI runs on software rendering and does not run the `generated-gallery*`,
`world-studio-generated-levels` or perf journeys at all. This plan names what still has to
be measured on physical GPUs before any of these items counts as accepted, or ships as
a default beyond the pilot gallery.

Owner of the plan: task `procedural-landing-follow-through`. Owner of the runs:
`procedural-gpu-acceptance`; each run needs the physical device. The M3 Max is the
local baseline. The physical iPhone has a failed default-decoder startup check
and a later confirmed playable visit using the avatar-only diagnostic decoder
control. No bounded GPU timing receipt exists for that visit.

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

Phones cannot run the Playwright journeys. On a trusted private Wi-Fi or Tailscale
network, find this Mac's private IPv4 address (for example, `ipconfig getifaddr en0`)
and start the dedicated test-only fixture from the checkout:

```sh
RIVER_OAKS_PHONE_FIXTURE_HOST=<private-ipv4> \
  RIVER_OAKS_TEST_WEB_PORT=5180 RIVER_OAKS_DEV_TOWN_PORT=8788 \
  node server/tests/browser-fixture.js
```

The fixture binds Vite to that one private address, keeps the authoritative town
on loopback, and issues a synthetic guest cookie through `/auth/session`. It does
not use WorkOS, and the normal HTTP/WebSocket origin and CSRF gates still apply.
Stop the fixture after review. On the phone, open
`http://<private-ipv4>:5180/?render-audit=1&motion-debug=1`; verify the shared
world joins before timing anything. In Safari Web Inspector, read
`window.__riverRenderAudit.graphics()` to record the WebGL renderer, viewport,
quality, pipeline, calls, triangles, geometries and textures. Use
`window.__riverRenderAudit.start()` immediately before each timed walk or portal
transition and `window.__riverRenderAudit.stop()` immediately after it; keep the
returned frames and overflow flag in the receipt. An overflowed sample is invalid.

If Safari terminates WebContent during loading, `?phone-decoder=html` on this
private fixture selects the HTML image decoder control from iOS probe #309.
Compare it with the ordinary URL and `?ao=off`, recording each visible outcome.
The decoder control is diagnostic only; a visit using it cannot pass the phone
GPU row or justify a production decoder change.

Physical iPhone Safari startup check, 2026-10-15: the normal fixture crashed
before joining, and `?ao=off` showed the same “a problem repeatedly occurred”
page. `?phone-decoder=html` joined the town with ordinary AO still enabled.
This points to the decoder path rather than AO as the startup trigger; the
phone GPU row remains unmeasured and open. See the
[phone fixture ledger](2026-10-15-procedural-phone-gpu-fixture.md).

Walk the same route by hand: enter the gallery, walk to the back wall, go up,
come down, leave, visit Cartier, and return. Record cold and return preparation
times separately, plus the ascent and descent frame intervals and a capture at the
glazed frontage. Repeat Auto with `&aotail=on`, and the AO-off control with
`&ao=off` as separate visits. The `graphics().quality.tailShedding` value must
match the chosen tail mode. Safari's remote Web Inspector is on the paired Mac;
Android uses Chrome `chrome://inspect`. Manual phone timings are distinct from
the Playwright desktop receipts above.

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

A local full gate on the merged procedural source revision `4559778b4f3e48c4d73d25e73668c93accd1ba35` passed on 2026-10-15 with isolated Redis, dependency audit, secret history, browser experience and shared creator four-level journeys. The preview suite had one skip and one IPIC circulation TODO; neither is physical GPU or human accessibility proof. Receipt: ignored `.runtime/procedural-gpu-acceptance/full-gate-20261015.json` in this worktree (copied from the decoder investigation worktree). The generated-gallery performance journeys and device matrix remain separate.

| Date | Device / GPU | Browser | Item | Result | Receipt |
| --- | --- | --- | --- | --- | --- |
| 2026-10-14 CDT | iPhone 16 Pro Max / renderer unavailable | Safari | Phone prerequisite | Failed startup: Safari showed “a problem repeatedly occurred” before the guest joined; no GPU timing captured. | [Phone fixture ledger](2026-10-15-procedural-phone-gpu-fixture.md) |
| 2026-10-15 06:49–06:51 UTC | iPhone 16 Pro Max / renderer unavailable | Safari on physical iOS 27.0.1 | Diagnostic decoder control on merged `main` `9d83cd31` | `devicectl` launched Safari at the private fixture's `?phone-decoder=html&render-audit=1&motion-debug=1` on port 5183. After 20 s, the authoritative fixture reported one connected player; a repeat health check still reported one, and the page returned HTTP 200. Val subsequently reported that the avatar-only decoder visit still showed a loading message, showing that a server join cannot be counted as a visual render. Mac Safari listed the paired iPhone but said “Enable Web Inspector on device,” so no renderer, frames, or GPU timing was captured. The fixture was stopped. Mac Safari's Developer menu was subsequently restored to off and confirmed in Safari Settings. This does not pass the phone row. | `.runtime/procedural-gpu-acceptance/iphone-html-control-20261015.json` in the acceptance worktree; [phone fixture ledger](2026-10-15-procedural-phone-gpu-fixture.md) |
| 2026-10-15 07:15–07:23 UTC | iPhone 16 Pro Max / Apple GPU | Safari on physical iOS 27.0.1 | Experimental avatar-only decoder branch | The private fixture's opt-in report showed a scoped HTML-image avatar visit with one joined guest, 964 render calls, assets 88/102 with zero errors, and the in-app loading overlay hidden at 25 s. Val answered ‘Town visible’ but could not identify whether that was this URL or the later normal URL, so no visit has confirmed visual and telemetry evidence together. A normal-decoder visit showed “Preview unavailable,” assets 75/102, and zero joined players; a repeat never reached its 25 s report. This is startup diagnostic evidence, not a bounded frame-time or visual acceptance run. | Diagnostic fixture PR #401 merged at `67388f8d`; ledger `docs/superpowers/plans/2026-10-15-safari-gltf-decoder-investigation.md` is on main. Raw repeat normal reports remain in ignored `.runtime/safari-gltf-decoder-investigation/normal-control-20261015.json` in that worktree |
| 2026-10-15 08:15–08:19 UTC | iPhone 16 Pro Max / Apple GPU | Safari on physical iOS 27.0.1 | Exact-URL avatar-only decoder control, after PR #401 merged | `devicectl` launched `http://10.0.0.152:5184/?phone-avatar-decoder=html&phone-report=1&render-audit=1&motion-debug=1`. Val stayed on that tab and confirmed “Town visible and playable” after 30 s. Its paired 25.52 s report showed viewport 440 × 796, 955 render calls, 98 textures, assets 88/102 with zero failures, and both the scene overlay and connection gate hidden. The town reported one player. This confirms visible play and matching telemetry on one scoped diagnostic visit. It is not a frame-time sample, stable default-decoder result, or phone GPU acceptance. | [Decoder investigation ledger](2026-10-15-safari-gltf-decoder-investigation.md); ignored `.runtime/procedural-gpu-acceptance/iphone-avatar-control-confirmed-20261015.json` in this worktree |
| 2026-10-15 08:49 UTC | iPhone 16 Pro Max / Apple GPU | Safari on physical iOS 27.0.1 | Five-second stationary diagnostic sample, merged PR #409 control | Exact URL added `phone-frame-report=1` to the avatar-only control. Scene and connection overlays were hidden at 25.52 s, with 88/102 assets, zero failures, 964 render calls, 98 textures and one joined player. The bounded 5 s audit returned 55 frames, no overflow, 61 ms median interval, 265 ms p95, 542 ms max, CPU p95 33 ms, and four intervals over 250 ms. The Mac fixture host had load average about 158 and the guest later disconnected; Val's visible-state confirmation for this visit is pending. These intervals show poor pacing in this diagnostic condition, not an accepted baseline or portal sample. | Ignored `.runtime/procedural-gpu-acceptance/iphone-scoped-frame-sample-20261015.json` in this worktree |
| 2026-10-15 08:53 UTC | iPhone 16 Pro Max / Apple GPU | Safari on physical iOS 27.0.1 | Default-decoder startup comparison | Normal URL sent only an early 10.50 s report: 7/66 assets, both overlays visible, 28 calls and 25 textures. Safari also reloaded an older avatar-control tab. Neither tab sent a 25 s report or frame sample; the town had zero players after 60 s. Host load reached about 343. This is an inconclusive two-tab startup failure, not an isolated default-decoder comparison or GPU run. | Ignored `.runtime/safari-gltf-decoder-investigation/default-control-20261015.json` in the decoder worktree |
| 2026-10-15 10:14–10:15 UTC | iPhone 16 Pro Max / Apple GPU | Safari on physical iOS 27.0.1 | Scoped avatar decoder plus merged PR #411 error receipt | Val confirmed “Town visible and playable” on the same exact URL. At 25.26 s, the fixture reported 440 × 796, 964 calls, 110 textures, assets 92/102 with zero failures and both overlays hidden; the town had one guest. The diagnostic summaries arrived at 11, 22 and 25 s with zero app and console errors. Mac host load was about 6–24. This proves the scoped reporter and playable diagnostic route, not default-decoder recovery or portal frame pacing. | Ignored `.runtime/procedural-gpu-acceptance/iphone-scoped-error-sample-20261015.json` in this worktree; [decoder investigation ledger](2026-10-15-safari-gltf-decoder-investigation.md) |
| 2026-10-15 11:33–11:36 UTC | iPhone 16 Pro Max / renderer unavailable | Safari on physical iOS 27.0.1 | Fresh-port normal decoder navigation attempt | The port 5185 private fixture returned HTTP 200 and the loopback town health endpoint was ready. `devicectl` reported a successful launch of the normal URL with readiness and error reporters, but the fixture received zero reports and had zero joined guests over two minutes. No phone connection was observed in sampled socket state. Val's visible-screen report is pending. This establishes no decoder or GPU result; the fixture was stopped. | Ignored `.runtime/safari-gltf-decoder-investigation/normal-fresh-port-launch-20261015.json` in the decoder worktree; [decoder investigation ledger](2026-10-15-safari-gltf-decoder-investigation.md) |
| — | — | — | — | Not run yet | — |

**Next action:** Resolve the iPhone navigation gap on a fresh private fixture
port, then run one normal-decoder visit with bounded readiness and error
receipts. Compare it with the confirmed playable scoped HTML decoder control,
then capture portal timing and the remaining physical GPU classes. Keep the
default decoder row open until Safari joins without the fixture-only override;
iOS probe #309 owns that recovery.
