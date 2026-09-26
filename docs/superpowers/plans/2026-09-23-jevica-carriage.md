# Jevica carriage implementation plan

**Goal:** Give Jevica a three-dimensional pink-and-gold carriage matching the
supplied September 23 reference, preserving the district and human residents.

**Architecture:** A self-contained procedural Three.js model, with static detail
batched by material, four separate wheel groups, and a furnished cabin. A separate
parking module finds clear road space; the player controls expose Call carriage,
Ride carriage and Leave carriage. The later explicit riding request adds road
locomotion, rolling wheels, collision, seated posing and safe exits. A compiled
rendered-surface sampler supplies ground contact. The coach remains parked when
Jevica walks or flies; no horses are included.

**Tech stack:** Existing Three.js, Vite, Node tests, Playwright CLI.

- [x] Add `preview/src/jevica-carriage.js`: curved blush cabin, cream door,
  gold scrollwork and roses, four jeweled spoke wheels, roof crest, glass lanterns,
  coachman's seat, entry step and upholstered interior. Use local authored geometry.
- [x] Add `preview/tests/carriage.test.js`: verify finite geometry, four ground
  contacts, complete resource disposal, independent instances and geometry budget.
  Run `node --test preview/tests/carriage.test.js` before and after implementation.
- [x] Add `preview/src/carriage-parking.js` and tests: road-only footprint,
  pedestrian/crossing/building clearance, terrain fit, rotated collision volume,
  and no placement when space is unavailable.
- [x] Integrate the parked model and Call carriage into `player-avatar.js`;
  pass current world from `main.js`, include it in picking occluders, and register
  its collision volume with walking controls. Prevent indoor/airborne summoning.
- [x] Add a studio fixture and browser acceptance for actual district placement,
  summoning, camera framing, and preserved Jevica bubble flight. Inspect side,
  three-quarter and close-up renders against the supplied reference.
- [x] Run `npm test`, `npm run build`, the carriage browser check, and existing
  people-picking and pointer regressions. Record metrics, limitations and rendered
  artifact paths in `data/reports/jevica-carriage.json` and update character docs.

Related work in progress: pointer ownership fixes and touch picking acceptance.
Keep those changes, finish their verification, and leave the broader realism and
interaction goal active. Preserve all unrelated dirty work. Do not commit here.

- [x] Add riding controls, road movement, braking, wheel travel and safe exits.
- [x] Match rider soles to the footboard on flat and tilted carriages; fold the
  skirt over the lap and preserve third-person camera clearance after leaving.
- [x] Use rendered terrain/road/sidewalk/kerb triangles for outdoor grounding.
- [x] Apply the retrofuturistic garden palette to architecture, interiors,
  lamps, planters and interface while keeping mapped positions.
- [x] Complete trusted touch cancellation/capture/focus checks and actual
  seated/worker mesh taps on phone and tablet.
- [x] Verify mounted conversation and the final full encounter sweep.
