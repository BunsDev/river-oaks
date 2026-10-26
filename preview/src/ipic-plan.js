// Photo-guided estimates, metres. See docs/ipic-interior.md for evidence limits.
// A single support surface per XY preserves the existing authoritative movement
// contract. Floors, railings, fixtures and export all consume this same plan.
export const IPIC_INTERIOR = 'ipic-photo-v1';
export const isIpicStore = store => store.name === 'IPIC Theaters' && store.building_id === 'osm-way-625330798';
export const IPIC_FLIGHTS = Object.freeze([{ start: 6, end: 12, base: 0 }, { start: 14, end: 20, base: 3 }]);
export const IPIC_ESCALATOR = Object.freeze({ lanes: [-1.4, 1.4], railOffset: .91, railWidth: .11, treadWidth: 1.5 });
// The stone walls either side of the escalator well, at a = ±IPIC_RUN_WALL (0.18 m thick).
export const IPIC_RUN_WALL = 2.72;
// Where the drawn ceilings are, over the street floor (ipic-interior.js; each slab is 0.18 m thick). The escalator
// well is one volume from reception to the lounge, closed at the lounge's ceiling (Val, 2026-10-26). Only the
// mural landing's side bays keep a lower ceiling.
export const IPIC_CEILINGS = Object.freeze({ reception: 3.9, landingBays: 6.7, upper: 10.3, auditorium: 10.4 });
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
// The auditorium (Val, 2026-10-19). The photographed house (IMG_9767) put its two rows 5.8 m and 2.8 m from a
// 12.1 m screen, 92° and 130° of view, where cinema guidance asks for 30-60°. IPIC already fills the
// building's depth, so the auditorium is a wing along the building behind the shops, facing its north end wall
// (a = IPIC_WING.aMin). The wing is a second part of the room (store-rooms.js addRoomParts). See
// docs/ipic-interior.md. It first ran 39 m, 25 m of it empty carpet past the doorway (Val, 2026-10-26: "tons of
// dead space"); it now ends 0.9 m past the doorway (a = -4.7), a cross aisle behind the back row.
export const IPIC_WING = Object.freeze({ aMin: -19.5, aMax: -2.9, d0: 26, d1: 34 });
// Viewing guidance: the horizontal angle 2·atan(W/2D) is at most 60° from the front row, about 40° from THX's ideal
// seat (THX asks 36° of its back row) and never below SMPTE EG-18's 30°; the image's top edge is at most 35° above the front row's
// eye; and no recliner in front hides any of the image, so each row's eye line to the image's bottom edge
// clears the headrest in front by the C-value. The seated eye is the cushion (0.53 m) plus 0.69 m, as the game
// seats it; a recliner's headrest is 1.545 m over its floor, 0.63 m behind its seat (ipic-interior.js).
export const IPIC_VIEWING = Object.freeze({ frontMax: 60, thxMin: 36, smpteMin: 30, verticalMax: 35, cValue: .12,
  seatedEye: .53 + .69, headrest: Object.freeze({ top: 1.545, behind: .63 }), screenBottom: 1.8 });
const SCREEN_WIDTH = 7.4, SCREEN_ASPECT = 2.39, SCREEN_PLANE = IPIC_WING.aMin + .15;
// Eye distances from the screen, back row first, 3.0 m apart as in the photographed house. With the row in
// front seated (its worst measured look reaches 1.155 m behind the seat, IPIC_SEATED_REACH), the legroom keeps
// 0.89 m, room for the widest posed body (0.8 m). Four rows at that pitch would need a 9 m screen to stay
// within 30-60°, wider than the 8 m wing, so there are three: the back row at SMPTE's 30° or more, the middle
// row near THX's 40° and the front row under 60°.
const ROW_DISTANCES = [12.5, 9.5, 6.5];
// Stadium rake, solved front to back over the front row's floor: the image's bottom edge h (screenBottom) is the
// focal point, and each row's floor F puts its eye on or above the line from h over the headrest in front plus
// C: F(n+1) + eye = h + (F(n) + headrest + C - h)·D(n+1)/(D(n) + behind). Raising h to 1.8 m keeps the steps to
// about 0.4-0.5 m while the front row's look up to the top stays near 30°.
const { seatedEye, headrest, cValue, screenBottom } = IPIC_VIEWING;
const rake = [...ROW_DISTANCES].reverse().reduce((floors, D, i, front) => [...floors, i
  ? screenBottom + (floors[i - 1] + headrest.top + cValue - screenBottom) * D / (front[i - 1] + headrest.behind) - seatedEye
  : 0], []).reverse();
// Each row, back row first: where its seats are along the wing (a), its floor over the upper floor (the back
// row is level with the doorway, the rows in front step down), its eye distance and its angle of view.
export const IPIC_AUDITORIUM_ROWS = Object.freeze(ROW_DISTANCES.map((distance, row) => Object.freeze({
  a: +(SCREEN_PLANE + distance).toFixed(4), floor: +(rake[row] - rake[0]).toFixed(4), distance,
  angle: 2 * Math.atan(SCREEN_WIDTH / 2 / distance) * 180 / Math.PI })));
// Three recliners a row, centred on the screen, between aisles along both long walls.
export const IPIC_AUDITORIUM_SEAT_D = Object.freeze([28, 30, 32]);
// The screen, independent of what plays on it (#364/#365): its plane (a) on the north wall, its centre along
// that wall (d) and over the upper floor (y), its size (2.39:1 scope) and the way it faces, in (a, d). Its
// bottom edge is the rake's focal point. Films keep their aspect on it (ipic-screening.js fitVideoToScreen).
const SCREEN_HEIGHT = +(SCREEN_WIDTH / SCREEN_ASPECT).toFixed(4);
export const IPIC_SCREEN = Object.freeze({ a: SCREEN_PLANE, d: (IPIC_WING.d0 + IPIC_WING.d1) / 2,
  y: +(IPIC_AUDITORIUM_ROWS.at(-1).floor + screenBottom + SCREEN_HEIGHT / 2).toFixed(4),
  width: SCREEN_WIDTH, height: SCREEN_HEIGHT, facing: Object.freeze([1, 0]) });
// Risers, front to back: each row's platform ends just behind its seat backs, where the row behind begins.
// Across the seats the drop is closed (ipic-riser); in the aisles the support ramps over RISER_RAMP either side
// of the riser, drawn as treads, like the escalator flights.
export const RISER_RAMP = .45;
export const IPIC_AUDITORIUM_RISERS = Object.freeze(IPIC_AUDITORIUM_ROWS.slice(1)
  .map((row, k) => Object.freeze({ a: +(row.a + .6).toFixed(4), from: row.floor, to: IPIC_AUDITORIUM_ROWS[k].floor })).reverse());
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
  // From the foyer just behind the back row, down the wing to the screen (Val, 2026-10-19). The photograph
  // shows the house before it was turned along the building.
  { name: 'auditorium', eye: [-4.4, 7.75, 31.4], target: [IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d], photo: 'IMG_9767.jpg' },
]);

// The auditorium floor over the upper floor, by a: the front row's level up to its riser, then each row's in
// turn, ramping across each riser over RISER_RAMP either side so the support stays continuous.
function auditoriumFloor(a) {
  let floor = IPIC_AUDITORIUM_RISERS[0].from;
  for (const riser of IPIC_AUDITORIUM_RISERS) {
    if (a <= riser.a - RISER_RAMP) return floor;
    if (a < riser.a + RISER_RAMP) return floor + (riser.to - riser.from) * (a - riser.a + RISER_RAMP) / (2 * RISER_RAMP);
    floor = riser.to;
  }
  return floor;
}

// The single support height at (d, a) over the street floor. Only the auditorium wing depends on a; elsewhere
// a is ignored, and a = 0 there is the foyer behind the back row, level with the doorway.
export function ipicFloor(d, a = 0) {
  if (d <= 6) return 0;
  if (d < 12) return (d - 6) / 2;
  if (d <= 14) return 3;
  if (d < 20) return 3 + (d - 14) / 2;
  if (d < IPIC_WING.d0) return 6;
  return 6 + auditoriumFloor(a);
}

// The underside of the lowest ceiling drawn over (d, a), over the street floor: reception's coffers (as far as the
// far face of the well's header wall, so no camera stops inside it), the escalator well (and the landing's side
// bays), the lounge's and the Tuck Room's beams, and the auditorium. The walking camera stays under it
// (third-person.js). Hanging lamps and plants (the cocoons, the pothos strands) are not ceilings.
export function ipicCeiling(d, a = 0) {
  const slab = y => y - .09;
  if (d < 6.2) return 3.6;
  if (d < 20) return d > 11.82 && d < 14.18 && Math.abs(a) > IPIC_RUN_WALL ? slab(IPIC_CEILINGS.landingBays) : slab(IPIC_CEILINGS.upper);
  if (d < IPIC_WING.d0) return 9.6;
  return slab(IPIC_CEILINGS.auditorium);
}

// Which way a seat faces in the room frame (a, d): +d at yaw 0, -a at yaw PI/2, as ipicSeatSites turns it.
export const ipicSeatForward = seat => [-Math.sin(seat.yaw), Math.cos(seat.yaw)];

export function configureIpicRoom(room) {
  room.interior = IPIC_INTERIOR;
  room.height = 10.4;
  room.floorAt = (east, north) => { const [a, d] = room.toLocal(east, north); return room.floor + ipicFloor(d, a); };
  room.ceilingAt = (east, north) => { const [a, d] = room.toLocal(east, north); return room.floor + ipicCeiling(d, a); };
  // The auditorium wing beyond the 13 m room; store-rooms.js addRoomParts makes containment and lookup see it.
  room.parts = [{ ...IPIC_WING }];
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
  // shelving and wall, the IPIC Express counter and the decorative lift front.
  // Each sits off every public route.
  block('ipic-bar-shelves', (IPIC_BACK_BAR + room.aMax) / 2, 23, room.aMax - IPIC_BACK_BAR, 4.8, 6, 3.3);
  block('ipic-express-counter', 5.4, 25.62, 1.5, .45, 6, 1.1);
  block('ipic-lift-front', 5.3, 5.85, 1.85, .2, 0, 2.8);
  // The riser walls: across the seats each drop is closed, from the outer arm of one end recliner to the other,
  // just behind the seat backs of the row in front. The aisles along both walls stay open as ramps.
  const across = [IPIC_AUDITORIUM_SEAT_D[0] - .65, IPIC_AUDITORIUM_SEAT_D.at(-1) + .65];
  for (const riser of IPIC_AUDITORIUM_RISERS) {
    block('ipic-riser', riser.a, (across[0] + across[1]) / 2, .1, across[1] - across[0], 6 + riser.from, riser.to - riser.from + .1);
  }
  block('ipic-coffee-table', -4.1, 22.1, 1.5, .9, 6, .4);
  // The dart cabinet, its board and the darts in it.
  block('ipic-dart-cabinet', IPIC_DARTS.a, 25.71, .95, .32, 6, 2.05);
  for (const a of [-4.75, -3.45]) block('ipic-tub-chair', a, 23.2, .82, .82, 6, 1.02);
  for (const d of [21.5, 22.7, 23.9]) block('ipic-bar-stool', 3.4, d, .6, .6, 6, 1.4);
  // Auditorium doorway at a=-4.7; partitions agree with rendered geometry.
  block('ipic-cinema-wall', (room.aMin - 5.6) / 2, 26, -5.6 - room.aMin, .18, 6, 4.4);
  block('ipic-cinema-wall', (-3.8 + room.aMax) / 2, 26, room.aMax + 3.8, .18, 6, 4.4);
  // Behind the cinema wall, past the auditorium's east end wall, the room's own rectangle is back of house: walled
  // off and filled by its collider, from the end wall's inner face.
  const backOfHouse = IPIC_WING.aMax - .09;
  block('ipic-back-of-house', (backOfHouse + room.aMax) / 2, (26.09 + room.depth) / 2, room.aMax - backOfHouse, room.depth - 26.09, 6, 4.4);
  // The sofa's back, arms and coffee table box its front in for the server body, and its arms meet the
  // wall and the escalator head, so each place names where its sitter steps out and is approached from:
  // the open floor beside the table at that place's front corner.
  room.ipicSeats = [
    ...[0, 1].map(slot => { const at = slot ? [-2.6, 21.6] : [-5.6, 21.6]; return { key: 'lounge-sofa', slot, a: -4.525 + slot * .85, d: IPIC_SOFA_D, yaw: 0, height: .49, kind: 'seat', stand: at, approach: at }; }),
    // A recliner is boxed in by its back, arms, base and footrest, so its sitter stands into the legroom in
    // front of the footrest, which is also where a visitor (or a townsperson) approaches it from. Recliners
    // face the north screen (yaw PI/2, toward -a); 1.4 m in front of one is 0.45 m from its footrest and from
    // the seated body of the row in front, as in the photographed house.
    ...IPIC_AUDITORIUM_ROWS.flatMap((row, r) => IPIC_AUDITORIUM_SEAT_D.map((d, col) => ({ key: `recliner-${r}-${col}`, slot: 0, a: row.a, d,
      yaw: Math.PI / 2, height: .53, kind: 'armchair', stand: [row.a - 1.4, d], approach: [row.a - 1.4, d] }))),
  ];
  // Collision covers the backs and arms, and each recliner's base ends and raised footrest as drawn by
  // recliner() in ipic-interior.js (Val, 2026-10-15). Cushion centres stay more than a body radius
  // (0.35 m) from every box, so the server sit/stand protocol needs no bypass or client authority.
  // Each box is placed in the seat's own frame (x to the sitter's right, z forward) and turned with it.
  for (const seat of room.ipicSeats) {
    const y = ipicFloor(seat.d, seat.a), forward = ipicSeatForward(seat), side = [forward[1], -forward[0]], turned = Math.abs(forward[0]) > .5;
    const part = (kind, x, z, w, l, h) => block(kind, seat.a + side[0] * x + forward[0] * z, seat.d + side[1] * x + forward[1] * z, turned ? l : w, turned ? w : l, y, h);
    part('ipic-seat-back', 0, seat.key === 'lounge-sofa' ? -.45 : -.48, .98, .18, 1.1);
    if (seat.key.startsWith('recliner')) {
      for (const x of [-.54, .54]) part('ipic-seat-arm', x, 0, .22, 1.05, .905);
      for (const z of [-.6125, .6125]) part('ipic-recliner-base', 0, z, 1.15, .175, .34);
      part('ipic-recliner-footrest', 0, .72, .82, .468, .49);
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
  // Downlights through the lower floors, then the auditorium wing's: over the house and the cross aisle behind it.
  // Every one past d 27 is a house light (ipic-interior.js) and dims while a film plays.
  room.lights = [
    ...[1.5, 4.8, 12.8, 21, 24].flatMap(d => [-3, 3].map(a => ({ a, d, y: ipicFloor(d) + 3.2, accent: false }))),
    ...[-16.5, -12.5, -8.5, -4.5].flatMap(a => [28, 32].map(d => ({ a, d, y: 6 + 3.2, accent: false }))),
  ];
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
    // pitched at the screen centre from the floor of its own row, across its distance to the screen plane.
    const toScreen = (seat.a - IPIC_SCREEN.a) * IPIC_SCREEN.facing[0] + (seat.d - IPIC_SCREEN.d) * IPIC_SCREEN.facing[1];
    const eyePitch = seat.key.startsWith('recliner') ? Math.atan2(IPIC_SCREEN.y - (ipicFloor(seat.d, seat.a) - 6) - seat.height - .65, toScreen) : null;
    return { id: `${buildId}:${seat.slot}`, buildId, slot: seat.slot, kind: seat.kind, storeId: room.storeId,
      title: seat.key === 'lounge-sofa' ? 'IPIC lounge sofa' : 'IPIC theater recliner',
      x, north, heading: yaw, height: seat.height, approach: seat.approach ? room.toWorld(...seat.approach) : [x + Math.sin(yaw) * .9, north - Math.cos(yaw) * .9],
      ...(seat.stand ? { standAt: [room.toWorld(...seat.stand)] } : {}), ...(eyePitch === null ? {} : { eyePitch }) };
  }));
}
