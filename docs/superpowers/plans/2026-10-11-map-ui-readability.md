# District map readability

Objective: improve the supplied map screenshot with quieter building footprints, clear street/path hierarchy, sparse real street names, distinct location/destination markers, readable selection callouts and a semantic legend. Preserve coordinates, live updates, selection, keyboard controls and authoritative travel.

Design: retain the district atlas identity. Deep teal ground #162d32, slate buildings #29454a, outlined edges #466064, streets #688786, mint location #b5eee6, brass destinations #edc88a. Existing sans UI typography; small road labels and fixed-size selection callout. No new motion.

Files owned: world-map.js/css, places-guide.css, world-map.test.js, destination-minimap.js; task register and this ledger.

Branch: feat/map-ui-readability. Owner: codex:map-ui-readability-20261011. Separate sibling checkout; other dirty work preserved. Shortcut PR #229 remains in coordinated merge queue behind dependency PR #213.

Checks/results:
- `node --test preview/tests/world-map.test.js`: 5 passed. Test-first street-label regression failed before implementation.
- `pnpm run test:experience destination-minimap`: passed on final patch; light/dark at 320, 390, 844, 1024, 1440 widths, focus restoration and search retained. New bottom-edge containment check failed before correction and passed after.
- `pnpm run test:shared development-world`: world-boundary and world-map passed, including live players, sharing, refused blocked travel and authoritative meet/travel.
- `pnpm run verify`: final core passed all 11 tasks. Preview 2589 passed / 1 skipped; server 298 passed / 106 skipped; desktop 36 passed; Python 141 passed. No Redis/full suite/native/live-auth/human-accessibility acceptance claimed.
- Independent review: one narrow-map badge clipping issue fixed by placing lower-half labels above. Follow-up found no remaining issues and independently checked all four badge bounds over 90 size/position combinations.
- Screenshots reviewed for desktop dark and 320px light; street and selection labels remain readable. Browser receipts retained at .runtime/map-ui-browser.json and .runtime/map-ui-shared.json; historical shared report restored. Core receipt .runtime/agent/core.json.
- `git diff --check` passed.

Next: integrate into the authorized shortcut/map delivery PR #229, refresh after dependency PR #213, and complete final hosted CI and merge. Do not retire this source checkout until delivery evidence is recorded.
