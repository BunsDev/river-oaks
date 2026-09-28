# Play controls and rendering cost

The play dock keeps flight and Jev within reach while rides, camera settings, and optional scenarios stay in disclosures. Small windows start with the dock closed. You can close either the dock or exploration panel with Escape; focus returns to its trigger. H hides the floating controls and leaves a visible way to restore them. Compact conversations clear the competing controls until you close the conversation.

Run the browser acceptance suite with:

```sh
npm run test:experience
# Run one flow while iterating:
npm run test:experience -- experience
```

The runner starts its own standalone Vite server and runs each flow in a fresh Chromium context. It writes results to `data/reports/experience.json` and screenshots to `output/playwright/`. It covers desktop, phone, and short landscape layouts; focus and Escape behavior; reduced motion; guided visits; vehicles; companion conversations; touch movement; telekinesis; and the invasion scenario. Provider decision checks use mocked replies. Optional services can be unavailable during the suite.

Manual driving takes over immediately on a movement key or pad press, including taps that end between animation frames. When Jev follows locally, he can choose a clear position beside or in front of you if a storefront blocks his preferred trailing position. Building and personal-space clearance still apply.

Run native window and renderer recovery checks with:

```sh
VITE_SINGLE_PLAYER=true npm run test:desktop:e2e -- --dev
```

For native vehicle checks, start `VITE_SINGLE_PLAYER=true npm run desktop:dev`, then run `node desktop/vehicles-e2e.js` in a second terminal. If Vite selected a port other than 5174, set `RIVER_OAKS_DEV_URL` to that URL with `?motion-debug=1`. The test covers both vehicles, immediate keyboard and movement-pad takeover, companion flight, and landing.

## Rendering changes

Trees use their silhouette geometry for sun-shadow proxies while retaining three overlapping leaf shells. Visible tree detail and nearby characters are unchanged. Centimeter-scale fascia beads use fewer sphere segments; the larger decorative domes retain their existing geometry.

The [September 28 comparison](../data/reports/experience-render-cost.json) used Apple M3 Max, Chromium's Metal backend, a 1440 × 1000 viewport, and Sharpest graphics. Baseline and changed scenes ran in A/B/B/A order. Main-pass triangles fell from 13.65 million to 10.16–10.50 million; mean main-pass GPU time fell from 15.31 ms to 13.86 ms (about 9%). Median frame time remained 33.3 ms. Resident motion and system load affect these samples, so this establishes reduced rendering cost, not sustained 60 fps.

## Remaining acceptance limits

Automated focus and keyboard assertions do not replace human keyboard-only or VoiceOver acceptance. This pass also does not establish AAA visual fidelity, sustained 60 fps across scenes, or live Jev service reliability. Read the native performance report for its exact window size, graphics scale, GPU, and workload before comparing frame rates.
