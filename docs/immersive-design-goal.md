# Immersive district design goal

Objective: comprehensively review and implement a sleek, futuristic, immersive and photorealistic end-to-end experience. Keep the River Oaks-only scope and TypeSafe visual identity. Prior UI delivery was progress, not proof of this broader goal.

## Acceptance evidence

- [ ] Immersive composition: full-window scene, floating controls, unobstructed primary view, desktop/mobile layouts and keyboard access.
- [ ] Futuristic TypeSafe direction: cohesive pink, graphite, glass and silver; refined architectural light details rather than oversized opaque ornaments.
- [ ] Physically credible rendering: textured ground, HDR sky/light, restrained highlight bloom, plausible glass/metals, detailed storefront interiors and shadows. Inspect multiple storefronts and street views, daylight and evening.
- [ ] Complete interaction flows: search/tour, walking, flight, conversations, community support, economy scenarios, weather, themes, reload and recovery.
- [ ] Performance and stability: observed frame timing, bounded reload resources, no page/WebGL errors, native and mobile viewports.
- [ ] Verification: unit tests, production build, E2E interactions and current screenshots. Visual quality must be reviewed separately from passing tests; photorealism is not established by functional checks.

## Pass 1

Current evidence: repeated plinth/bust shop displays, flat background, untextured lane, tall opaque sidebar and oversized faceted ornament prevent the requested visual quality. Implement HDR sky, a restrained HDR postprocessing pipeline, category-specific display geometry, physical glass ornament, and floating interface chrome. Review rendered output before further decisions.

## Pass 1 evidence

Implemented a full-window scene with floating TypeSafe controls, physical glass lanterns, category-specific original retail props, textured asphalt, a 2K CC0 HDR sky, and a restrained HDR bloom/output pipeline. Storefront signs were checked after reducing highlight spill. First-time visitors start with controls collapsed; stored preferences are respected.

The expanded visual test caught +6 textures per reload. Three.js allocates transmission targets per camera ID; six newly created probe cameras caused the growth. Reflection captures now exclude transmissive props. A regression test failed before the fix and passes after it. Repeated browser reloads now hold at 113 geometries / 218 textures with no page/console/WebGL errors.

Measured Chrome animation-frame timing on this Mac: 1440×1000 median 16.7 ms / p95 17.4 ms; UHD 3840×2160 median 32.6 ms / p95 34.1 ms. These are local samples, not general device performance claims. All 33 UI E2E assertions passed after the floating interface change.

Remaining: detailed storefront/interior realism, varied architecture and landscape composition, lighting continuity across time/weather, UHD performance, full journey acceptance, and final visual review across multiple locations. The overall goal remains active; current procedural displays and repeated facades do not prove photorealism.

## Pass 2 evidence

Added original generated fashion, jewelry, dining and perfume back-wall imagery in `preview/public/assets/interiors/`, retaining 3D glazing, alcoves and foreground objects. Current screenshots inspected: Dior, Cartier, Jo Malone London and Toulouse. The interiors now carry distinct category detail. Repetition between neighboring bays, sparse/disconnected canopy patches, and the uniform facade structure remain visible quality gaps.

Full district E2E passed: native UHD, walking movement, 30 destinations, nearby conversations, immediate-arrival interaction, completed six-neighbor support mission, mobile layout and single route-worker lifecycle. With final interior assets, the rendering/reload E2E passes at stable 113 geometries / 219 textures, no page/console errors and no pending WebGL error. A separate fresh-load warning check found zero warnings after fixing deferred atlas texture attachment. Latest UHD timing sample median 16.8 ms / p95 33.8 ms; variation between runs means sustained 60 fps is not established. Unit suite: 100 passing; production build and diff whitespace check pass. Existing Three.js chunk-size warning remains.

The overall goal is still active. The current scene is more immersive and materially richer, but the remaining composition and realism gaps above prevent a complete photorealism claim.

## Pass 3 scope

Previous goal turn classified as progress: delivered and verified rendering/interior changes. Current authoritative sources still show sparse scan-derived leaf islands, identical fantasy arches, and stepwise lighting. This pass adds interpreted crown foliage around existing branch tips, category-specific architectural treatments, and continuous time/weather lighting. Source voxel data and navigation footprints stay intact; augmented foliage is not survey evidence.
