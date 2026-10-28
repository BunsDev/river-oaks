# Landowner hover coach and the office phase tube

Register task `landowner-hovercraft-20261028`, branch `feat/landowner-hovercraft-20261028`, worktree `river-oaks-landowner-hovercraft`, base `bfe84886`.

## Objective

1. Give the town's landowners (the Jevica owner accounts, which hold the private homes) a special garage vehicle modelled on Val's 2026-10-28 reference: a pale seafoam, chrome-trimmed teardrop hover helicopter with a wrap-around canopy under a tinted roof band, an open side door with a fold-out stair onto a cream lounge, four portholes a side, a top rotor, a ducted tail fan and torpedo lift pods tucked under the belly on their own light. It must ride, park, steer, exit and synchronise exactly like the existing exclusive vehicles, with server authority unchanged.
2. Replace the office arrival's bronze elevator car with a phase tube after Val's second 2026-10-28 reference: a chrome-ribbed glass drum on a tangerine plinth with a round call pad, a warm light ring that sweeps the visitor's body, and the visitor phasing out and back in between the ground floor and level 6. The arrival timeline, camera path, portals and the 24.3 m rise stay as they are.

## Design

- One new `VehicleKind`, `hover`, in `preview/src/vehicle-config.js`: 4.13 m by 1.47 m in plan (the reference's shell scaled 30% smaller, Val 2026-10-28), 2.55 m to the fin, 9 m/s cap, `hover:true`, `flies:true`, `steeredWheels:0`, pilot seat ahead of the door, passenger armchair opposite it, `steeringPivot` for a yoke that turns like the car's wheel (the field name matches open #691). The shell groups carry the plan scale; seats, stair, portholes and controls live in an unscaled cabin group so the riders fit.
- Flight (Val, 2026-10-28): `stepHoverLift` in `carriage-motion.js` moves an altitude target with the flight keys (Space up, C down) at 4 m/s and follows it at up to 3 m/s, never above `flightCeiling` and never into a sky `hoverClear` finds blocked (the hull's plan sampled at two heights through `canFly`). Airborne, `fitCarriageToGround` keeps `position[1]` as the ground beneath and levels the hull; `parked-carriage.js` adds the altitude to the model, reports it in the ride pose (`walking-ui.js` publishes it instead of the walker's flight altitude), keeps the chauffeur grounded, lets the coach block no walker while aloft, and lands it before anyone steps out (G starts the landing; the garage status says so). Server: `pose()` accepts altitude with a vehicle only when `VEHICLES[kind].flies`, in any owner appearance (the coach flies, not the rider), still never from an upper interior level and never above the ceiling; checkpoint validation and restore keep an airborne coach.
- The hull in `preview/src/road-vehicles.js` is two half-ellipsoids of sphere patches (a 2.05 m blunt nose, a 2.8 m tapering tail) meeting at the widest section, cut at the seam azimuths, so the left doorway is a real opening. Four unseen `Road tyre rubber` contact tyres under the pods keep `fitCarriageToGround`, `carriageTyreClearances`, the parking envelope and the desktop tyre-gap probe untouched; no paint comes within 25 cm of the ground. The rotor idles when parked, spins up with speed and stops under reduced motion; the lift light pulses and casts no shadow.
- Server: no new rule. `pose()` already refuses every non-bicycle vehicle from non-owners (`exclusive_vehicle`) and budgets movement by `VEHICLES[kind].maxSpeed`; checkpoint restore accepts the kind through `vehicleKind`. The smart-ride packet gates (`server/chauffeur.js`, `src/river_oaks/chauffeur.py`) accept `hover`.
- Garage: one more `<option>` in the owner-only `.vehicle-garage` select.
- Phase tube (`preview/src/office-arrival-architecture.js`): a glass drum of radius `ARRIVAL.tubeRadius` about a vertical axis at `ARRIVAL.tubeZ`, doorways facing the lobby and the office, curved leaves that rotate about the axis behind the fixed glass (`doorOpening(doors)` gives the clear width), chrome jambs, mullions and bands, an enamel plinth and cap, a dark shaft with lamp strips behind the glass, and a `C N D T` call pad. `arrivalFrame` (`office-arrival-model.js`) now carries `ring` (0..1 height of the light, up then down across the ascent) and `presence` (0 for the beat at the top); both office scenes draw no local body while `presence` is 0. The district's idle lobby and `arrivalBehindGlass` are unchanged in behaviour.

## Files owned

- `preview/src/vehicle-config.js`, `preview/src/road-vehicles.js`, `preview/src/vehicle-glints.js`, `preview/src/driving-hands.js`, `preview/src/player-avatar.js`, `preview/e2e/fixtures/vehicles.js`.
- `preview/src/office-arrival-architecture.js`, `preview/src/office-arrival-model.js`, `preview/src/office-scene.js`, `preview/src/office-world-scene.js`.
- `server/chauffeur.js`, `src/river_oaks/chauffeur.py`.
- Tests: `preview/tests/vehicles.test.js`, `preview/tests/office-arrival-architecture.test.js`, `preview/tests/office-scene.test.js`, `server/tests/world.test.js`, `server/tests/chauffeur.test.js`, `tests/test_chauffeur.py`.
- Docs: `docs/world-direction.md`, `docs/multiplayer.md`, `docs/offices.md`, this ledger.

## Checks

- [x] `node --test preview/tests/vehicles.test.js preview/tests/carriage-motion.test.js preview/tests/carriage.test.js preview/tests/carriage-parking.test.js`: 33 passed, 0 failed, on the smaller flying hull (hover in both kind loops; unseen contact tyres, paint clearance, rotor span and animation, yoke, glints, parking and seat envelope; lift climbs, level airborne fit, blocked sky, ceiling and landing).
- [x] `node --test preview/tests/office-arrival-architecture.test.js preview/tests/office-contract.test.js preview/tests/office-scene.test.js preview/tests/office-world-presentation.test.js preview/tests/arrival.test.js preview/tests/office-tower-raise.test.js preview/tests/green-roofs.test.js preview/tests/curb-descent.test.js`: 46 passed, 0 failed (door leaves open only for their landing and clear the office wall; the phase light sweeps up and back with the body absent at the top; teardown releases every geometry, material and texture once).
- [x] `node --test --test-name-pattern="hover coach|vehicle pose|may fly" server/tests/world.test.js`: 4 passed (guest refused `exclusive_vehicle`; a 7.5 m/s owner move refused as `movement_too_fast` in the car and accepted in the coach; the owner as Kai is refused flight on foot and in the car but flies the coach; the ceiling still binds; a checkpoint keeps the coach aloft and refuses an airborne car).
- [x] `node --test server/tests/chauffeur.test.js` and `uv run --locked pytest -q tests/test_chauffeur.py`: pass.
- [ ] Fixture screenshots of the reshaped coach and the phase tube against the references.
- [x] `pnpm run verify` (core) on the reshaped coach and phase tube before flight and the shrink: passed (receipt `.runtime/agent/core.json`, 18:0xZ).
- [x] `pnpm run verify` (core) on the final tree with flight and the 30% plan shrink: passed (receipt `.runtime/agent/core.json`, 2026-10-28 18:05Z; preview 4,325 tests, server suites, 171 Python tests, lint).

## Results

- First coach renders (15:24Z, 16:40Z): hull, canopy, door, portholes, rotor, tail fan and pods read as intended; 156 draws and 768 k triangles for the whole fixture scene against 201 and 875 k for the car. Defects fixed: the carpet poked outside the hull, the pilot's feet showed under the nose, the console pierced the nose, the steps floated, the pylons read as stilts.
- Reshape (17:30Z) toward the reference: teardrop hull, tinted roof band over the windscreen, chrome nose spear and emblem, three-step stair on chrome stringers, settee and side table in the lounge, torpedo pods on short fairings, dorsal and ventral tail fins. Renders pending the shared browser lock.
- Authenticated fixture town (`startBrowserFixture`, `woodland-heights-1`): the owner joins with the garage shown and the manifest reports `districtRevision: woodland-heights-1`; the scripted drive stalled on Playwright's hit-tested click under software rendering before the DOM-level rerun was stopped for this redesign.

## Gaps

- No browser journey drives or flies the coach or watches the phase tube yet; `desktop/vehicles-e2e.js` still loops over the car and motorcycle only.
- The coach follows the ground beneath it while flying (altitude is relative, as for Jevica's flight) and its hull clearance samples nine plan points at two heights, so a very narrow mast could pass between samples. Jev's smart ride stays on the road; lift stops it.
- The phase effect hides the body for a beat and draws a light column over it; it does not clip the avatar's materials at the ring, which would need per-material clipping planes on shared rigs.

## Next step

Read the queued fixture renders, fix any defect, run the core gate, commit and open the draft PR.
