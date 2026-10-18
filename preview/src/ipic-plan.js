// Photo-guided estimates, metres. See docs/ipic-interior.md for evidence limits.
// A single support surface per XY preserves the existing authoritative movement
// contract. Floors, railings, fixtures and export all consume this same plan.
export const IPIC_INTERIOR = 'ipic-photo-v1';
export const isIpicStore = store => store.name === 'IPIC Theaters' && store.building_id === 'osm-way-625330798';
export const IPIC_FLIGHTS = Object.freeze([{ start: 6, end: 12, base: 0 }, { start: 14, end: 20, base: 3 }]);
export const IPIC_ESCALATOR = Object.freeze({ lanes: [-1.4, 1.4], railOffset: .91, railWidth: .11, treadWidth: 1.5 });
// The upper-lounge planter at a = -5.65 was moved 5 cm west (Val, 2026-10-15) to widen the passage to the
// auditorium, which then ran between it and the sofa. The sofa now backs onto the west guardrail (2026-10-18).
export const IPIC_PLANTERS = Object.freeze([[-4.8, 0, 1.6, 1.8], [5.7, 0, 1.6, 1.8], [-5.65, 6, 25.4, 1.5], [1, 6, 25.4, 1.5]]);
// The lounge sofa backs onto the west guardrail over the escalators and faces into the lounge, as in
// IMG_9758 (photo review P11; Val, 2026-10-18): its seat line and the centres of its two arms.
export const IPIC_SOFA_D = 20.6;
export const IPIC_SOFA_ARMS = Object.freeze([-5.35, -2.85]);
// The Tuck Room's island bar, as in IMG_9756 (photo review P13; Val, 2026-10-18): its counter top's
// extent, which its collider follows. The back bar starts at a = IPIC_BACK_BAR, leaving an aisle behind.
export const IPIC_BAR = Object.freeze({ a: 4.6, d: 23, w: 1.6, l: 3.9 });
export const IPIC_BACK_BAR = 6.28;
// The auditorium screen, independent of what plays on it (#364/#365): centre
// across the room (a) and above the auditorium floor (y), plane depth (d) and
// size in metres, about 3:1. A film fits inside it; see ipic-screening.js.
export const IPIC_SCREEN = Object.freeze({ a: .3, y: 2.5, d: 33.79, width: 9.8, height: 3.25 });
// The Tuck Room dartboard (Val, 2026-10-15): a freestanding cabinet in front of the
// cinema wall, below the floral artwork. The board's face is at d, its centre at a and
// 1.73 m above the floor; the throwing line is 2.37 m out. The throwing area behind the
// line clears the east tub chair and holds two players; standing in it plays.
export const IPIC_DARTS = Object.freeze({ id: 'ipic-tuck-room', a: .1, face: 25.6, bull: 1.73, line: 23.23,
  area: Object.freeze({ a: Object.freeze([-.2, 1.1]), d: Object.freeze([22.2, 23.23]) }) });
export const atIpicDartsLine = ([a, d]) => a >= IPIC_DARTS.area.a[0] && a <= IPIC_DARTS.area.a[1] && d >= IPIC_DARTS.area.d[0] && d <= IPIC_DARTS.area.d[1];
export const IPIC_CAMERAS = Object.freeze([
  // From in front of the desk's west end, as IMG_9738 was taken (review P7).
  { name: 'reception', eye: [1.4, 1.55, .6], target: [3.6, 1.4, 3.6], photo: 'IMG_9738.jpg' },
  // From the top of the first run's east lane into the walled bay, as a rider sees the mural (Val kept it
  // large in the bay, 2026-10-18; the in-line runs leave no wall to face it head-on).
  { name: 'mural', eye: [1.4, 4.6, 11.8], target: [4.7, 4.6, 13.7], photo: 'IMG_9771.jpg' },
  { name: 'lounge', eye: [-4.1, 7.75, 25.7], target: [-4.1, 6.75, 20.4], photo: 'IMG_9758.jpg' },
  { name: 'bar', eye: [-.8, 7.65, 24.8], target: [4.5, 7.7, 22.8], photo: 'IMG_9756.jpg' },
  { name: 'auditorium', eye: [-4.7, 7.65, 27.3], target: [.5, 8.2, 33.7], photo: 'IMG_9767.jpg' },
]);

export function ipicFloor(d) {
  if (d <= 6) return 0;
  if (d < 12) return (d - 6) / 2;
  if (d <= 14) return 3;
  if (d < 20) return 3 + (d - 14) / 2;
  return 6;
}

export function configureIpicRoom(room) {
  room.interior = IPIC_INTERIOR;
  room.height = 10.4;
  room.floorAt = (east, north) => room.floor + ipicFloor(room.toLocal(east, north)[1]);
  room.fixtures = [];
  room.obstacles = [];
  const block = (kind, a, d, w, l, y, h) => {
    const item = { kind, a, d, w, l, y, h };
    room.fixtures.push(item);
    room.obstacles.push({ a0: a - w / 2, a1: a + w / 2, d0: d - l / 2, d1: d + l / 2 });
  };
  block('ipic-reception', 3.4, 3.5, 3.6, .85, 0, 1.08);
  // The fluted backing behind the desk (ipic-interior.js, IMG_9738) is a wall: bodies stop short of it
  // instead of standing in the flutes. It starts east of the right escalator lane's rails.
  block('ipic-reception-backing', 4.125, 5.65, 3.35, .12, 0, 3.6);
  for (const flight of IPIC_FLIGHTS) {
    const d = (flight.start + flight.end) / 2, length = flight.end - flight.start;
    block('ipic-centre-rail', 0, d, .42, length, flight.base, 4.1);
    for (const a of IPIC_ESCALATOR.lanes) for (const side of [-1, 1]) {
      block('ipic-glass-rail', a + side * IPIC_ESCALATOR.railOffset, d, IPIC_ESCALATOR.railWidth, length, flight.base, 4.1);
    }
    block('ipic-side-wall', (room.aMin - 2.65) / 2, d, -2.65 - room.aMin, length, flight.base, 6.2);
    block('ipic-side-wall', (room.aMax + 2.65) / 2, d, room.aMax - 2.65, length, flight.base, 6.2);
  }
  block('ipic-mural-wall', 4.7, 13.72, 3.4, .15, 3, 3.2);
  block('ipic-bar', IPIC_BAR.a, IPIC_BAR.d, IPIC_BAR.w, IPIC_BAR.l, 6, 1.1);
  // Solid parts that were drawn without collision (#364): the Tuck Room back
  // shelving and wall, the IPIC Express counter, the decorative lift front and
  // the auditorium's aisle handrail. Each sits off every public route.
  block('ipic-bar-shelves', (IPIC_BACK_BAR + room.aMax) / 2, 23, room.aMax - IPIC_BACK_BAR, 4.8, 6, 3.3);
  block('ipic-express-counter', 5.4, 25.62, 1.5, .45, 6, 1.1);
  block('ipic-lift-front', 5.3, 5.85, 1.85, .2, 0, 2.8);
  block('ipic-aisle-rail', -5.55, 30, .05, 6.05, 6, .92);
  block('ipic-coffee-table', -4.1, 22.1, 1.5, .9, 6, .4);
  // The dart cabinet, its board and the darts in it.
  block('ipic-dart-cabinet', IPIC_DARTS.a, 25.71, .95, .32, 6, 2.05);
  for (const a of [-4.75, -3.45]) block('ipic-tub-chair', a, 23.2, .82, .82, 6, 1.02);
  for (const d of [21.5, 22.7, 23.9]) block('ipic-bar-stool', 3.4, d, .6, .6, 6, 1.4);
  // Auditorium doorway at a=-4.7; partitions agree with rendered geometry.
  block('ipic-cinema-wall', (room.aMin - 5.6) / 2, 26, -5.6 - room.aMin, .18, 6, 4.4);
  block('ipic-cinema-wall', (-3.8 + room.aMax) / 2, 26, room.aMax + 3.8, .18, 6, 4.4);
  // The sofa's back, arms and coffee table box its front in for the server body, and its arms meet the
  // wall and the escalator head, so each place names where its sitter steps out and is approached from:
  // the open floor beside the table at that place's front corner.
  room.ipicSeats = [
    ...[0, 1].map(slot => { const at = slot ? [-2.6, 21.6] : [-5.6, 21.6]; return { key: 'lounge-sofa', slot, a: -4.525 + slot * .85, d: IPIC_SOFA_D, yaw: 0, height: .49, kind: 'seat', stand: at, approach: at }; }),
    // A recliner is boxed in by its back, arms, base and footrest, so its sitter stands into the aisle in
    // front of the footrest, which is also where a visitor (or a townsperson) approaches it from. At
    // d + 1.4 the spot is 0.45 m from the footrest and from the back row's seated bodies.
    ...[28, 31].flatMap((d, row) => [-2.6, -.6, 1.4, 3.4].map((a, col) => ({ key: `recliner-${row}-${col}`, slot: 0, a, d, yaw: 0, height: .53, kind: 'armchair', stand: [a, d + 1.4], approach: [a, d + 1.4] }))),
  ];
  // Collision covers the backs and arms, and each recliner's base ends and raised footrest as drawn by
  // recliner() in ipic-interior.js (Val, 2026-10-15). Cushion centres stay more than a body radius
  // (0.35 m) from every box, so the server sit/stand protocol needs no bypass or client authority.
  for (const seat of room.ipicSeats) {
    const back = seat.d - (seat.key === 'lounge-sofa' ? .45 : .48);
    block('ipic-seat-back', seat.a, back, .98, .18, 6, 1.1);
    if (seat.key.startsWith('recliner')) {
      for (const side of [-1, 1]) block('ipic-seat-arm', seat.a + side * .54, seat.d, .22, 1.05, 6, .905);
      for (const end of [-1, 1]) block('ipic-recliner-base', seat.a, seat.d + end * .6125, 1.15, .175, 6, .34);
      block('ipic-recliner-footrest', seat.a, seat.d + .72, .82, .468, 6, .49);
    }
  }
  for (const a of IPIC_SOFA_ARMS) block('ipic-seat-arm', a, IPIC_SOFA_D, .19, .95, 6, 1);
  for (const [a, y, d] of IPIC_PLANTERS) block('ipic-planter', a, d, .48, .48, y, .56);
  room.people = [
    { role: 'staff', pose: 'stand', a: 3.4, d: 4.6, facing: [0, -1] },
    { role: 'staff', pose: 'stand', a: 1.4, d: 4.8, facing: [0, -1] },
    { role: 'guest', pose: 'stand', a: -3.5, d: 2.7, facing: [1, 0], seed: room.index * 7 },
    { role: 'guest', pose: 'stand', a: -4.7, d: 4.5, facing: [0, -1], seed: room.index * 7 + 1 },
    { role: 'guest', pose: 'stand', a: .4, d: 4.9, facing: [1, 0], seed: room.index * 7 + 2 },
  ];
  room.lights = [1.5, 4.8, 12.8, 21, 24, 29, 32].flatMap(d => [-3, 3].map(a => ({ a, d, y: ipicFloor(d) + 3.2, accent: false })));
  room.summary = { label: 'IPIC · reception, lounge & cinema', staff: 2, guests: 3, mannequins: 0,
    highlights: ['two escalator runs', 'mural landing', 'Tuck Room bar', 'recliner auditorium'] };
  return room;
}

export function ipicSeatSites(rooms) {
  return rooms.filter(room => room.interior === IPIC_INTERIOR).flatMap(room => room.ipicSeats.map(seat => {
    const [x, north] = room.toWorld(seat.a, seat.d);
    const yaw = Math.atan2(room.inward[0], -room.inward[1]) + seat.yaw;
    const buildId = `bench:ipic-${seat.key}`;
    // A recliner's back rises above its sitter's eye, so a camera behind it sees only leather:
    // its sitter watches from the seated eye (0.65 m above the cushion, as walking-ui places it),
    // pitched at the screen centre.
    const eyePitch = seat.key.startsWith('recliner') ? Math.atan2(IPIC_SCREEN.y - seat.height - .65, IPIC_SCREEN.d - seat.d) : null;
    return { id: `${buildId}:${seat.slot}`, buildId, slot: seat.slot, kind: seat.kind, storeId: room.storeId,
      title: seat.key === 'lounge-sofa' ? 'IPIC lounge sofa' : 'IPIC theater recliner',
      x, north, heading: yaw, height: seat.height, approach: seat.approach ? room.toWorld(...seat.approach) : [x + Math.sin(yaw) * .9, north - Math.cos(yaw) * .9],
      ...(seat.stand ? { standAt: [room.toWorld(...seat.stand)] } : {}), ...(eyePitch === null ? {} : { eyePitch }) };
  }));
}
