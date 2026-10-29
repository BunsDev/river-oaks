# Rides: Jev drives only the pink car; the player drives everything else

- **Request:** Val, 2026-10-29 (goal session): "for the landowner vehicle, jev does not drive
  it, the user drives it. jev only drives the pink car, all else is the user. all users get
  the motorcycle access and make sure the driving on the pink motorcycle is realistic
  animations."
- **Task id:** `rides-user-drives-20261029` (live register)
- **Owner:** `claude:river-oaks-22 (b90b7d)`
- **Branch:** `feat/rides-user-drives-20261029`
- **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-rides-user-drives`
- **Baseline head:** `39a5f30272ea620ce692b95fcc15a8c69b9aff9f` (`origin/main`, 2026-10-29)

## Objective

1. The pink Rolls-Royce is the only ride Jev chauffeurs. In every other kind the player sits
   in the driver seat with the controls, and Jev is not aboard. The rule is a property of
   the vehicle contract (`chauffeur` in `vehicle-config.js`), so PR #737's landowner hover
   coach (`hover`, not chauffeured) is driven by its owner once both land, without a change
   to that branch.
2. Every account may call and ride the rose motorcycle (`shared` in `vehicle-config.js`);
   the car stays the Jevica owner's. The server enforces it on every pose and on checkpoint
   restore.
3. The motorcycle rider is animated as a motorcyclist: palms on the grips turning with the
   bars, the balls of the feet on the rider pegs with knees out, a cruiser lean that deepens
   with speed, shoulders turning with the bars and the body banking into a turn, the engine's
   idle tremor, and the left foot flat on the road at a stop.

## Files owned

- `preview/src/vehicle-config.js`: `chauffeur` (rolls) and `shared` (motorcycle) flags,
  `vehicleChauffeured()`, `vehicleShared()`.
- `server/world.js`: `exclusive_vehicle` only for a non-shared kind; checkpoint validation
  accepts a shared kind for any account.
- `preview/src/parked-carriage.js`: seat, floor, `driver` flag and Jev's participation
  follow `vehicleChauffeured(kind)`; smart drive only when chauffeured.
- `preview/src/player-avatar.js`: garage for every account (owner: car + motorcycle; others:
  motorcycle), labels (Call Jev / Call your ride, Ride with Jev / Ride), Jev's smart drive,
  pause and companion only for a chauffeured ride, `ridingDriver` into the avatar,
  `data-driving` on the canvas host.
- `preview/src/motorcycle-rider.js` (new) and `preview/src/avatars.js`: the rider pose. The torso
  also hinges forward with the steering lock (`REACH`), because the outer grip swings about
  12 cm ahead of the rider at full lock and the palm fell 12–16 cm short without it.
- `preview/tests/motorcycle-rider.test.js` (new): on the real rigs (five bodies incl. Jevica)
  the balls of both feet rest on the peg tops, both palms hold their grips straight ahead and
  at ±full lock and at 0.3, the lean deepens with speed and the body banks into a turn; at a
  stop the left shoe stands flat on the road while the right foot waits on its peg and returns
  riding off; reduced motion keeps the hands on the grips and opens them after the ride; a
  pillion passenger (`ridingDriver` false) never reaches for the bars.
- `preview/src/remote-players.js`: peers on a self-driven kind sit at its driver seat as
  drivers.
- The five garment `*-morph-receipt.json` files: `avatars.js` is a bake input, so the bakes were
  rerun with `scripts/bake-*.mjs --write`; the `*-morph-data.js` outputs are byte-identical.
- `preview/src/walking-ui.js`: HUD title "Riding" when the player drives.
- Tests: `preview/tests/vehicles.test.js`, `server/tests/world.test.js`,
  `server/tests/cycling.test.js`; journey `preview/e2e/multiplayer-exclusivity.js` (guest
  garage, self-driven motorcycle accepted by the town, Jev absent).
- Docs: `docs/multiplayer.md`, `docs/world-direction.md`, `docs/character-forms.md`.

## Checks

- `node --test preview/tests/vehicles.test.js server/tests/world.test.js server/tests/cycling.test.js preview/tests/carriage-driver.test.js preview/tests/chauffeur.test.js preview/tests/walk-driver.test.js`
- `node --test preview/tests/motorcycle-rider.test.js preview/tests/bicycle-rider.test.js preview/tests/carriage.test.js preview/tests/carriage-motion.test.js preview/tests/carriage-parking.test.js preview/tests/plaza-bicycle.test.js`
- `pnpm run verify` (core)
- Browser: `multiplayer-exclusivity` (shared fixture town) when the browser lock and host
  load allow; the rider pose's node regression loads the real rigs, so only its look is left to eyes.

## Results

- Focused tests: 100 pass, 0 fail (2026-10-29, worktree head dirty on 39a5f302).
- Rider and carriage tests (2026-10-29, after `REACH`): vehicles/cycling/world 73 pass; carriage,
  bicycle, plaza 36 pass; motorcycle-rider + bicycle-rider 7 pass, 0 fail.
- `pnpm run verify` (core) on 39a5f302 + this diff, 2026-10-29 (host load 20–30): passed;
  receipt `.runtime/agent/core.json`. agent-tests 289/289, preview-tests 4685 run / 4649 pass /
  0 fail, server-tests 1366 run / 1081 pass / 0 fail (Redis and live-auth skips), desktop
  132 / 127 pass, build, python, demo, secrets clean. The first run failed only the five
  garment-bake receipt tests (`avatars.js` and `vehicle-config.js` are bake inputs); the five
  bakes were rerun with `--write` and only the `*-morph-receipt.json` files changed (no morph data).
- `preview/tests/motorcycle-rider.test.js`: 3/3 on the real rigs (inside preview-tests above).
- Browser (`multiplayer-exclusivity` in the shared `required` set): queued from a detached
  snapshot behind the shared browser lock; result recorded below when it lands.

## Gaps

- The hover coach (#737) is not on main; this branch does not touch it. After #737 merges,
  `vehicleChauffeured('hover')` is false, so its owner drives it; #737's `hover-coach`
  journey text ("Ride with Jev") and docs need the owner of that task to reconcile.
- The pillion pose (a passenger behind a driver) is unchanged; nobody rides pillion today.
- Human visual review of the rider pose on desktop and phone remains.

## Next step

Draft PR open; browser journey queued; hosted checks to observe.
