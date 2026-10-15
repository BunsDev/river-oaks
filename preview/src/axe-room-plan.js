// The unbranded axe-and-darts room (Val, 2026-10-15): a fictional game room, not a
// mapped tenant, with two caged axe lanes and a dartboard. Room frame as for store
// rooms: a across the frontage from the door's centre, d inward from the facade,
// metres. Pure JS shared by browser and server, like ipic-plan.js.
export const AXE_ROOM_INTERIOR = 'axe-darts-v1';
export const AXE_ROOM = Object.freeze({ id: 'axe-and-darts', name: 'Axe & Darts', width: 11, depth: 10, height: 4.2 });
// Lanes run to targets on the back wall. Each target's bull is 1.52 m up; the throwing
// line is 3.66 m (12 ft) out; the throwing box behind it holds one thrower at a time
// and a waiting partner. Cage fences run from `cage` to the back wall.
export const AXE_LANES = Object.freeze([
  Object.freeze({ id: 'axe-lane-1', a: 2.55, width: 1.9 }),
  Object.freeze({ id: 'axe-lane-2', a: 4.55, width: 1.9 }),
].map(lane => Object.freeze({ ...lane, target: 9.7, line: 9.7 - 3.66, bull: 1.52, cage: 4.4, box: Object.freeze({ a: [lane.a - .5, lane.a + .5], d: [4.7, 9.7 - 3.66] }) })));
// The room's dartboard, on the back wall's left half, in the Tuck Room's schema
// (ipic-plan.js IPIC_DARTS): face at d, centre a, 1.73 m up, line 2.37 m out.
export const AXE_ROOM_DARTS = Object.freeze({ id: 'axe-and-darts-board', a: -2.6, face: 9.62, bull: 1.73, line: 9.62 - 2.37,
  area: Object.freeze({ a: Object.freeze([-3.3, -1.9]), d: Object.freeze([6.2, 9.62 - 2.37]) }) });

export const atAxeLane = ([a, d]) => AXE_LANES.find(lane => a >= lane.box.a[0] && a <= lane.box.a[1] && d >= lane.box.d[0] && d <= lane.box.d[1])?.id ?? null;
export const atAxeRoomDarts = ([a, d]) => a >= AXE_ROOM_DARTS.area.a[0] && a <= AXE_ROOM_DARTS.area.a[1] && d >= AXE_ROOM_DARTS.area.d[0] && d <= AXE_ROOM_DARTS.area.d[1];

// Furnishes a planned room (store-rooms.js shape) with the cages, targets, dartboard,
// benches and counter, as collision boxes the server walks against.
export function configureAxeRoom(room) {
  room.interior = AXE_ROOM_INTERIOR;
  room.height = AXE_ROOM.height;
  room.fixtures = []; room.obstacles = [];
  const block = (kind, a, d, w, l, y, h) => {
    room.fixtures.push({ kind, a, d, w, l, y, h });
    room.obstacles.push({ a0: a - w / 2, a1: a + w / 2, d0: d - l / 2, d1: d + l / 2 });
  };
  // Chain-link cage walls between and beside the lanes, open at the front.
  const fences = [AXE_LANES[0].a - AXE_LANES[0].width / 2, (AXE_LANES[0].a + AXE_LANES[1].a) / 2, AXE_LANES[1].a + AXE_LANES[1].width / 2];
  for (const a of fences) block('axe-cage', Math.min(a, room.aMax - .04), (AXE_LANES[0].cage + room.depth) / 2, .06, room.depth - AXE_LANES[0].cage, 0, 2.6);
  // Target boards on the back wall, and the dartboard cabinet beside them.
  for (const lane of AXE_LANES) block('axe-target', lane.a, lane.target + .1, 1.2, .2, 0, 2.4);
  block('axe-dart-cabinet', AXE_ROOM_DARTS.a, AXE_ROOM_DARTS.face + .15, .95, .3, 0, 2.05);
  // A counter with the axe rack inside the door on the left, and benches along the left wall.
  block('axe-counter', -3.9, 2.2, 2.3, .8, 0, 1.1);
  block('axe-rack', room.aMin + .17, 2.2, .34, 2.05, 0, 2.1);
  for (const d of [4.6, 6.6]) block('axe-bench', room.aMin + .35, d, .5, 1.6, 0, .46);
  // No staff: a room's people become shared residents, and a new resident changes the
  // resident count every durable checkpoint is restored against.
  room.people = [];
  room.lights = [2, 4.5, 7, 9].flatMap(d => [-3, 0, 3].map(a => ({ a, d, y: room.height - .05, accent: d > 8 })));
  room.summary = { label: 'Axe & Darts · game room', staff: 0, guests: 0, mannequins: 0, highlights: ['two caged axe lanes', 'dartboard', 'house thrower'] };
  return room;
}
