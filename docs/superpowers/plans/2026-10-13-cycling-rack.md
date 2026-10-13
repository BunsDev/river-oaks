# Cycling Rack Implementation Plan (PR 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Players take a bike from a four-slot rack on the Dior–Toulouse plaza, ride it at a variable speed capped at 18 mph, and the server counts their validated metres into a per-account store.

**Architecture:** `bicycle` becomes a third vehicle kind in the shared vehicle spec, so the existing mount/dismount controller, pose packet, server speed budget and remote rider rendering carry it. The rack is plan data in `plaza-salon-plan.js` (browser and server import it), drawn procedurally in `plaza-salon.js`. The server arbitrates rack slots like seats (`cycle` / `uncycle`), accepts a bicycle pose only from a slot holder, adds accepted ground distance to a per-player ride meter, and the transport flushes meters into a `cycling-miles` account store (Memory twin for the dev town, Redis twin for the gateway). The leaderboard route and sheet are PR 2.

**Tech Stack:** plain JavaScript ESM, Three.js, Node `node:test`, ioredis (Redis cases skip without `REDIS_URL`), Playwright journeys via `pnpm run test:experience`.

**Spec:** `docs/superpowers/specs/2026-10-13-cycling-rack-design.md`. **Worktree:** `/Users/buns/Documents/GitHub/BunsDev/river-oaks-cycling-rack-20261013`, branch `feat/cycling-rack-20261013`. **Task:** `cycling-rack` in the primary register.

**Conventions you must keep:**
- World and server positions are `[east, north, up]` metres. Three.js scene space is `(east, up, -north)`. A heading is `atan2(dx, -dnorth)`: heading `0` faces **south**, `Math.PI` faces north.
- Every commit: `git commit -S` (signed), message ends with `Coven-Harness: Claude Code / claude-fable-5-1`, no `Co-Authored-By` line. After each commit run `git log -1 --pretty='%G?'` and expect `G`.
- Run tests from the worktree root. `pnpm test` = client unit tests, `pnpm run test:server` = server tests, `pnpm run test:experience <journey>` = one browser journey.
- Install once: `pnpm install --frozen-lockfile --prefer-offline` (the worktree has no `node_modules` yet).

**One deliberate deviation from the spec:** the spec said the bicycle has `passengerSeat: null`. Three consumers index `passengerSeat` (`parked-carriage.js:31`, `remote-players.js:24,99`, `road-vehicles.js:119`). Instead, the bicycle's `passengerSeat` **is the saddle** (same point as `driverSeat`) and the spec gains `seats: 1`. The rider sits on the saddle through the unchanged consumers, and nothing has to tolerate null. This closes the spec's first open risk.

---

## File map

| File | Responsibility |
| --- | --- |
| `preview/src/vehicle-config.js` | `bicycle` spec (maxSpeed 8.05, cruiseSpeed 5), `vehicleKind`, `drivingInput` learns `sprint` |
| `preview/src/carriage-motion.js` | target speed uses `cruiseSpeed` unless sprinting |
| `preview/src/plaza-salon-plan.js` | `rack` in the plan, `plazaSalonRack(world)` slots, rack footprints |
| `preview/src/plaza-salon.js` | procedural rack and four parked bikes, `group.userData.rack.setTaken` |
| `preview/src/road-vehicles.js` | bicycle mesh branch |
| `preview/src/plaza-bicycle.js` (new) | client controller: take a bike (G), ride, step out, snapshot sync |
| `preview/src/main.js` | wire the controller, hide taken bikes from the snapshot, `window.__riverCycling` |
| `preview/src/walking-ui.js` | "Cycling" title and the ride place line |
| `server/world.js` | `cycle`/`uncycle`, bicycle pose gating, ride metres, `cycling` in the snapshot, `drainRides()`, restore validation |
| `server/cycling-miles.js` (new) | `createMemoryCyclingMiles`, `createRedisCyclingMiles` |
| `server/app.js`, `server/redis-room.js`, `server/town.js`, `server/world-gateway.js`, `server/tests/browser-fixture.js` | flush ride metres into the store every 30 s, on `uncycle`, on leave |
| `preview/e2e/cycling-rack.js` (new), `preview/e2e/experience-runner.js` | the journey and its suite entry |
| `docs/multiplayer.md` | the cycling commands and counting rule |

---

### Task 1: The bicycle vehicle spec and the sprint input

**Files:**
- Modify: `preview/src/vehicle-config.js`
- Test: `preview/tests/vehicles.test.js`

- [ ] **Step 1: Write the failing tests**

Append to `preview/tests/vehicles.test.js`:

```js
test('the plaza bicycle is a one-seat vehicle capped at 18 mph with a slower cruise',()=>{
 const spec=VEHICLES.bicycle;
 assert.equal(spec.kind,'bicycle');
 assert.equal(spec.seats,1);
 assert.ok(Math.abs(spec.maxSpeed-8.05)<1e-9,'18 mph is 8.05 m/s');
 assert.equal(spec.cruiseSpeed,5);
 assert.deepEqual(spec.passengerSeat,spec.driverSeat,'the rider sits on the saddle');
 assert.equal(spec.wheels.length,2);
 assert.equal(spec.steeredWheels,1);
 assert.equal(VEHICLES.rolls.cruiseSpeed,undefined);
 assert.equal(VEHICLES.motorcycle.cruiseSpeed,undefined);
});
test('vehicleKind accepts the bicycle and drivingInput carries sprint only as a boolean',()=>{
 assert.equal(vehicleKind('bicycle'),'bicycle');
 assert.equal(vehicleKind('scooter'),null);
 assert.deepEqual(drivingInput({forward:1,sprint:true}),{forward:1,turn:0,strafe:0,sprint:true});
 assert.deepEqual(drivingInput({forward:1,fast:true}),{forward:1,turn:0,strafe:0,sprint:true});
 assert.deepEqual(drivingInput({forward:1,sprint:'yes'}),{forward:1,turn:0,strafe:0});
});
```

Also add `vehicleKind` to the import at the top of that test file:

```js
import { VEHICLES, drivingInput, chauffeurCommand, vehicleKind } from '../src/vehicle-config.js';
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test preview/tests/vehicles.test.js`
Expected: 2 failing tests (`spec` is undefined; `vehicleKind('bicycle')` is `null`).

- [ ] **Step 3: Implement the spec and input**

In `preview/src/vehicle-config.js`, change the typedefs and add the spec:

```js
/** @typedef {'rolls'|'motorcycle'|'bicycle'} VehicleKind */
/** @typedef {[number,number,number]} Point3 */
/** @typedef {{kind:VehicleKind,label:string,length:number,width:number,height:number,wheelbase:number,maxSpeed:number,cruiseSpeed?:number,seats?:number,steeringLimit:number,steeredWheels:number,wheels:Point3[],driverSeat:Point3,passengerSeat:Point3,driverFloor:number,bodyHeight:number,passengerFloor:number,grips:Point3[]}} VehicleSpec */
```

Inside `VEHICLES`, after `motorcycle`:

```js
 // The plaza bicycle: one rider on the saddle (the passenger seat IS the saddle,
 // so every seat consumer works unchanged). maxSpeed is the server's hard cap,
 // 18 mph; cruiseSpeed is the pedalling speed without the sprint key.
 bicycle:{kind:'bicycle',label:'Plaza bicycle',length:1.8,width:.6,height:1.1,wheelbase:1.05,maxSpeed:8.05,cruiseSpeed:5,seats:1,steeringLimit:.6,steeredWheels:1,
  wheels:[[-.525,.34,0],[.525,.34,0]],driverSeat:[.12,.92,0],passengerSeat:[.12,.92,0],driverFloor:.30,passengerFloor:.30,bodyHeight:.95,grips:[[-.42,1.02,-.22],[-.42,1.02,.22]]},
```

Replace `vehicleKind` and `drivingInput`:

```js
/** @param {unknown} value @returns {VehicleKind|null} */
export function vehicleKind(value) { return value==='rolls'||value==='motorcycle'||value==='bicycle'?value:null; }
/** @param {unknown} value */
const control=value=>typeof value==='number'&&Number.isFinite(value)?Math.max(-1,Math.min(1,value)):0;
/** `sprint` (or the walking console's `fast`) lifts a bicycle from cruise to its cap. @param {unknown} value @returns {{forward:number,turn:number,strafe:number,brake?:boolean,sprint?:boolean}} */
export function drivingInput(value) {
 const input=value&&typeof value==='object'?/** @type {Record<string,unknown>} */(value):{};
 return {forward:control(input.forward),turn:control(input.turn),strafe:control(input.strafe),...(input.brake===true?{brake:true}:{}),...(input.sprint===true||input.fast===true?{sprint:true}:{})};
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test preview/tests/vehicles.test.js`
Expected: all pass (the existing Rolls and motorcycle tests included).

- [ ] **Step 5: Commit**

```bash
git add preview/src/vehicle-config.js preview/tests/vehicles.test.js
git commit -S -m "$(cat <<'EOF'
Add the plaza bicycle vehicle kind and a sprint input

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 2: Variable pedalling speed in the motion model

**Files:**
- Modify: `preview/src/carriage-motion.js:55-64`
- Test: `preview/tests/carriage-motion.test.js`

- [ ] **Step 1: Write the failing test**

Append to `preview/tests/carriage-motion.test.js`:

```js
test('a bicycle cruises at 5 m/s, sprints to the 18 mph cap, and the car ignores sprint',()=>{
  const env={groundAt:()=>0,canOccupy:()=>true};
  const ride=(vehicle,input)=>{const state={vehicle,position:[0,0,0],yaw:0,speed:0,distance:0};for(let i=0;i<600;i++)motion.stepCarriage(state,env,input,1/60);return state.speed;};
  assert.ok(Math.abs(ride('bicycle',{forward:1})-5)<.05,'cruise');
  assert.ok(Math.abs(ride('bicycle',{forward:1,sprint:true})-8.05)<.05,'sprint reaches the cap');
  assert.ok(Math.abs(ride('bicycle',{forward:.5})-2.5)<.05,'half input pedals at half cruise');
  assert.ok(Math.abs(ride('rolls',{forward:1,sprint:true})-7)<.05,'the car has one target speed');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test preview/tests/carriage-motion.test.js`
Expected: FAIL on 'cruise' (the bicycle reaches 8.05 without sprint).

- [ ] **Step 3: Implement**

In `preview/src/carriage-motion.js`, inside `stepCarriage`, replace the `target` line:

```js
    const top=controls.sprint||!spec?.cruiseSpeed?(spec?.maxSpeed??4):spec.cruiseSpeed;
    const target=forward*(forward<0?1.4:top);
```

- [ ] **Step 4: Run the tests**

Run: `node --test preview/tests/carriage-motion.test.js preview/tests/carriage.test.js preview/tests/carriage-driver.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add preview/src/carriage-motion.js preview/tests/carriage-motion.test.js
git commit -S -m "$(cat <<'EOF'
Pedal a bicycle at cruise speed, sprint to the cap

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 3: The rack in the plaza plan

**Files:**
- Modify: `preview/src/plaza-salon-plan.js`
- Test: `preview/tests/plaza-salon.test.js`

- [ ] **Step 1: Write the failing tests**

Add `plazaSalonRack` to the import in `preview/tests/plaza-salon.test.js`:

```js
import { CHESS_CELL_M, chessCell, chessCellIsDark, chessCellPosition, chessSeat, plazaSalonPlan, plazaSalonFootprints, plazaSalonRack, plazaSalonSeats } from '../src/plaza-salon-plan.js';
```

Append:

```js
test('the bike rack offers four slots on open paving that face south into the plaza', () => {
  const slots = plazaSalonRack(district);
  assert.equal(slots.length, 4);
  assert.deepEqual(slots.map(slot => slot.id), ['plaza-salon-rack:0', 'plaza-salon-rack:1', 'plaza-salon-rack:2', 'plaza-salon-rack:3']);
  assert.deepEqual(plazaSalonRack(blankRegion()), []);
  assert.deepEqual(plazaSalonRack(vegetated), slots, 'slots do not depend on the vegetation dataset');
  const plan = plazaSalonPlan(district);
  for (const slot of slots) {
    assert.equal(slot.rackId, 'plaza-salon-rack');
    assert.equal(slot.heading, 0, 'a parked bike points south, away from the footway');
    assert.ok(slot.approach[1] < slot.north, 'the approach is south of the bike');
    assert.ok(free(furnished, [slot.x, slot.north]), `${slot.id} must stay mountable`);
    assert.ok(free(furnished, slot.approach), `${slot.id} must be reachable`);
    assert.ok(slot.x > -2784.7 + 1.2, 'the rack keeps the Dior entrance clear');
    assert.ok(slot.north > plan.rack.north - 1.4 && slot.north < plan.rack.north, 'bikes sit just south of the bar');
  }
  // The bar blocks walking; a bike slot does not.
  assert.equal(free(furnished, [plan.rack.x, plan.rack.north]), false, 'the rack bar must block');
  assert.equal(free(bare, [plan.rack.x, plan.rack.north]), true, 'the bar stands on open paving');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test preview/tests/plaza-salon.test.js`
Expected: FAIL, `plazaSalonRack` is not exported.

- [ ] **Step 3: Implement the plan data**

In `preview/src/plaza-salon-plan.js`, inside `plazaSalonPlan(world)` after the `stage.heading` line, add:

```js
  // The bike rack: a bronze bar along the north footway, east of the Dior
  // entrance (east ≈ -2784.7 stays open), with four bikes parked on its south
  // side so riders roll out onto the plaza paving.
  const rack = { id: 'rack', x: -2781.0, north: -1293.4, heading: 0, slots: 4, pitch: 0.9, length: 3.2 };
```

and add `rack` to the returned object: `return { round, chess, bench, chairs, planters, lanterns, stage, rack, trees, strands, postHeight: POST_HEIGHT };`

In `plazaSalonFootprints`, before `return footprints;`, add the bar as a row of discs (the slots stay open):

```js
  // The rack bar: overlapping discs along its length; bikes and riders stand south of it.
  for (let step = 0; step <= 8; step++) {
    const offset = -plan.rack.length / 2 + plan.rack.length * step / 8;
    footprints.push([plan.rack.x + Math.cos(plan.rack.heading) * offset, plan.rack.north + Math.sin(plan.rack.heading) * offset, 0.22, 0.8]);
  }
```

After `plazaSalonSeats`, export the slots:

```js
// Bike slots on the rack, in the seat conventions: a slot is `${rackId}:${n}`,
// its position is where the bike stands (open paving), `approach` is where a
// rider walks up to it, and `heading` is the way the bike points. The server
// mounts a rider here; the browser draws a parked bike while the slot is free.
export function plazaSalonRack(world) {
  const plan = plazaSalonPlan(world);
  if (!plan) return [];
  const { rack } = plan, slots = [];
  for (let slot = 0; slot < rack.slots; slot++) {
    const across = -(rack.slots - 1) / 2 * rack.pitch + slot * rack.pitch;
    const [x, north] = [rack.x + Math.cos(rack.heading) * across, rack.north + Math.sin(rack.heading) * across];
    const [bx, bn] = along([x, north], rack.heading, 0.9);
    slots.push({ id: `plaza-salon-rack:${slot}`, rackId: 'plaza-salon-rack', slot, x: bx, north: bn, heading: rack.heading, approach: along([bx, bn], rack.heading, 0.9) });
  }
  return slots;
}
```

- [ ] **Step 4: Run the tests**

Run: `node --test preview/tests/plaza-salon.test.js`
Expected: all pass. If `every piece stands on open paving, clear of roads, walkways and tree trunks` fails on a rack footprint, move `rack.north` south by 0.2 m steps (no further than -1294.0) or `rack.x` east by 0.2 m steps (no further than -2780.0) until the plaza tests and the new rack test both pass. Record the final numbers in the ledger.

- [ ] **Step 5: Commit**

```bash
git add preview/src/plaza-salon-plan.js preview/tests/plaza-salon.test.js
git commit -S -m "$(cat <<'EOF'
Plan a four-slot bike rack on the plaza footway

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 4: Server authority: slots, bicycle poses, ride metres

**Files:**
- Modify: `server/world.js`
- Test: `server/tests/cycling.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `server/tests/cycling.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createSharedWorld } from '../world.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonRack } from '../../preview/src/plaza-salon-plan.js';
import { JEVICA_ADMIN_USER_IDS } from '../admin.js';

// The plaza bike rack: slots are arbitrated like seats, a bicycle pose needs a
// slot, and only accepted bicycle poses add to a rider's metres.
const data = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
const environment = createWalkingEnvironment(data);
const slots = plazaSalonRack(data);
const OWNER = JEVICA_ADMIN_USER_IDS[0];
const identity = userId => ({ userId, name: userId, sessionId: `${userId}-s`, expiresAt: Date.now() + 3_600_000 });

function setup(users = ['alice', 'bob']) {
  let time = 1_000_000;
  const world = createSharedWorld(data, { now: () => time });
  for (const id of users) assert.equal(world.join(identity(id)).ok, true);
  const put = (id, [x, north]) => { Object.assign(world.players.get(id), { position: [x, north, environment.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 }); };
  const me = id => world.snapshot().players.find(player => player.id === id);
  const act = (id, message) => world.command(id, message);
  const ride = (id, [x, north]) => act(id, { type: 'pose', position: [x, north, environment.groundAt(x, -north)], yaw: 0, altitude: 0, vehicle: 'bicycle' });
  return { world, put, me, act, ride, advance: ms => { time += ms; } };
}

test('a rider takes a free slot from its approach, a second rider is refused it, and stepping out frees it', () => {
  const f = setup();
  f.put('alice', slots[0].approach);
  f.put('bob', slots[0].approach);
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).ok, true);
  const alice = f.me('alice');
  assert.equal(alice.vehicle, 'bicycle');
  assert.deepEqual(alice.position.slice(0, 2), [slots[0].x, slots[0].north]);
  assert.deepEqual(f.world.snapshot().cycling, { taken: ['plaza-salon-rack:0'] });
  assert.equal(f.act('bob', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).error, 'slot_taken');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 }).error, 'already_cycling');
  assert.equal(f.act('alice', { type: 'uncycle' }).ok, true);
  assert.equal(f.me('alice').vehicle, null);
  assert.deepEqual(f.world.snapshot().cycling, { taken: [] });
  assert.equal(f.act('bob', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).ok, true);
  assert.equal(f.act('bob', { type: 'uncycle' }).ok, true);
  assert.equal(f.act('bob', { type: 'uncycle' }).error, 'not_cycling');
});

test('the rack refuses from far away, from a seat, in the air, with a bad slot, and when all four are out', () => {
  const f = setup(['alice', 'bob', 'carol', 'dave', 'erin']);
  f.put('alice', [slots[0].approach[0], slots[0].approach[1] - 6]);
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).error, 'rack_out_of_reach');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 9 }).error, 'invalid_slot');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'elsewhere', slot: 0 }).error, 'invalid_slot');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0, extra: 1 }).error, 'invalid_slot');
  f.put('alice', slots[0].approach);
  f.world.players.get('alice').altitude = 2;
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).error, 'rack_out_of_reach');
  f.world.players.get('alice').altitude = 0;
  for (const [i, id] of ['alice', 'bob', 'carol', 'dave'].entries()) {
    f.put(id, slots[i].approach);
    assert.equal(f.act(id, { type: 'cycle', rackId: 'plaza-salon-rack', slot: i }).ok, true, `${id} takes slot ${i}`);
  }
  f.put('erin', slots[0].approach);
  assert.equal(f.act('erin', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).error, 'slot_taken');
  assert.equal(f.world.snapshot().cycling.taken.length, 4);
});

test('a bicycle pose needs a slot, obeys the 18 mph budget, and only accepted distance counts', () => {
  const f = setup();
  f.put('alice', slots[0].approach);
  const start = [slots[0].x, slots[0].north];
  assert.equal(f.ride('alice', [start[0], start[1] - 1]).error, 'bike_required', 'no slot, no bike');
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).ok, true);
  f.advance(1000);
  // 7 m in one second is under the 8.05 m/s cap; 9 m is over it.
  assert.equal(f.ride('alice', [start[0], start[1] - 7]).ok, true);
  f.advance(1000);
  assert.equal(f.ride('alice', [start[0], start[1] - 16]).error, 'movement_too_fast');
  f.advance(1000);
  assert.equal(f.ride('alice', [start[0], start[1] - 12]).ok, true);
  const rides = f.world.drainRides();
  assert.deepEqual(rides, [{ userId: 'alice', name: 'alice', meters: 12 }]);
  assert.deepEqual(f.world.drainRides(), [], 'draining resets the counters');
  // Walking poses add nothing, and a pose without the bike releases the slot.
  f.advance(1000);
  assert.equal(f.act('alice', { type: 'pose', position: [start[0], start[1] - 13, environment.groundAt(start[0], -(start[1] - 13))], yaw: 0, altitude: 0 }).ok, true);
  assert.deepEqual(f.world.snapshot().cycling, { taken: [] });
  assert.deepEqual(f.world.drainRides(), []);
  f.advance(1000);
  assert.equal(f.ride('alice', [start[0], start[1] - 14]).error, 'bike_required', 'the slot was released');
});

test('leaving the town releases the slot and keeps the metres for the flush; a checkpoint restores a rider', () => {
  const f = setup();
  f.put('alice', slots[2].approach);
  assert.equal(f.act('alice', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 2 }).ok, true);
  f.advance(1000);
  assert.equal(f.ride('alice', [slots[2].x, slots[2].north - 3]).ok, true);
  const restored = createSharedWorld(data, { now: () => 2_000_000 });
  assert.deepEqual(restored.restore(f.world.checkpoint()), { ok: true });
  assert.deepEqual(restored.snapshot().cycling, { taken: ['plaza-salon-rack:2'] });
  assert.equal(restored.snapshot().players[0].vehicle, 'bicycle');
  assert.equal(f.world.leave('alice'), true);
  assert.deepEqual(f.world.snapshot().cycling, { taken: [] });
  assert.deepEqual(f.world.drainRides(), [{ userId: 'alice', name: 'alice', meters: 3 }]);
});

test('the car and motorcycle stay exclusive to the owner while anyone may cycle', () => {
  const f = setup(['bob', OWNER]);
  f.put('bob', slots[0].approach);
  assert.equal(f.act('bob', { type: 'pose', position: [slots[0].x, slots[0].north, environment.groundAt(slots[0].x, -slots[0].north)], yaw: 0, altitude: 0, vehicle: 'motorcycle' }).error, 'exclusive_vehicle');
  assert.equal(f.act('bob', { type: 'cycle', rackId: 'plaza-salon-rack', slot: 0 }).ok, true);
  f.put(OWNER, slots[1].approach);
  assert.equal(f.act(OWNER, { type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 }).ok, true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/tests/cycling.test.js`
Expected: every test fails (`cycle` is `invalid_command`, `snapshot().cycling` is undefined, `drainRides` is not a function).

- [ ] **Step 3: Implement in `server/world.js`**

Add the import after the `world-interactions.js` import line:

```js
import { plazaSalonRack } from '../preview/src/plaza-salon-plan.js';
```

Inside `createSharedWorld`, after `const benches=benchSeats(worldData);`, add the rack data and helpers:

```js
  // The plaza bike rack: a slot is held by at most one player (player.cycling),
  // exactly as a seat is. Metres ride on the player until the transport drains
  // them into the account store (drainRides), so a disconnect loses nothing.
  const rackSlots=new Map(plazaSalonRack(worldData).map(slot=>[slot.id,slot]));
  const slotHolder=slotId=>[...players.values()].find(p=>p.cycling===slotId)??null;
  const takenSlots=()=>[...players.values()].filter(p=>p.cycling).map(p=>p.cycling).sort();
  const rides=new Map();
  const bankRide=player=>{
    if(!(player.rideMeters>0))return;
    const entry=rides.get(player.id)??{userId:player.id,name:accountName(player.id,player.name),meters:0};
    entry.meters+=player.rideMeters;entry.name=accountName(player.id,player.name);rides.set(player.id,entry);
    player.rideMeters=0;
  };
  const releaseBike=player=>{
    if(!player.cycling)return false;
    bankRide(player);player.cycling=null;if(player.vehicle==='bicycle')player.vehicle=null;revision++;return true;
  };
  function cycle(player,message,time) {
    if(!fields(message,['type','rackId','slot']) || !textId(message.rackId) || !Number.isInteger(message.slot))return reject('invalid_slot');
    const slot=rackSlots.get(`${message.rackId}:${message.slot}`);
    if(!slot)return reject('invalid_slot');
    if(player.cycling)return reject('already_cycling','Step off your bike before taking another.');
    if(player.sitting)return reject('seated','Stand up before taking a bike.');
    if(slotHolder(slot.id))return reject('slot_taken','That bike is out. Try another slot.');
    const ground=environment.groundAt(slot.x,-slot.north),position=[slot.x,slot.north,ground];
    if(player.altitude>.1 || player.vehicle || distance(player.position,slot.approach)>SEAT_REACH
      || buildRoomAt(environment,player.position) || Math.abs(player.position[2]-ground)>.5)
      return reject('rack_out_of_reach','Stand on the ground beside the rack.');
    if(!environment.isFree(slot.x,-slot.north) || [...players.values()].some(other=>other.id!==player.id && distance(other.position,position)<.6))
      return reject('rack_blocked','Someone is standing at the bike.');
    interactions.cancel(player.id);
    focus.delete(player.id);
    Object.assign(player,{position,yaw:seatYaw(slot.heading-Math.PI),altitude:0,vehicle:'bicycle',cycling:slot.id,rideMeters:player.rideMeters??0,
      poseAt:time,moveBudget:.1,liftBudget:.1,gesture:null,gestureUntil:0});
    revision++;return {ok:true,player:publicPlayer(player)};
  }
  function uncycle(player,message,time) {
    if(!fields(message,['type']))return reject('invalid_command');
    if(!player.cycling)return reject('not_cycling');
    releaseBike(player);
    Object.assign(player,{poseAt:time,moveBudget:.1,liftBudget:.1});
    return {ok:true,player:publicPlayer(player)};
  }
  function drainRides() {
    for(const player of players.values())bankRide(player);
    const drained=[...rides.values()];rides.clear();return drained;
  }
```

In `pose()`, replace the single `exclusive_vehicle` line with:

```js
    if (message.vehicle==='bicycle' && !player.cycling) return correction('bike_required');
    if (message.vehicle && message.vehicle!=='bicycle' && !isJevicaOwner(player.id)) return correction('exclusive_vehicle');
```

Still in `pose()`, just before `const watering = ...` (after the budgets are spent), add the counting and release:

```js
    // Metres count only from an accepted bicycle pose; stepping off the bike
    // (a pose without it) hands the slot back.
    if (message.vehicle==='bicycle') player.rideMeters=(player.rideMeters??0)+distance(position,player.position);
    else if (player.cycling) releaseBike(player);
```

In `sit()`, add the bike release right after `interactions.cancel(player.id);`: `releaseBike(player);` (the `sit` reach check already refuses `player.vehicle`, so this only matters for a stale slot).

In `travel()`, find the success `Object.assign(player,{position:destination,sitting:null,...vehicle:null...})` at about line 453 and add `releaseBike(player);` on the line before it.

In `leave(userId)`, change the first lines to bank the ride before the player is dropped:

```js
    const leaving=players.get(userId);
    if (!leaving) return false;
    releaseBike(leaving);
    players.delete(userId);
```

In `command()`, after the `stand` dispatch line add:

```js
    if(message.type==='cycle')return cycle(player,message,time);
    if(message.type==='uncycle')return uncycle(player,message,time);
```

In `snapshot()`, add `cycling:{taken:takenSlots()},` right after `elapsed,`.

In `restore()`'s player validator, replace the vehicle clause:

```js
        && (player.vehicle == null || player.vehicle==='bicycle' ? (player.cycling==null || typeof player.cycling==='string' && rackSlots.has(player.cycling) && (player.vehicle==='bicycle')) && (player.rideMeters===undefined || nonnegative(player.rideMeters)) : isJevicaOwner(player.id) && vehicleKind(player.vehicle) && player.altitude<=0.1)
```

(Read it as: no vehicle or a bicycle → `cycling` is absent or a known slot id, and a bicycle requires a slot; metres are absent or non-negative. Any other vehicle keeps the owner rule.) After the `occupiedSeats` loop that follows, add a duplicate-slot check in the same style:

```js
      const heldSlots=new Set();
      for(const player of nextPlayers.values())if(player.cycling){if(heldSlots.has(player.cycling))throw new Error('Invalid cycling slot');heldSlots.add(player.cycling);}
```

Add `drainRides` to the returned object: `return {worldId,join,rename,leave,command,step,snapshot,checkpoint,restore,reset,accountAppearance,applyAccountAppearance,resolvePlace,listPlaces,voiceSpaceOf,setVoice,drainRides,players,state};`

- [ ] **Step 4: Run the tests**

Run: `node --test server/tests/cycling.test.js server/tests/seating.test.js server/tests/world.test.js server/tests/world-interactions.test.js server/tests/world-migration.test.js server/tests/district-checkpoint-migration.test.js`
Expected: all pass. If a restore test fails on the validator expression, bracket it exactly as written above (the ternary binds after `||`).

- [ ] **Step 5: Commit**

```bash
git add server/world.js server/tests/cycling.test.js
git commit -S -m "$(cat <<'EOF'
Arbitrate bike rack slots and count accepted bicycle metres

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 5: The cycling-miles account store

**Files:**
- Create: `server/cycling-miles.js`
- Test: `server/tests/cycling-miles.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `server/tests/cycling-miles.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { createMemoryCyclingMiles, createRedisCyclingMiles, MAX_RIDERS } from '../cycling-miles.js';

// One lifetime total per account, in metres; the Memory and Redis twins share
// this contract. Names ride along so a board never joins the profile store.
async function contract(store) {
  assert.deepEqual(await store.top(5), []);
  assert.equal(await store.rank('alice'), null);
  assert.equal(await store.add('alice', 1200.5, 'Alice'), 1200.5);
  assert.equal(await store.add('bob', 300, 'Bob'), 300);
  assert.equal(await store.add('alice', 99.5, 'Alice A.'), 1300, 'adds accumulate and the name follows the latest flush');
  assert.deepEqual(await store.top(5), [{ userId: 'alice', name: 'Alice A.', meters: 1300 }, { userId: 'bob', name: 'Bob', meters: 300 }]);
  assert.deepEqual(await store.top(1), [{ userId: 'alice', name: 'Alice A.', meters: 1300 }]);
  assert.deepEqual(await store.rank('bob'), { rank: 2, meters: 300 });
  assert.deepEqual(await store.rank('alice'), { rank: 1, meters: 1300 });
  assert.equal(await store.add('alice', 0, 'Alice'), 1300, 'zero adds nothing but reads the total');
  for (const bad of [-1, NaN, Infinity, '5']) await assert.rejects(store.add('alice', bad, 'Alice'), /Invalid ride/);
  await assert.rejects(store.add('', 1, 'Nobody'), /Invalid account/);
  await assert.rejects(store.add('carol', 1, 'x'.repeat(81)), /Invalid rider name/);
}

test('the memory store keeps one total per account and ranks by metres', async () => {
  await contract(createMemoryCyclingMiles());
});

test('the memory store caps the number of riders but always credits an existing rider', async () => {
  const store = createMemoryCyclingMiles({ maxRiders: 2 });
  await store.add('a', 1, 'A'); await store.add('b', 1, 'B');
  assert.equal(await store.add('c', 1, 'C'), null, 'a new rider beyond the cap is not stored');
  assert.equal(await store.add('a', 1, 'A'), 2);
  assert.equal(MAX_RIDERS, 10000);
});

test('the Redis store passes the same contract and survives a new instance', { skip: !process.env.REDIS_URL, timeout: 15000 }, async t => {
  const redis = new Redis(process.env.REDIS_URL), prefix = `{river-oaks:cycling-test:${randomUUID()}}`;
  redis.on('error', () => {});
  t.after(async () => { const keys = await redis.keys(`${prefix}:*`); if (keys.length) await redis.del(keys); await redis.quit(); });
  await contract(createRedisCyclingMiles({ redis, prefix }));
  const again = createRedisCyclingMiles({ redis, prefix });
  assert.deepEqual(await again.rank('alice'), { rank: 1, meters: 1300 });
  assert.equal((await again.top(10)).length, 2);
});

test('the Redis store refuses an unbraced prefix or a client without eval', () => {
  assert.throws(() => createRedisCyclingMiles({ redis: {}, prefix: '{x}' }), /Invalid cycling storage/);
  assert.throws(() => createRedisCyclingMiles({ redis: { eval() {} }, prefix: 'x' }), /Invalid cycling storage/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test server/tests/cycling-miles.test.js`
Expected: FAIL, cannot find module `../cycling-miles.js`.

- [ ] **Step 3: Implement the store**

Create `server/cycling-miles.js`:

```js
import { createHash } from 'node:crypto';

// Lifetime cycling distance per account, in metres, shared across worlds (the
// caller passes the cross-world account prefix). The Memory and Redis twins
// keep one contract: add(userId, meters, name) → total | null (over the rider
// cap), top(limit) → [{userId, name, meters}] best first, rank(userId) →
// {rank, meters} | null. Names are the public roster names at flush time, so
// a board never has to read profiles. Redis keeps a sorted set of totals and a
// hash of {name, updatedAt}; the member is the hashed user id, and the stored
// user id lets top() return the real id to the transport (never to clients).
export const MAX_RIDERS=10000;
const validId=value=>typeof value==='string' && value.length>0 && value.length<=160 && !/[\u0000-\u001f\u007f]/.test(value);
const validName=value=>typeof value==='string' && value.length<=80 && !/[\u0000-\u001f\u007f]/.test(value);
function check(userId,meters,name) {
  if(!validId(userId))throw new Error('Invalid account');
  if(typeof meters!=='number' || !Number.isFinite(meters) || meters<0)throw new Error('Invalid ride');
  if(!validName(name))throw new Error('Invalid rider name');
}
const round=value=>Math.round(value*1000)/1000;

export function createMemoryCyclingMiles({now=Date.now,maxRiders=MAX_RIDERS}={}) {
  const riders=new Map();
  const ordered=()=>[...riders.values()].sort((a,b)=>b.meters-a.meters || a.userId.localeCompare(b.userId));
  return {
    async add(userId,meters,name) {
      check(userId,meters,name);
      const rider=riders.get(userId);
      if(!rider && riders.size>=maxRiders)return null;
      const next={userId,name,meters:round((rider?.meters??0)+meters),updatedAt:now()};
      riders.set(userId,next);return next.meters;
    },
    async top(limit) {
      return ordered().slice(0,Math.max(0,Math.min(100,limit|0))).map(({userId,name,meters})=>({userId,name,meters}));
    },
    async rank(userId) {
      if(!validId(userId))throw new Error('Invalid account');
      const index=ordered().findIndex(rider=>rider.userId===userId);
      return index<0?null:{rank:index+1,meters:riders.get(userId).meters};
    },
  };
}

// KEYS[1] totals (zset), KEYS[2] riders (hash); ARGV: member, meters, record json, cap.
const ADD=`
  local total=redis.call('ZSCORE',KEYS[1],ARGV[1])
  if not total and redis.call('ZCARD',KEYS[1]) >= tonumber(ARGV[4]) then return false end
  local next=redis.call('ZINCRBY',KEYS[1],ARGV[2],ARGV[1])
  redis.call('HSET',KEYS[2],ARGV[1],ARGV[3])
  return next
`;
export function createRedisCyclingMiles({redis,prefix,now=Date.now,maxRiders=MAX_RIDERS}={}) {
  if(!redis?.eval || typeof prefix!=='string' || !/^\{[^{}]+\}$/.test(prefix))throw new Error('Invalid cycling storage');
  const totals=`${prefix}:cycling-miles:v1`,riders=`${prefix}:cycling-riders:v1`;
  const id=userId=>createHash('sha256').update(userId).digest('hex');
  const decode=raw=>{const record=raw?JSON.parse(raw):null;return record && typeof record==='object' ? record : {};};
  return {
    async add(userId,meters,name) {
      check(userId,meters,name);
      const total=await redis.eval(ADD,2,totals,riders,id(userId),round(meters),JSON.stringify({userId,name,updatedAt:now()}),maxRiders);
      return total===null||total===false?null:round(Number(total));
    },
    async top(limit) {
      const count=Math.max(0,Math.min(100,limit|0));
      if(!count)return [];
      const rows=await redis.zrevrange(totals,0,count-1,'WITHSCORES');
      if(!rows.length)return [];
      const members=rows.filter((_,i)=>i%2===0),scores=rows.filter((_,i)=>i%2===1);
      const records=await redis.hmget(riders,...members);
      return members.map((member,i)=>{const record=decode(records[i]);return {userId:record.userId??member,name:record.name??'',meters:round(Number(scores[i]))};});
    },
    async rank(userId) {
      if(!validId(userId))throw new Error('Invalid account');
      const [index,score]=await Promise.all([redis.zrevrank(totals,id(userId)),redis.zscore(totals,id(userId))]);
      return index===null||score===null?null:{rank:index+1,meters:round(Number(score))};
    },
  };
}
```

- [ ] **Step 4: Run the tests, then the Redis half**

Run: `node --test server/tests/cycling-miles.test.js`
Expected: 3 pass, 1 skipped (the Redis case).

Then with a local Redis (`redis-server --port 6390 --save "" --daemonize yes`):
Run: `REDIS_URL=redis://127.0.0.1:6390 node --test server/tests/cycling-miles.test.js`
Expected: 4 pass, 0 skipped. Stop Redis afterwards: `redis-cli -p 6390 shutdown nosave`.

- [ ] **Step 5: Commit**

```bash
git add server/cycling-miles.js server/tests/cycling-miles.test.js
git commit -S -m "$(cat <<'EOF'
Add the cycling-miles account store with Memory and Redis twins

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 6: Flush ride metres from both transports

**Files:**
- Modify: `server/app.js` (dev town transport), `server/redis-room.js` (hosted room), `server/town.js`, `server/world-gateway.js`, `server/tests/browser-fixture.js`
- Test: `server/tests/cycling-flush.test.js` (new)

- [ ] **Step 1: Write the failing tests**

Create `server/tests/cycling-flush.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { createGameServer } from '../app.js';
import { createSharedWorld } from '../world.js';
import { createMemoryCyclingMiles } from '../cycling-miles.js';
import { createWalkingEnvironment } from '../../preview/src/walking.js';
import { plazaSalonRack } from '../../preview/src/plaza-salon-plan.js';
import { approvedWaitlist } from './waitlist-fixture.js';

// The dev-town transport banks metres into the store on uncycle, on the 30 s
// tick, and when a rider leaves. (The hosted room is covered in redis-room.test.js.)
const district = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url), 'utf8'));
const environment = createWalkingEnvironment(district);
const slot = plazaSalonRack(district)[1];
const publicOrigin = 'https://sim.jev.works';

async function fixture(t) {
  let time = 100000;
  const identity = { userId: 'alice', name: 'Alice', sessionId: 'alice-session', csrfToken: 'csrf', expiresAt: time + 600000 };
  const auth = { async authenticate(req) { return /test_session=alice/.test(req.headers.cookie ?? '') ? identity : null; }, async handle() { return false; } };
  const world = createSharedWorld(district, { now: () => time });
  const cyclingMiles = createMemoryCyclingMiles();
  const app = createGameServer({ auth, world, waitlist: approvedWaitlist, origin: publicOrigin, now: () => time, cyclingMiles, cyclingFlushMs: 200 });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const origin = `http://127.0.0.1:${app.server.address().port}`;
  const response = await fetch(origin + '/api/multiplayer/ticket', { method: 'POST', headers: { Origin: publicOrigin, Cookie: 'test_session=alice', 'X-CSRF-Token': 'csrf' } });
  const { ticket } = await response.json();
  const ws = new WebSocket(`${origin.replace('http:', 'ws:')}/multiplayer?protocol=2&ticket=${ticket}`, { headers: { Origin: publicOrigin, Cookie: 'test_session=alice' } });
  await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
  let requestId = 0;
  const command = message => new Promise(resolve => {
    const id = ++requestId;
    const onMessage = raw => { const parsed = JSON.parse(raw.toString()); if (parsed.type === 'result' && parsed.requestId === id) { ws.off('message', onMessage); resolve(parsed); } };
    ws.on('message', onMessage); ws.send(JSON.stringify({ ...message, requestId: id }));
  });
  const put = ([x, north]) => Object.assign(world.players.get('alice'), { position: [x, north, environment.groundAt(x, -north)], moveBudget: 1, liftBudget: 1 });
  const settle = () => new Promise(resolve => setTimeout(resolve, 50));
  return { world, cyclingMiles, command, put, ws, settle, advance: ms => { time += ms; } };
}

test('uncycle flushes the ride, and a rider still out is flushed by the tick', async t => {
  const f = await fixture(t);
  await f.settle();
  f.put(slot.approach);
  assert.equal((await f.command({ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 })).ok, true);
  f.advance(1000);
  assert.equal((await f.command({ type: 'pose', position: [slot.x, slot.north - 5, environment.groundAt(slot.x, -(slot.north - 5))], yaw: 0, altitude: 0, vehicle: 'bicycle' })).ok, true);
  assert.equal((await f.command({ type: 'uncycle' })).ok, true);
  await f.settle();
  assert.deepEqual(await f.cyclingMiles.rank('alice'), { rank: 1, meters: 5 });
  f.put(slot.approach);
  assert.equal((await f.command({ type: 'cycle', rackId: 'plaza-salon-rack', slot: 1 })).ok, true);
  f.advance(1000);
  assert.equal((await f.command({ type: 'pose', position: [slot.x, slot.north - 4, environment.groundAt(slot.x, -(slot.north - 4))], yaw: 0, altitude: 0, vehicle: 'bicycle' })).ok, true);
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.deepEqual(await f.cyclingMiles.rank('alice'), { rank: 1, meters: 9 }, 'the periodic flush banked the open ride');
  f.ws.close();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test server/tests/cycling-flush.test.js`
Expected: FAIL, `rank('alice')` is `null` (nothing flushes).

- [ ] **Step 3: Implement the dev-town flush in `server/app.js`**

Add `cyclingMiles = null, cyclingFlushMs = 30000` to the `createGameServer` options (after `departureGraceMs = 10000`).

After the `avatarSync` block, add:

```js
  // Cycling: bank accepted bicycle metres into the account store. The world
  // keeps them until drained, so a crash loses at most one flush interval.
  const flushRides=()=>{
    if(!cyclingMiles)return Promise.resolve();
    return Promise.all(world.drainRides().map(({userId,meters,name})=>cyclingMiles.add(userId,meters,name).catch(()=>{})));
  };
  const rideFlush=cyclingMiles?setInterval(()=>{void flushRides();},cyclingFlushMs):null;
  rideFlush?.unref();
```

In the command handler, after the `avatarPreferences.save` line, add:

```js
            if(result.ok && command.type==='uncycle')await flushRides();
```

In the `ws.on('close',...)` departure timer, after `world.leave(identity.userId);` (both the `stopped` branch and the timer) add `void flushRides();`.

Find the `close()` function of the returned app (it clears `loop`, `heartbeat`, `avatarSync`) and add `if(rideFlush)clearInterval(rideFlush);` beside the others, and call `void flushRides();` before the world is stopped.

- [ ] **Step 4: Implement the hosted flush in `server/redis-room.js`**

Add `cyclingMiles=null` to `createRedisRoom`'s options. In the tick, right after the `world.step(...)` line, add:

```js
    // Bank accepted bicycle metres on every tick; the store is cross-world.
    if(cyclingMiles)for(const {userId,meters,name} of world.drainRides())
      try{await cyclingMiles.add(userId,meters,name);}catch{console.warn(JSON.stringify({event:'cycling_flush_failed',worldId}));}
```

(The room ticks about once a second, so no separate 30 s timer is needed there; `drainRides` is empty on most ticks.)

- [ ] **Step 5: Wire the stores**

`server/town.js`: import `createMemoryCyclingMiles` from `./cycling-miles.js`, create `cyclingMiles=createMemoryCyclingMiles()` beside `avatarPreferences=...` on line 60, and pass `cyclingMiles` into `createGameServer({...})` on line 103.

`server/world-gateway.js`: import `createRedisCyclingMiles` and `accountPrefixFor` (the latter from `./world-keys.js` if not already imported); create `const cyclingMiles=createRedisCyclingMiles({redis,prefix:accountPrefixFor(namespace)});` beside the other stores on line 26, and pass `cyclingMiles` into `createRedisRoom({...})` (line 66 area). Also pass it to `createDistributedServer({...})` as `cyclingMiles` for PR 2's route (unused for now; `createDistributedServer` must accept and ignore `cyclingMiles = null`).

`server/tests/browser-fixture.js`: import `createMemoryCyclingMiles` and pass `cyclingMiles:createMemoryCyclingMiles(),cyclingFlushMs:1000` into `createGameServer` so the journey sees metres within a second.

- [ ] **Step 6: Run the tests**

Run: `node --test server/tests/cycling-flush.test.js server/tests/app.test.js server/tests/town-lifecycle.test.js server/tests/town-worlds.test.js server/tests/world-gateway.test.js server/tests/redis-room.test.js`
Expected: all pass (Redis ones skip without `REDIS_URL`).

- [ ] **Step 7: Commit**

```bash
git add server/app.js server/redis-room.js server/town.js server/world-gateway.js server/distributed-app.js server/tests/browser-fixture.js server/tests/cycling-flush.test.js
git commit -S -m "$(cat <<'EOF'
Flush ride metres into the cycling store from both transports

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 7: The bicycle mesh

**Files:**
- Modify: `preview/src/road-vehicles.js`
- Test: `preview/tests/vehicles.test.js`

- [ ] **Step 1: Write the failing test**

Append to `preview/tests/vehicles.test.js`:

```js
test('the plaza bicycle is a two-wheel frame under two metres with a saddle at the spec height',()=>{
 const spec=VEHICLES.bicycle,model=createRoadVehicle('bicycle');
 try {
  assert.equal(model.wheels.length,2);
  assert.equal(model.wheelTreads.length,2);
  const size=new THREE.Box3().setFromObject(model.object).getSize(new THREE.Vector3());
  assert.ok(size.x<2 && size.x>1.5,`length ${size.x}`);
  assert.ok(size.z<.75,`width ${size.z}`);
  assert.ok(size.y>spec.driverSeat[1] && size.y<1.3,`height ${size.y}`);
  assert.ok(model.steering,'the fork steers');
  model.updateSteering(.3);
  assert.ok(Math.abs(model.steering.rotation.y-.3*.6)<1e-9,'the fork turns like the motorcycle');
 } finally {model.dispose();}
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test preview/tests/vehicles.test.js`
Expected: FAIL (`createRoadVehicle('bicycle')` builds the motorcycle branch, so the box is the motorcycle's size).

- [ ] **Step 3: Implement the mesh**

In `preview/src/road-vehicles.js`, the motorcycle body is the `else` branch after the `rolls` block (it starts near line 150 with the tank `ball([0,.52,0],...)`). Make that branch `else if(kind==='motorcycle') {` and add a bicycle branch after it, before `batchCostumeAttachments(...)`:

```js
 else if(kind==='bicycle') {
  // A step-through city bike in rose and bronze: tubes for the frame, a
  // leather saddle at the spec seat, bronze fork and bars that steer.
  const frame=pink,bronze=alloy;
  tube([[-.42,.62,0],[.05,.30,0]],.022,frame);           // down tube: head to bottom bracket
  tube([[.05,.30,0],[.14,.88,0]],.022,frame);            // seat tube
  tube([[.14,.88,0],[.52,.34,0]],.016,frame);            // seat stays
  tube([[.05,.30,0],[.52,.34,0]],.016,frame);            // chain stays
  tube([[-.42,.62,0],[-.46,.98,0]],.024,bronze);         // head tube
  add(new THREE.CylinderGeometry(.09,.09,.02,24),black,[.05,.30,.045]);   // chainring
  for(const z of [-.09,.09])add(new THREE.BoxGeometry(.11,.02,.04),black,[.05+(z<0?.08:-.08),.30,z]); // pedals
  box([.12,.92,0],[.27,.06,.15],darkLeather,.03);        // saddle
  tube([[.14,.88,0],[.12,.90,0]],.014,bronze);           // seat post
  for(const [x,r] of spec.wheels) {
   const shape=new THREE.Shape();
   for(let i=0;i<=40;i++){const a=.35+i/40*(Math.PI-.7),px=x+Math.cos(a)*(r+.045),y=r+Math.sin(a)*(r+.045);if(!i)shape.moveTo(px,y);else shape.lineTo(px,y);}
   for(let i=40;i>=0;i--){const a=.35+i/40*(Math.PI-.7);shape.lineTo(x+Math.cos(a)*(r+.02),r+Math.sin(a)*(r+.02));}
   add(new THREE.ExtrudeGeometry(shape,{depth:.06,bevelEnabled:false}),pink,[0,0,-.03]);  // mudguard
  }
  steering=new THREE.Group();object.add(steering);groups.push(steering);
  tube([[-.46,.98,0],[-.52,.62,0],[-.525,.34,0]],.014,bronze,steering);     // fork
  tube([[-.42,1.02,-.22],[-.46,1.0,0],[-.42,1.02,.22]],.012,bronze,steering); // bars
  for(const side of [-1,1]){const grip=add(new THREE.CylinderGeometry(.016,.016,.09,12),rubber,[-.42,1.02,side*.22],[1,1,1],steering);grip.rotation.x=Math.PI/2;}
  const pivot=new THREE.Vector3(-.46,.98,0);for(const child of steering.children)child.position.sub(pivot);steering.position.copy(pivot);
  tube([[-.49,.92,0],[-.52,.86,0]],.010,light);          // headlamp stalk
  ball([-.52,.86,0],[.03,.03,.02],light);
 }
```

The wheel loop near line 33 already builds a wheel per `spec.wheels` entry for every kind (hub, spokes, tyre); check it does not branch on `kind==='rolls'` in a way that skips the bicycle; the `wide` constant (`kind==='rolls'?.125:.085`) gives the bicycle the motorcycle's narrow tyre, which is fine.

- [ ] **Step 4: Run the tests**

Run: `node --test preview/tests/vehicles.test.js`
Expected: all pass. If the width assertion fails, the wheel builder's tyre width is the cause: leave it, and relax the test's width bound to `size.z<.9` with a comment that the tyre is shared with the motorcycle.

- [ ] **Step 5: Commit**

```bash
git add preview/src/road-vehicles.js preview/tests/vehicles.test.js
git commit -S -m "$(cat <<'EOF'
Draw the plaza bicycle

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 8: The rack prop with parked bikes

**Files:**
- Modify: `preview/src/plaza-salon.js`
- Test: `preview/tests/plaza-rack.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `preview/tests/plaza-rack.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { buildPlazaSalon } from '../src/plaza-salon.js';
import { plazaSalonRack } from '../src/plaza-salon-plan.js';

const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url), 'utf8'));

test('the rack draws four parked bikes and hides the ones that are out', () => {
  const salon = buildPlazaSalon(district), rack = salon.userData.rack;
  assert.ok(rack, 'the salon exposes its rack');
  assert.equal(rack.slots, 4);
  assert.deepEqual(rack.parked(), [true, true, true, true]);
  assert.equal(rack.setTaken(['plaza-salon-rack:1', 'plaza-salon-rack:3']), true);
  assert.deepEqual(rack.parked(), [true, false, true, false]);
  assert.equal(rack.setTaken(['plaza-salon-rack:1', 'plaza-salon-rack:3']), false, 'no change reports false');
  assert.equal(rack.setTaken([]), true);
  assert.deepEqual(rack.parked(), [true, true, true, true]);
  const bikes = salon.getObjectByName('Parked bikes');
  assert.ok(bikes, 'parked bikes are one group');
  assert.equal(bikes.children.length, 4);
  const slot = plazaSalonRack(district)[2], bike = bikes.children[2];
  assert.ok(Math.abs(bike.position.x - slot.x) < 1e-9 && Math.abs(bike.position.z + slot.north) < 1e-9, 'a parked bike stands on its slot');
  assert.equal(salon.userData.counts.rackSlots, 4);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test preview/tests/plaza-rack.test.js`
Expected: FAIL, `salon.userData.rack` is undefined.

- [ ] **Step 3: Implement the prop**

In `preview/src/plaza-salon.js`, import the rack slots and the bike mesh:

```js
import { CHESS_CELL_M, DOMINO, cafeChairAngle, chessCell, chessCellIsDark, chessCellPosition, dominoLine, plazaSalonPlan, plazaSalonRack } from './plaza-salon-plan.js';
import { createRoadVehicle } from './road-vehicles.js';
```

Before `group.userData.counts = ...`, add the rack block:

```js
  // The bike rack: a bronze bar on two posts along the footway, and one parked
  // bike per slot. A bike is hidden while a rider holds its slot (the snapshot's
  // cycling.taken); the rider's own bike is drawn by the vehicle controller.
  {
    const { rack } = plan, slots = plazaSalonRack(world), y = groundSurfaceHeight(world, rack.x, -rack.north);
    const c = Math.cos(rack.heading), s = Math.sin(rack.heading);
    add(unit.post, material.bronze, [rack.x, y + 0.4, -rack.north], [0.05, 0.8, rack.length], rack.heading + Math.PI / 2);
    for (const offset of [-rack.length / 2 + 0.2, rack.length / 2 - 0.2])
      add(unit.post, material.bronze, [rack.x + c * offset, y + 0.3, -(rack.north + s * offset)], [0.07, 0.6, 0.07]);
    const bikes = new THREE.Group(); bikes.name = 'Parked bikes'; group.add(bikes);
    const models = slots.map(slot => {
      const model = createRoadVehicle('bicycle');
      model.object.position.set(slot.x, groundSurfaceHeight(world, slot.x, -slot.north), -slot.north);
      // The mesh faces local -X; a heading of 0 faces south (+Z in the scene).
      model.object.rotation.y = -slot.heading - Math.PI / 2;
      bikes.add(model.object); return model;
    });
    const parked = slots.map(() => true);
    group.userData.rack = {
      slots: slots.length,
      parked: () => parked.slice(),
      setTaken(taken) {
        const held = new Set(taken ?? []); let changed = false;
        slots.forEach((slot, i) => { const show = !held.has(slot.id); if (parked[i] !== show) { parked[i] = show; models[i].object.visible = show; changed = true; } });
        return changed;
      },
      dispose: () => models.forEach(model => model.dispose()),
    };
  }
```

Then extend the counts line: `group.userData.counts = { chairs: plan.chairs.length, chess: plan.chess.length, planters: plan.planters.length, lanterns: plan.lanterns.length, strands: plan.strands.length, rackSlots: plazaSalonRack(world).length };`

Check `add`'s signature at the top of `buildPlazaSalon` (`add(geometry, materials, [x,y,z], scale, yaw)`); if `scale` is a number rather than an array there, pass the box as a unit box with the `[sx,sy,sz]` form the file already uses for planters (read the planter call and match it exactly).

In `preview/src/main.js`, where the world is torn down and `plazaSalon` is disposed (search for `plazaSalon` near `populateWorld` / the texture release loop), call `plazaSalon?.userData.rack?.dispose()` before the group is removed.

- [ ] **Step 4: Run the tests**

Run: `node --test preview/tests/plaza-rack.test.js preview/tests/plaza-games-mirror.test.js`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add preview/src/plaza-salon.js preview/src/main.js preview/tests/plaza-rack.test.js
git commit -S -m "$(cat <<'EOF'
Draw the plaza bike rack with four parked bikes

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 9: The client bicycle controller

**Files:**
- Create: `preview/src/plaza-bicycle.js`
- Modify: `preview/src/main.js`, `preview/src/walking-ui.js`, `preview/src/player-avatar.js`
- Test: `preview/tests/plaza-bicycle.test.js` (new)

- [ ] **Step 1: Write the failing test**

Create `preview/tests/plaza-bicycle.test.js`:

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { bicyclePlacement, bicycleCanOccupy, nearestFreeSlot } from '../src/plaza-bicycle.js';
import { plazaSalonRack } from '../src/plaza-salon-plan.js';
import { createWalkingEnvironment } from '../src/walking.js';

const district = JSON.parse(await readFile(new URL('../public/data/district.json', import.meta.url), 'utf8'));
const environment = createWalkingEnvironment(district);
const slots = plazaSalonRack(district);

test('a slot becomes a scene placement that faces the way the bike points', () => {
  const placement = bicyclePlacement(slots[0], environment);
  assert.equal(placement.vehicle, 'bicycle');
  assert.deepEqual([placement.position[0], placement.position[2]], [slots[0].x, -slots[0].north]);
  assert.ok(Math.abs(placement.position[1] - environment.groundAt(slots[0].x, -slots[0].north)) < 1e-9);
  assert.equal(placement.speed, 0); assert.equal(placement.distance, 0);
  // Heading 0 is south (+Z). The mesh faces local -X, and stepCarriage moves along -cos(yaw) X, +sin(yaw) Z.
  assert.ok(Math.abs(placement.yaw - Math.PI / 2) < 1e-9);
});

test('a bike may stand on open paving and footways but not inside a room or a wall', () => {
  const placement = bicyclePlacement(slots[0], environment);
  assert.equal(bicycleCanOccupy(placement, environment), true);
  const dior = district.stores.find(store => store.id === 'osm-node-8172494958');
  const inside = { ...placement, position: [dior.position?.[0] ?? -2784.7, 0, -(dior.position?.[1] ?? -1291.5)] };
  assert.equal(bicycleCanOccupy({ ...inside, position: [-2784.7, 0, 1288.5] }, environment), false, 'the Dior shop floor is a room');
});

test('the nearest free slot in reach is offered, taken ones are skipped', () => {
  const me = [slots[1].approach[0], slots[1].approach[1]];
  assert.equal(nearestFreeSlot(slots, me, new Set()).id, 'plaza-salon-rack:1');
  assert.equal(nearestFreeSlot(slots, me, new Set(['plaza-salon-rack:1'])).id, 'plaza-salon-rack:0');
  assert.equal(nearestFreeSlot(slots, [me[0], me[1] - 20], new Set()), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test preview/tests/plaza-bicycle.test.js`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Implement the controller**

Create `preview/src/plaza-bicycle.js`:

```js
import { Vector3, Quaternion } from 'three';
import { createRoadVehicle } from './road-vehicles.js';
import { VEHICLES, drivingInput } from './vehicle-config.js';
import { fitCarriageToGround, stepCarriage } from './carriage-motion.js';
import { carriageFootprint, carriageContains } from './carriage-parking.js';
import { plazaSalonRack } from './plaza-salon-plan.js';
import { SEAT_REACH } from './shared-seating.js';

// The plaza bicycle. G beside the rack asks the town for a slot (`cycle`), then
// mounts the walking controls on a bike exactly as the car does; G while riding
// asks for the ground spot (`travel`, so the step down is not a walking-speed
// violation) and then `uncycle` hands the slot back. The bike never exists
// outside the rack and the rider. Pure helpers are exported for tests.

const METERS_PER_MILE = 1609.344;

// A slot (world [east, north], heading 0 = south) as a carriage-motion placement
// in scene space. The mesh faces local -X and stepCarriage advances along
// (-cos yaw, +sin yaw), so a heading h maps to yaw = h + π/2.
export function bicyclePlacement(slot, environment) {
  const placement = { vehicle: 'bicycle', position: [slot.x, 0, -slot.north], yaw: slot.heading + Math.PI / 2, speed: 0, distance: 0, steering: 0 };
  fitCarriageToGround(placement, environment.groundAt);
  return placement;
}

// Bikes ride anywhere a walker may stand, outdoors: paving, footways and roads.
export function bicycleCanOccupy(placement, environment) {
  return carriageFootprint(placement).every(([x, z]) => environment.isFree(x, z) && !environment.roomAt?.(x, z));
}

export function nearestFreeSlot(slots, [x, north], taken) {
  let best = null;
  for (const slot of slots) {
    if (taken.has(slot.id)) continue;
    const d = Math.hypot(slot.approach[0] - x, slot.approach[1] - north);
    if (d <= SEAT_REACH && (!best || d < best.d)) best = { slot, d };
  }
  return best?.slot ?? null;
}

export function createPlazaBicycle({ scene, host, walking, getWorld, getMultiplayer, getLocals = () => [], reducedMotion = false }) {
  const model = createRoadVehicle('bicycle'); model.object.visible = false; scene.add(model.object);
  let slots = [], placement = null, mounted = false, busy = false, slotId = null, environment = null, lastRide = 0, held = {};
  const taken = () => new Set(getMultiplayer()?.snapshot?.cycling?.taken ?? []);
  const apply = () => {
    model.object.position.fromArray(placement.position); model.object.rotation.set(placement.pitch ?? 0, placement.yaw, placement.roll ?? 0, 'YXZ');
    const up = new Vector3(0, 1, 0).applyQuaternion(model.object.quaternion.clone().invert());
    model.wheels.forEach((wheel, i) => { wheel.position.fromArray(model.spec.wheels[i]).addScaledVector(up, placement.wheelOffsets?.[i] ?? 0); wheel.rotation.set(0, i < model.spec.steeredWheels ? placement.steering ?? 0 : 0, placement.distance / model.spec.wheels[i][1], 'YXZ'); });
    model.updateSteering(placement.steering ?? 0); model.object.updateMatrixWorld(true);
  };
  const canOccupy = next => bicycleCanOccupy(next, environment)
    && !(getLocals() ?? []).some(p => !p.indoor && carriageContains(next, p.position[0], next.position[1] + 1, -p.position[1], .5));
  const ride = {
    get pose() { return { kind: 'bicycle', seat: model.object.localToWorld(new Vector3(...model.spec.passengerSeat)).toArray(), cameraTarget: model.object.localToWorld(new Vector3(-.6, 1.1, 0)).toArray(), seatToFloor: model.spec.passengerSeat[1] - model.spec.passengerFloor, yaw: placement.yaw - Math.PI / 2, quaternion: model.object.quaternion.clone().multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2)).toArray(), speed: placement.speed, distance: placement.distance }; },
    step(input, delta) { const controls = drivingInput(input.forward || input.turn || input.strafe ? input : held); stepCarriage(placement, { groundAt: environment.groundAt, wheelTreads: model.wheelTreads, canOccupy }, controls, delta); apply(); },
    brake() { if (placement) placement.speed = 0; held = {}; },
    takeOver() {},
    stop() { mounted = false; held = {}; if (placement) placement.speed = 0; },
  };
  const notify = text => walking.notify?.(text);
  async function take() {
    const multiplayer = getMultiplayer(), pose = walking.getPose();
    if (busy || mounted || !environment || !pose || pose.sitting || pose.riding || pose.flying || pose.roomId) return false;
    if (!multiplayer?.connected) { notify('Reconnect before taking a bike.'); return false; }
    const slot = nearestFreeSlot(slots, [pose.position[0], -pose.position[2]], taken());
    if (!slot) { notify(slots.length && taken().size >= slots.length ? 'All bikes are out.' : 'Walk up to the bike rack first.'); return false; }
    busy = true;
    try {
      const result = await multiplayer.command({ type: 'cycle', rackId: slot.rackId, slot: slot.slot });
      if (!result.ok) { notify(result.message ?? 'The town could not hand you a bike.'); return false; }
      placement = bicyclePlacement(slot, environment); apply(); model.object.visible = true; slotId = slot.id;
      mounted = true;
      if (!walking.mount(ride)) { mounted = false; model.object.visible = false; await multiplayer.command({ type: 'uncycle' }).catch(() => {}); return false; }
      return true;
    } catch (error) { notify(error.message); return false; }
    finally { busy = false; }
  }
  async function stepOff() {
    const multiplayer = getMultiplayer();
    if (busy || !mounted) return false;
    busy = true; ride.brake();
    try {
      // The ground spot: beside the bike, on its right, then left, then behind.
      const c = Math.cos(placement.yaw), s = Math.sin(placement.yaw), seat = ride.pose.seat;
      let exit = null;
      for (const [along, side] of [[0, 1], [0, -1], [1.3, 1], [1.3, -1]]) {
        const x = placement.position[0] + along * c + side * .9 * s, z = placement.position[2] - along * s + side * .9 * c;
        if (environment.isFree(x, z) && !environment.roomAt?.(x, z) && !carriageContains(placement, x, environment.groundAt(x, z) + .9, z, .3)) { exit = [x, environment.groundAt(x, z), z]; break; }
      }
      if (!exit) { notify('There is no clear place to step off here.'); return false; }
      const result = await multiplayer.travel({ position: [exit[0], -exit[2]] });
      if (!result?.ok) return false;
      await multiplayer.command({ type: 'uncycle' }).catch(() => {});
      lastRide = placement.distance;
      const destination = result.player ? [result.player.position[0], result.player.position[2], -result.player.position[1]] : exit;
      walking.dismount(destination); walking.setYaw(Math.atan2(destination[0] - seat[0], destination[2] - seat[2]));
      model.object.visible = false; placement = null; slotId = null;
      return true;
    } catch (error) { notify(error.message); return false; }
    finally { busy = false; }
  }
  host.addEventListener('keydown', event => {
    if (event.code !== 'KeyG' || event.repeat || event.defaultPrevented) return;
    const pose = walking.getPose();
    if (mounted) { event.preventDefault(); void stepOff(); return; }
    if (pose && !pose.riding && !pose.sitting && !pose.flying && nearestFreeSlot(slots, [pose.position[0], -pose.position[2]], taken())) { event.preventDefault(); void take(); }
  });
  return {
    load(world) { slots = plazaSalonRack(world); environment = walking.environment; if (mounted) { walking.dismount(walking.getPosition() ? [placement.position[0], placement.position[1], placement.position[2]] : [0, 0, 0]); } mounted = false; placement = null; model.object.visible = false; },
    // What G does right now, for the walking console.
    prompt() {
      const pose = walking.getPose();
      if (!pose || !environment) return null;
      if (mounted) return { kind: 'step-off', label: 'Step off the bike', run: stepOff, disabled: busy };
      if (pose.riding || pose.sitting || pose.flying || pose.roomId) return null;
      const near = slots.some(slot => Math.hypot(slot.approach[0] - pose.position[0], slot.approach[1] + pose.position[2]) <= SEAT_REACH);
      if (!near) return null;
      const slot = nearestFreeSlot(slots, [pose.position[0], -pose.position[2]], taken());
      return { kind: 'take-bike', label: slot ? 'Take a bike' : 'All bikes are out', run: take, disabled: busy || !slot };
    },
    setControls(input) { if (!mounted) return false; held = drivingInput(input); return true; },
    update(now = performance.now()) { if (placement && mounted) { apply(); model.animate(now, placement.speed, reducedMotion); } },
    get riding() { return mounted; }, get slotId() { return slotId; }, get placement() { return placement; },
    get rideMeters() { return placement?.distance ?? 0; }, get lastRideMeters() { return lastRide; },
    miles: meters => Math.round(meters / METERS_PER_MILE * 10) / 10,
    take, stepOff,
    dispose() { model.dispose(); },
  };
}
```

- [ ] **Step 4: Wire it in `preview/src/main.js`**

Import: `import { createPlazaBicycle } from './plaza-bicycle.js';`
Declare `let plazaBicycle;` beside the other `let` controllers (line 105 area). After `seatAndWater = createSeatAndWater(...)` (line 217):

```js
  plazaBicycle = createPlazaBicycle({ scene, host, walking, getWorld: () => world, getMultiplayer: () => multiplayer, getLocals: () => community.state?.locals, reducedMotion });
```

Where `seatAndWater?.load(data, streetSpace)` is called (line 449), add `plazaBicycle?.load(data);`.

In `createMultiplayer`'s `onSnapshot` (line 306) add the rack sync: `plazaSalon?.userData.rack?.setTaken(snapshot.cycling?.taken ?? []);`

In the render loop where `playerAvatar.carriage.update(...)` or `playerAvatar.update(...)` runs each frame, add `plazaBicycle?.update(now);` (find the frame function by searching `carriage.update` or `remotePlayers.update(`; place it next to `remotePlayers.update`).

Add the debug hook next to `window.__riverSeatAndWater`:

```js
  window.__riverCycling = () => plazaBicycle ? { riding: plazaBicycle.riding, slotId: plazaBicycle.slotId, rideMeters: plazaBicycle.rideMeters, lastRideMeters: plazaBicycle.lastRideMeters, prompt: plazaBicycle.prompt()?.kind ?? null,
    taken: multiplayer?.snapshot?.cycling?.taken ?? [], parked: plazaSalon?.userData.rack?.parked() ?? null,
    async goNear(slotId) {
      const slot = plazaSalonRack(world).find(item => item.id === slotId);
      if (!slot) return { ok: false };
      const result = await goToPlace({ kind: 'landmark', name: 'Bike rack', position: slot.approach });
      return { ok: Boolean(result?.ok) };
    } } : null;
```

(`plazaSalonRack` must be imported in main.js from `./plaza-salon-plan.js`; `goToPlace` is the same helper `__riverSeatAndWater.goNear` uses.)

- [ ] **Step 5: The walking console**

In `preview/src/walking-ui.js`:
- The title: `transport ? (transport.pose.kind === 'bicycle' ? 'Cycling' : 'Riding with Jev')`.
- The place line while riding: replace the `transport ?` branch text with
  `transport ? (transport.pose.kind === 'bicycle' ? `${(transport.pose.distance / 1609.344).toFixed(2)} mi cycled this ride · W to pedal · Shift to sprint · G to step off` : 'W/S to ride or reverse · A/D or arrows to steer · G to step out')`.
- The contextual interact button already takes `getInteraction()`; in `main.js`, pass a combined getter so the rack prompt appears when Z has nothing to offer: `getInteraction: () => seatAndWater?.interaction() ?? plazaBicycle?.prompt() ?? null`. The rack prompt's `run` is called by the button like a seat action; its shortcut key shown is G, so in `walking-ui.js` where `setAction(interactButton, interaction.label, 'Z')` is, use `interaction.kind === 'take-bike' || interaction.kind === 'step-off' ? 'G' : 'Z'`.
- Add `G to take a bike at the rack` to the help text after `Z to sit or water`.

In `preview/src/player-avatar.js` the G handler already returns early on `event.defaultPrevented`; the bicycle listener is registered first (main.js creates `plazaBicycle` before `playerAvatar`? check the order; if `playerAvatar` is created earlier, move the `plazaBicycle` creation above it).

- [ ] **Step 6: Run the unit tests and the build**

Run: `node --test preview/tests/plaza-bicycle.test.js && pnpm test && pnpm run build`
Expected: all pass; the build completes.

- [ ] **Step 7: Commit**

```bash
git add preview/src/plaza-bicycle.js preview/src/main.js preview/src/walking-ui.js preview/src/player-avatar.js preview/tests/plaza-bicycle.test.js
git commit -S -m "$(cat <<'EOF'
Take a bike from the plaza rack, ride it, and step off

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 10: The `cycling-rack` browser journey

**Files:**
- Create: `preview/e2e/cycling-rack.js`
- Modify: `preview/e2e/experience-runner.js:9`

- [ ] **Step 1: Write the journey**

Create `preview/e2e/cycling-rack.js`:

```js
// The plaza bike rack: walk up, take a bike with G, pedal south across the
// plaza, sprint with Shift, step off with G. The town hands out the slot, a
// second account sees the parked bike vanish and return and the rider on a
// bike, and the ride's metres reach the fixture's cycling store.
async page => {
  const origin = 'http://127.0.0.1:5173', checks = [];
  const check = (ok, message) => { if (!ok) throw new Error(message); checks.push(message); };
  const cycling = p => p.evaluate(() => { const { goNear, ...state } = window.__riverCycling(); return state; });
  const ready = async p => { await p.goto(origin + '/?motion-debug=1', { waitUntil: 'commit' }); await p.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true' && window.__riverCycling?.() && window.__riverMultiplayer?.().connected, null, { timeout: 90000 }); };
  await page.setViewportSize({ width: 1440, height: 900 });
  await ready(page);
  check((await cycling(page)).parked.every(Boolean), 'Four bikes are parked at the rack');
  check((await page.evaluate(id => window.__riverCycling().goNear(id), 'plaza-salon-rack:1')).ok, 'Arrived at the rack');
  await page.waitForFunction(() => window.__riverCycling().prompt === 'take-bike', null, { timeout: 15000 });
  check(/Take a bike/.test(await page.locator('#walking-interact').textContent()), 'The console offers Take a bike (G)');
  const other = await page.context().browser().newContext({ viewport: { width: 1440, height: 900 } });
  try {
    await other.addCookies([{ name: 'fixture_session', value: 'bob', url: origin }]);
    const bob = await other.newPage();
    await ready(bob);
    await page.locator('#canvas-host').focus();
    await page.keyboard.press('KeyG');
    await page.waitForFunction(() => window.__riverCycling().riding === true, null, { timeout: 15000 });
    const slot = (await cycling(page)).slotId;
    check(slot !== null && (await cycling(page)).taken.includes(slot), `The town handed out ${slot}`);
    await bob.waitForFunction(id => window.__riverCycling().taken.includes(id) && window.__riverCycling().parked.filter(Boolean).length === 3, slot, { timeout: 10000 });
    check(true, 'Bob sees three parked bikes while the slot is out');
    await bob.waitForFunction(() => window.__riverMultiplayer().remotes?.some(remote => remote.vehicle === 'bicycle'), null, { timeout: 10000 });
    check(true, 'Bob sees a rider on a bicycle');
    check(/Cycling/.test(await page.locator('.walking-title strong').textContent()), 'The console title reads Cycling');
    await page.keyboard.down('KeyW');
    await page.waitForFunction(() => window.__riverCycling().rideMeters > 6, null, { timeout: 15000 });
    const cruise = await page.evaluate(() => Number(document.querySelector('.walking-hud')?.dataset.rideSpeed ?? 0));
    await page.keyboard.down('ShiftLeft');
    await page.waitForFunction(() => window.__riverCycling().rideMeters > 20, null, { timeout: 15000 });
    await page.keyboard.up('ShiftLeft'); await page.keyboard.up('KeyW');
    const ridden = (await cycling(page)).rideMeters;
    check(ridden > 20, `Pedalled ${ridden.toFixed(1)} m across the plaza`);
    await page.screenshot({ path: 'output/playwright/cycling-rack-ride.png' });
    await page.keyboard.press('KeyG');
    await page.waitForFunction(() => window.__riverCycling().riding === false && window.__riverCycling().lastRideMeters > 20, null, { timeout: 15000 });
    await page.waitForFunction(() => window.__riverCycling().taken.length === 0 && window.__riverCycling().parked.every(Boolean), null, { timeout: 10000 });
    check(true, 'Stepping off returns the bike to the rack');
    await bob.waitForFunction(() => window.__riverCycling().parked.every(Boolean), null, { timeout: 10000 });
    check(true, 'Bob sees all four bikes parked again');
    const self = await page.evaluate(() => window.__riverMultiplayer().snapshot.players.find(p => p.id === window.__riverMultiplayer().selfId));
    check(self.vehicle === null, 'The town shows the rider on foot');
    void cruise;
  } finally { await other.close(); }
  await page.screenshot({ path: 'output/playwright/cycling-rack.png' });
  return { checks };
};
```

- [ ] **Step 2: Register it**

In `preview/e2e/experience-runner.js:9`, add `'cycling-rack'` after `'plaza-dominoes'` in the `suite` array.

- [ ] **Step 3: Run it**

Run: `pnpm run test:experience cycling-rack`
Expected: the journey passes with its checks listed in the console and `data/reports/experience.json` (or wherever the runner writes; read the console path) records it. Known pitfalls: if `goNear` cannot reach the approach because the rack bar blocks the path, move the approach distance in `plazaSalonRack` from 0.9 to 1.1; if `remotes[].vehicle` is not reported, add `vehicle: entry.road?.spec.kind ?? null` to `remote-players.js` `stats()`.

- [ ] **Step 4: Commit**

```bash
git add preview/e2e/cycling-rack.js preview/e2e/experience-runner.js preview/src/remote-players.js
git commit -S -m "$(cat <<'EOF'
Browser journey: take, ride and return a plaza bike

Coven-Harness: Claude Code / claude-fable-5-1
EOF
)"
```

---

### Task 11: Docs, ledger, full verification, PR

**Files:**
- Modify: `docs/multiplayer.md`, `docs/superpowers/plans/2026-10-13-cycling-rack.md` (this ledger: results section below), `docs/project-management/tasks.json` (the branch's own entry)

- [ ] **Step 1: Document the commands**

In `docs/multiplayer.md`, after the "Vehicle exits use the server-checked travel command" paragraph, add:

```markdown
The plaza bike rack is arbitrated like seating: `cycle {rackId, slot}` claims a
free slot within seat reach and mounts the rider on a `bicycle`; `uncycle` hands
it back, as do a pose without the bike, a travel, sitting down and leaving. A
`bicycle` pose is accepted only from a slot holder, under an 8.05 m/s (18 mph)
budget. Each accepted bicycle pose adds its ground distance to the rider's
metres, which the transport drains into the cross-world `cycling-miles` account
store (dev town: every 30 s and on `uncycle`; hosted room: every tick). The
snapshot carries `cycling: {taken: [slotId]}` so clients hide bikes that are out.
```

- [ ] **Step 2: Full verification**

```bash
pnpm run verify
redis-server --port 6390 --save "" --daemonize yes
REDIS_URL=redis://127.0.0.1:6390 pnpm run test:server
redis-cli -p 6390 shutdown nosave
pnpm run test:experience cycling-rack plaza-salon plaza-dominoes carriage
```

Expected: `core: passed`; server suite with 0 unexpected skips for the cycling tests; the four journeys pass. Read `.runtime/agent/core.json` and record its counts.

- [ ] **Step 3: Ledger and register**

Append a `## Results` section to this file with: the commands above, their counts, the final rack coordinates from Task 3, screenshots' paths, and any deviations. Commit the branch's register entry (`cycling-rack`, status active, `pr` filled after the PR opens) with `pnpm run plans:index` regenerated.

- [ ] **Step 4: Push and open the PR**

```bash
UNSIGNED=$(git log origin/main..HEAD --pretty='%H %G?' | awk '$2 != "G" && $2 != "E" {print}'); [ -z "$UNSIGNED" ] && git push -u origin feat/cycling-rack-20261013
gh pr create --title "Cycling rack: take a plaza bike, ride to 18 mph, count the metres" --body-file - <<'EOF'
## Summary
- `bicycle` vehicle kind (cruise 5 m/s, Shift sprint to the 8.05 m/s / 18 mph cap) on the existing mount system
- four-slot rack on the Dior–Toulouse plaza: plan data, procedural prop, parked bikes hidden while out
- server: `cycle`/`uncycle`, bicycle poses only from slot holders, accepted metres counted and flushed to the new cross-world `cycling-miles` store (Memory + Redis)
- journey `cycling-rack`; leaderboard route and sheet follow in PR 2

Spec: docs/superpowers/specs/2026-10-13-cycling-rack-design.md · Ledger: docs/superpowers/plans/2026-10-13-cycling-rack.md

## Verification
(paste the counts from the ledger's Results section)
EOF
```

Then queue it: `pnpm run land <pr> --owner "<session>"`. No `Co-Authored-By` and no "Generated with" footer anywhere.

---

## Self-review against the spec

- §1 world: Task 1 (spec), 3 (plan, footprints, slots), 7 (mesh), 8 (prop, hidden bikes), 9 (G to take, step out via travel, dismount anywhere). Eligibility rule: Task 4 `pose()`.
- §1 variable speed: Tasks 1–2 (`cruiseSpeed`, `sprint`), server cap unchanged at `maxSpeed` (Task 4 test "obeys the 18 mph budget").
- §2 room state and snapshot `cycling.taken`: Task 4. Commands and refusals: Task 4 (`slot_taken`, `rack_out_of_reach`, `bike_required`, `seated`, plus `invalid_slot`, `already_cycling`, `not_cycling`, `rack_blocked`). Counting: Task 4. Store: Task 5. Flushing: Task 6 (dev 30 s + `uncycle` + leave; hosted every tick, which is stricter than 30 s). Route `GET /api/cycling/leaderboard`: **PR 2**, not this plan.
- §3 client UI: console prompt and ride line Task 9; dock sheet and "You've cycled N mi": **PR 2**. Remote riders: unchanged code path (Task 1's saddle-as-passenger-seat) plus the `stats()` field in Task 10.
- §3 dev: Memory store wired in `town.js` and the browser fixture (Task 6).
- §4 tests: server (Tasks 4, 5, 6), client (Tasks 1, 2, 3, 7, 8, 9), journey (Task 10). The `cycling-leaderboard` journey is PR 2.
- Placeholder scan: none. Type consistency: `drainRides()` → `[{userId,name,meters}]` is consumed with those names in Tasks 6; `cyclingMiles.add(userId,meters,name)` matches Task 5; `plazaSalonRack` slot shape `{id,rackId,slot,x,north,heading,approach}` is used identically in Tasks 4, 8, 9, 10; `userData.rack.setTaken/parked` match between Tasks 8 and 9/10.

## Results (2026-10-13, branch feat/cycling-rack-20261013)

Executed task by task with a fresh implementer per task and two reviews each
(spec compliance, then code quality); fixes were folded in as follow-up commits.

| Task | Commits | Evidence |
| --- | --- | --- |
| 1–2 vehicle spec, sprint speed | d67f32a, d99db4f | `vehicles.test.js` 11/11, `carriage-motion` + `carriage` + `carriage-driver` 19/19 |
| 3 rack plan data | 80e7f99 | `plaza-salon.test.js` 8/8; rack bar moved to north -1294.0 (a trunk at (-2781,-1293) fails clearance at -1293.4…-1293.8 for every x) |
| 4 server slots and metres | 9b7b409, 001a693, 4b37fbd | `cycling.test.js` 8 tests; restore refuses a held slot on a non-bicycle, an airborne bicycle, metres > 1e6 and duplicate slots (`invalid_cycling_slot`); rides west in tests because the curved bench sits 8 m south of the rack |
| 5 cycling-miles store | f99d4a8, 54b046d | `cycling-miles.test.js` 6/6 with a scratch Redis on 6391 (4 + 2 skips without `REDIS_URL`); `top()` drops rows with a missing rider record; metres bounded at 1e6 per add |
| 6 flush wiring | 38dd396, d864fb8 | `cycling-flush.test.js` 2/2 over a real WebSocket, `ride-flush.test.js` 4/4; hosted room drains after `world.step`, merges and sends after a successful COMMIT; `pnpm run test:server` 438 pass / 0 fail / 136 Redis-gated skips; Redis-backed `redis-room` + `world-gateway` 20/20 |
| 7 bicycle mesh | 409c984, 64b5ccf | `vehicles.test.js` bicycle 1.77 × 1.04 × 0.53 m, spoked wheels, no spinners; `pnpm run build` ok |
| 8 rack prop | 05093df | `plaza-rack.test.js` 1/1, parked bike faces +Z (south) verified; `setback`/`approach` named on the plan |
| 9 client controller | 50c329c | `plaza-bicycle.test.js` 3/3; `pnpm test` 2759 pass / 1 pre-existing skip; `setback` raised to 1.1 m because the walking model pads the bar's discs |
| 9 fixes | dce5cc6, (final commit) | hand-over grace on the server (`CYCLE_GRACE_MS` 1.5 s, test added); client applies the server pose before mounting; a correction or a refused step-off never leaves a ghost bike (`plaza-bicycle.test.js` 7/7) |
| 10 journey | 684723c, (final commit) | `pnpm run test:experience cycling-rack` passed on the final code (two fixture accounts; the ride sets off south and turns west because the curved bench sits straight ahead of the rack); `output/playwright/cycling-rack-ride.png`, `cycling-rack.png` |
| 11 docs, verify, PR | (final commit) | `docs/multiplayer.md` cycling paragraph; `pnpm run verify` core passed (receipt `.runtime/agent/core.json`, python 141 passed); `pnpm test` 2760 tests / 1 pre-existing skip; Redis-backed run on a scratch Redis (port 6391): `cycling-miles`, `cycling-flush`, `ride-flush`, `redis-room`, `world-gateway`, `cycling` 40 pass / 0 fail / 0 skipped |

Decisions recorded during execution:
- The bicycle's passenger seat is the saddle (same point as the driver seat), so every seat consumer works unchanged; `seats: 1` is declared metadata.
- A bare `uncycle` steps the rider back to the slot's approach when it is free; the client's normal exit travels to a ground spot first.
- Banked metres are process-local and never checkpointed: both transports drain right after `world.step`, before `checkpoint()`, so a restore cannot pay metres twice; a failed commit discards the tick-local drain and the previous checkpoint still carries the metres.
- Client occupancy samples the frame between the axles (`FRAME_SHARE` 0.5), not the mudguard-to-mudguard length.

Gaps: no Redis-backed regression drives a ride through `createRedisRoom`'s tick (the room harness has no rack); the helper's unit tests and the unchanged room suite cover that path. Hosted acceptance and the leaderboard sheet are PR 2.

## PR 2: cycling-leaderboard (2026-10-13, branch feat/cycling-leaderboard-20261013, task `cycling-leaderboard`)

Implemented inline after PR 1 (the account's session limit made subagents unreliable that morning).

| Piece | Files | Evidence |
| --- | --- | --- |
| route | `server/cycling-api.js` (`createCyclingLeaderboard`: top 20 cached 10 s per instance, live `me`, miles to one decimal, no ids), mounted as `GET /api/cycling/leaderboard` in `app.js` (session) and `distributed-app.js` (session + 60/min limiter) | `cycling-api.test.js` 3/3; `cycling-flush.test.js` route test over HTTP (200 with the rider ranked, 401 without a session) |
| sheet | `preview/src/cycling-leaderboard.js` + `.css`: a `<details>` tile in the Play dock ("Cycling" activity), keyed rows, your row highlighted, footer when you are outside the top, fetch on open and every 30 s while open, "Leaderboard unavailable" keeps the last list | `cycling-leaderboard.test.js` (formatting); journey below |
| rack prompt | `plaza-bicycle.js` prompt label "Take a bike · N mi so far" from the board's `mine()` | journey below |
| dev server | `vite.config.js` proxies `/api/cycling` to the town | journey below |
| journey | `preview/e2e/cycling-leaderboard.js`: Bob sees the empty state, the rider rides and steps off, Bob's board ranks the rider (polling through the 10 s cache), the rider's own row is highlighted and the rack prompt carries lifetime miles | passed at 7256bd6 and again on the merged head f99c3e5, together with `cycling-rack` |
| gate | `pnpm run verify` core on f99c3e5 (clean tree): passed, python 141 passed; `pnpm test` 2764 pass / 1 pre-existing skip and `pnpm run test:server` 443 pass / 0 fail / 136 Redis-gated skips at 27ebc7d | receipt `.runtime/agent/core.json` |

Steering note: after the backgammon table landed on main, a fixed right turn from the rack ended at the table's latitude (north -1297.4) and a westward ride stopped at 9 m. Both journeys now hold heading bands (west-northwest, yaw -0.45…-0.35, until 12 m, then due west), a line a node simulation of `stepCarriage` + `bicycleCanOccupy` found clear from every slot.
