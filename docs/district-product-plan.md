# District product update — September 20, 2026

Requested: combine real River Oaks District with fantasy art direction, remove the larger mapped scene, and reduce unrelated code.

- [x] Make the preview load only the bundled district; remove residential rendering, parcel overlays, and historical canopy overlays.
- [x] Add a coherent imaginative layer over real storefronts: TypeSafe pink glass, silver arches, floating lanterns, and soft evening light.
- [x] Simplify visitor copy and update documentation and browser checks for the single destination.
- [x] Verify navigation, storefront visits, reload, mobile layout, tests, and build; open dev.

Palette and typography follow TypeSafe's local `typesafe-playground/app/dashboard.css`: accent #ad267e, soft pink #f7e8f1, night pink #e2a1c9, graphite #26252c, neutral white #f5f5f7. Existing system typography and rounded controls remain. Signature: luminous pink glass lanterns inside silver arches, with floating lanterns marking the internal promenades. Mapped footprints, shop names, and walking collision remain the spatial anchors. Fantasy details are intentionally decorative.

Cleanup scope: retire the neighborhood-only browser paths and unused renderer modules. Retain source acquisition and the shared local services used by district characters, conversations, and scenarios.

Verification: 99 JavaScript tests passed, production build passed, and all 30 adjusted store arrivals are outside mapped collision polygons. Live browser checks confirmed walking, Cartier arrival, overview, two district reloads, one route worker, stable geometry/texture counts (106/200), mobile layout without horizontal overflow, and no page errors or pending WebGL error. The existing Three.js bundle-size warning remains.
