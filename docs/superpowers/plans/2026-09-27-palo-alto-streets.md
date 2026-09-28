# Palo Alto street treatment in the Houston district

Authorized scope: retain Houston centerlines, destinations and buildings; apply Palo Alto street standards to the game geometry. Preserve the uncommitted desktop work and leave the dev app live.

- [x] Shared metric profile from Palo Alto drawings 101/105/133/201 and Municipal Code 18.24.020.
- [x] Crowned asphalt, Type A gutters/curbs, graded sidewalks, aligned ramps and detectable-warning surfaces; consistent rendered support triangles.
- [x] Pedestrian clear space and fixture placement use the same dimensions; protect crossings from curb/furniture obstructions.
- [x] Geometry/navigation tests, full game/server regression suites, desktop gameplay and visual checks, rebuilt local app.

Scope boundary: preserve mapped curb-to-curb widths. Drawing 201's full public right-of-way widths cannot be applied without relocating buildings. Report constrained sections and terrain/siting limitations explicitly; do not claim the fictional district is an approved civil design.

Verification: 512 game tests passed, followed by two additional passing street
geometry tests; 67 server tests passed with 27 optional Redis cases skipped;
3 desktop unit tests passed. macOS arm64 package and shared-town development
Electron E2E runs passed, including crash recovery and real CSS hot reload.
Both loaded 114 assets with no failures. Packaged sample: 37.3 fps over 10 seconds.
Native visual inspection confirmed the new surfaces. The street report records
745 clipped panels and 136 candidate crossing endpoints, not an accessibility
certification. Details and sources: [street standards](../../street-standards.md).
