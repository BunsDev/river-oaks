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

## Pass 4 scope

Goal turn: review the interface and make the environment and storefronts ultra-realistic. Inspection of the Pass 3 output showed flat pale boxes above the shopfronts with teal window stickers, glazing that ran to the pavement without a bulkhead or frame, flat white sign plaques on every tenant, slab awnings, no kerbs, lamps, planters or tree pits, a district that floated over the sky probe's dark lower hemisphere in the aerial view, and a time-of-day control that moved shadows without dimming the sky.

## Pass 4 evidence

> **Historical record.** This pass describes the preview as of `d14fe40` (2026-09-20). The product has since become walk-only: the orbit camera and aerial overview mentioned below were removed, and the camera is street-level with a 6 km far plane (`preview/src/main.js`). The test count and browser-script list here are that pass's receipt. `store-interiors.js` and later harnesses are not in it. For current verification, see [testing](testing.md).

Rendering: a GTAO ambient-occlusion pass now sits between the scene render and bloom, at full resolution up to roughly 1440p and half resolution above, with alpha-tested leaf cards and thin storefront glazing hidden from its depth pass so canopies and displays do not read as opaque sheets. `?ao=off` and `?ao=only` are development query flags for comparing the pass. The atmosphere model (`preview/src/atmosphere.js`) couples sun elevation, sun colour, sky and environment intensity, exposure and haze, so 18:45 is visibly dusk. Squared-exponential haze now fades a 25 km context ground to the horizon; the orbit camera sees to 30 km and walking or flight narrow the range for depth precision.

Architecture (`preview/src/district.js`): every mapped mass carries a fascia with a shadow reveal, a string course per storey, a stepped cornice, and punched upper windows with projecting limestone surrounds, sills, dark reveals and divided reflective glazing, sized by `upperWindowLevels` so a two-storey mass carries one row under its cornice and taller masses stack rows. Shopfronts gain a honed stone bulkhead, bronze stiles, head and sill rails, recessed soffit and ceiling downlights, a threshold, entrance mat, meeting stile and paired handles, clipped boxwood planters, and a sloped canvas awning with valance and tie rods. Membrane roofs are lighter and carry rooftop plant and a stair bulkhead. Standard tenants read as pin-mounted lettering with a contact shadow; reference-guided fronts keep their backlit plaques. Ornament from the TypeSafe layer now sits below the first window row.

Streets (`preview/src/street-furniture.js`): granite kerbs follow every vehicular lane and stop short of the lanes that join it; lamp columns, planters and litter bins alternate sides at 22 m spacing and keep out of footprints, junctions and their own lane edge; mulched pits with grates sit under every mapped tree and scanned trunk. Ground and asphalt albedo carry three-octave macro variation so the tiled textures no longer repeat visibly.

Interface: the walking movement pad remembers whether the visitor hid it. The full-window composition, floating controls, dialogue flows and mobile layout were re-inspected at 1920×1080 and 390×844 and left as delivered in Pass 1.

Verification: 107 unit tests pass, including kerb/fixture placement against the mapped lanes, hedge determinism, window-row fit under every mapped parapet, and the dusk atmosphere. Production build passes with the existing chunk-size warning. Browser scripts `ui-improvements`, `storefront-lighting`, `district` and `visual-fidelity` all pass against the changed scene: 24 characters load, reflections refresh with weather, repeated reloads hold 120 geometries / 228 textures with no page, console or WebGL errors. Local Chrome frame samples were taken while three other Claude sessions and their browsers were running on this Mac: 1920×1080 median 33 ms with AO and 25 ms without; native UHD median 50 ms with AO and 41 ms without. The unmodified checkout measured under the same load gave 33 ms at 1920×1080 and 50–58 ms at UHD, so no regression is attributable to this pass, but neither figure is a quiet-machine or target-GPU claim. Screenshots for Dior, Cartier, Toulouse, Hermès, Van Cleef & Arpels, a street walk, the aerial overview, dusk and a 390×844 mobile view are in `output/playwright/final-*.png`.

Remaining: photographic frontage references for the 30 tenants are still absent, so every facade remains an interpretation; hedge lobes and tree crowns are still procedural; surrounding blocks beyond the mapped site are open ground rather than the real neighbourhood; the fantasy layer is retained by design. Photorealism is closer but is not established by these functional checks.

