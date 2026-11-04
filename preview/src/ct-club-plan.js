// The CT Club (Val, 2026-11-04): a fictional, code-only underground
// techno club, not a mapped tenant — 40 m long and 6 m tall, built whole like the
// axe-and-darts room. Pure JS shared by browser and server, so walking collision,
// fixtures and light positions agree everywhere.
//
// The precise street position is still undecided: planCtClub({ east,
// north, yaw }) emits a store-frame room at any facade, so a later position
// decision only has to choose those numbers and join this room to the venue/room
// plumbing beside its interior builder. Until then nothing here enters the world
// data, the store-room list or the district render.
export const CLUB_INTERIOR = 'ct-club-v1';
// 20 bodies-stacked deep (≈40 m) by 3 bodies-stacked tall (6 m), across a 16 m
// dancefloor hall.
export const CLUB = Object.freeze({ id: 'ct-club', name: 'CT Club', width: 16, depth: 40, height: 6 });

// Zones in the plan's local frame (a across the door, d inward from it), metres.
// The long axis is the club: entry throat, the edge-glow bar on the left, the
// lounge (couches, chairs, chai urn) on the right, the edge-lit dancefloor in the
// middle, and the DJ booth with the speaker wall at the back.
export const CLUB_ZONES = Object.freeze({
  entry: Object.freeze({ d: Object.freeze([0, 4]) }),
  bar: Object.freeze({ a: Object.freeze([-8, -4.4]), d: Object.freeze([4, 24]) }),
  lounge: Object.freeze({ a: Object.freeze([0.9, 8]), d: Object.freeze([8, 26]) }),
  dancefloor: Object.freeze({ a: Object.freeze([-6.5, 6.5]), d: Object.freeze([16, 33]) }),
  stage: Object.freeze({ a: Object.freeze([-2.6, 2.6]), d: Object.freeze([33, 34.6]) }),
  speakers: Object.freeze({ a: Object.freeze([-8, 8]), d: Object.freeze([34.2, 39.4]) }),
});

// The mirrored ball hangs over the centre of the dancefloor.
export const DISCO_BALL = Object.freeze({ a: 0, d: 24, y: 5.05, radius: 0.55 });

// Four corner strobes fire rarely (the interior gates each flash under 60 ms, so a
// 40 m room sees very little strobing); the spots below them cycle RGB slowly.
export const CLUB_STROBES = Object.freeze([
  Object.freeze({ a: -7.3, d: 0.8, y: 5.55 }),
  Object.freeze({ a: 7.3, d: 0.8, y: 5.55 }),
  Object.freeze({ a: -7.3, d: 39.0, y: 5.55 }),
  Object.freeze({ a: 7.3, d: 39.0, y: 5.55 }),
]);
export const CLUB_SPOTS = Object.freeze([
  Object.freeze({ a: -7.35, d: 0.6, y: 5.88 }),
  Object.freeze({ a: 7.35, d: 0.6, y: 5.88 }),
  Object.freeze({ a: -7.35, d: 39.4, y: 5.88 }),
  Object.freeze({ a: 7.35, d: 39.4, y: 5.88 }),
]);

// The occasional RGB lasers swing from the ball across the dancefloor. `yaw` is the
// horizontal angle from +d and `pitch` the downward tilt from level, both radians.
export const CLUB_LASERS = Object.freeze([
  Object.freeze({ yaw: -0.55, pitch: 0.1, length: 13 }),
  Object.freeze({ yaw: 0, pitch: 0.14, length: 15 }),
  Object.freeze({ yaw: 0.55, pitch: 0.1, length: 13 }),
]);

// The room's ten named ambient lights (Val, 2026-11-04): one per zone spread down
// the 40 m axis, so the buried hall is never pitch black and hosts can address
// each zone's colour/intensity by name later (automations, or swapping one to a
// point/rect light at the same spot). Local frame as the rest of the plan:
// a across the door, d inward, y up.
export const CLUB_AMBIENTS = Object.freeze([
  Object.freeze({ key: 'entry', zone: 'entry', a: 0, d: 2, y: 3.0, color: '#ffe3bd', intensity: 0.14 }),
  Object.freeze({ key: 'bar.north', zone: 'bar', a: -5.2, d: 6, y: 3.0, color: '#ffb26b', intensity: 0.12 }),
  Object.freeze({ key: 'bar.south', zone: 'bar', a: -5.2, d: 15, y: 3.0, color: '#ffb26b', intensity: 0.12 }),
  Object.freeze({ key: 'lounge.north', zone: 'lounge', a: 4.5, d: 10, y: 3.0, color: '#9a6bff', intensity: 0.12 }),
  Object.freeze({ key: 'lounge.south', zone: 'lounge', a: 4.5, d: 18, y: 3.0, color: '#9a6bff', intensity: 0.12 }),
  Object.freeze({ key: 'dancefloor.north', zone: 'dancefloor', a: -2.5, d: 18, y: 3.0, color: '#6bd4ff', intensity: 0.1 }),
  Object.freeze({ key: 'dancefloor.center', zone: 'dancefloor', a: 0, d: 24.5, y: 3.0, color: '#e8e8f2', intensity: 0.14 }),
  Object.freeze({ key: 'dancefloor.south', zone: 'dancefloor', a: 2.5, d: 30, y: 3.0, color: '#ff6bd4', intensity: 0.1 }),
  Object.freeze({ key: 'stage', zone: 'stage', a: 0, d: 33.6, y: 3.2, color: '#41c8ff', intensity: 0.12 }),
  Object.freeze({ key: 'speakers', zone: 'speakers', a: 0, d: 37, y: 3.2, color: '#b44dff', intensity: 0.12 }),
]);

export const atZone = (zone, a, d) => {
  const za = zone.a ?? [-Infinity, Infinity], zd = zone.d ?? [-Infinity, Infinity];
  return a >= za[0] && a <= za[1] && d >= zd[0] && d <= zd[1];
};
export const atClubDancefloor = (a, d) => atZone(CLUB_ZONES.dancefloor, a, d);
export const atClubBar = (a, d) => atZone(CLUB_ZONES.bar, a, d);
export const atClubLounge = (a, d) => atZone(CLUB_ZONES.lounge, a, d);

// Furnishes a planned room (store-rooms/venue-rooms shape) with the bar, lounge,
// dancefloor markers, DJ booth, speaker wall, corner strobes/spots and the disco
// ball, as collision boxes the server walks against and fixtures the interior reads.
export function configureCtClub(room) {
  room.interior = CLUB_INTERIOR;
  room.height = CLUB.height;
  room.fixtures = [];
  room.obstacles = [];
  const block = (kind, a, d, w, l, y, h) => {
    room.fixtures.push({ kind, a, d, w, l, y, h });
    room.obstacles.push({ a0: a - w / 2, a1: a + w / 2, d0: d - l / 2, d1: d + l / 2 });
  };
  const fixed = (kind, a, d, y) => room.fixtures.push({ kind, a, d, y });

  // The bar along the left wall, its back bar against the wall, and stools in front.
  block('bar-counter', -7.15, 14, 1.5, 20, 0, 1.12);
  block('bar-back-shelf', -7.91, 14, 0.18, 20, 0, 2.9);
  for (const d of [5, 8, 11, 14, 17, 20, 23]) fixed('bar-stool', -5.6, d, 0.75);
  // A chai urn on the counter, the club's own kettle (Val: the bar is lit by edge
  // glow and back glow, the chairs and couches too).
  fixed('chai-urn', -7.3, 5.6, 1.85);

  // The lounge: two couches against the right wall, tables and armchairs facing them.
  block('lounge-couch', 6.6, 10.5, 2.6, 2.2, 0, 0.9);
  block('lounge-couch', 6.6, 16.5, 2.6, 2.2, 0, 0.9);
  block('lounge-table', 4.55, 12.4, 1.0, 1.4, 0, 0.42);
  block('lounge-table', 4.55, 18.4, 1.0, 1.4, 0, 0.42);
  block('lounge-chair', 3.55, 13.6, 0.9, 0.9, 0, 0.85);
  block('lounge-chair', 3.55, 19.6, 0.9, 0.9, 0, 0.85);

  // The DJ booth at the back of the dancefloor, the subwoofer bank behind it and
  // the two big corner stacks: the club's "big big speaker" wall.
  block('dj-booth', 0, 33.7, 5.2, 1.4, 0, 1.1);
  block('speaker-bank', 0, 37.0, 6.8, 4.8, 0, 2.6);
  block('speaker-stack', -5.8, 36.8, 4.4, 5.2, 0, 3.4);
  block('speaker-stack', 5.8, 36.8, 4.4, 5.2, 0, 3.4);

  // Entry threshold mat, the four corner strobes, the RGB corner spots and the ball.
  fixed('entry-mat', 0, 1.4, 0.01);
  for (const strobe of CLUB_STROBES) fixed('club-strobe', strobe.a, strobe.d, strobe.y);
  for (const spot of CLUB_SPOTS) fixed('club-spot-rgb', spot.a, spot.d, spot.y);
  fixed('disco-ball', DISCO_BALL.a, DISCO_BALL.d, DISCO_BALL.y);

  // Ceiling light positions the shared pool lights near whoever is standing below.
  room.lights = [
    { a: 0, d: 1.8, y: 5.6, accent: true },
    { a: -5.2, d: 6, y: 5.7 }, { a: -5.2, d: 11, y: 5.7 }, { a: -5.2, d: 16, y: 5.7 }, { a: -5.2, d: 21, y: 5.7 },
    { a: -3, d: 21, y: 5.7 }, { a: 0, d: 25, y: 5.7 }, { a: 3, d: 21, y: 5.7 }, { a: 0, d: 30, y: 5.7 },
    { a: 5, d: 12, y: 5.3 }, { a: 5, d: 17, y: 5.3 }, { a: 5, d: 22, y: 5.3 },
    { a: 0, d: 33.6, y: 4.4 },
  ];
  // The ten named ambient lights the interior renders (see CLUB_AMBIENTS).
  room.ambients = CLUB_AMBIENTS;
  // No staff: a room's people become shared residents, and a new resident changes
  // the resident count every durable checkpoint is restored against.
  room.people = [];
  room.summary = {
    label: 'CT Club · underground techno club',
    staff: 0, guests: 0, mannequins: 0,
    highlights: ['edge-lit dancefloor tiles', 'disco ball with occasional RGB lasers', 'corner strobes and RGB spots', 'edge-glow bar and seating'],
  };
  return room;
}

// A planned room at any facade. The default (0, 0, yaw 0) is the pending position:
// the district spot is still to be decided, so hosts pass east/north/yaw when they
// place the club. `floor` stays 0 for the same reason (below-grade entry later).
export function planCtClub({ east = 0, north = 0, yaw = 0 } = {}) {
  const outward = [Math.sin(yaw), Math.cos(yaw)];
  const inward = [-outward[0], -outward[1]];
  const right = [-outward[1], outward[0]];
  const facade = [east, north];
  const toWorld = (a, d) => [facade[0] + right[0] * a + inward[0] * d, facade[1] + right[1] * a + inward[1] * d];
  const toLocal = (east, north) => {
    const ae = east - facade[0], an = north - facade[1];
    return [ae * right[0] + an * right[1], ae * inward[0] + an * inward[1]];
  };
  const aMin = -CLUB.width / 2, aMax = CLUB.width / 2;
  const room = {
    id: CLUB.id, storeId: `venue:${CLUB.id}`, venueId: CLUB.id,
    buildingId: 'ct-club', name: CLUB.name, category: 'club', theme: 'club',
    index: 0, facade, outward, inward, right, aMin, aMax, center: 0,
    width: CLUB.width, depth: CLUB.depth, height: CLUB.height, bay: null,
    floor: 0,
    toWorld, toLocal,
    contains(east, north, shrink = 0) {
      const [a, d] = toLocal(east, north);
      return a > aMin + shrink && a < aMax - shrink && d > shrink && d < CLUB.depth - shrink;
    },
    footprint: [[aMin, 0], [aMax, 0], [aMax, CLUB.depth], [aMin, CLUB.depth]].map(([a, d]) => toWorld(a, d)),
    fixtures: [], obstacles: [], people: [], lights: [],
  };
  const bounds = [...room.footprint, toWorld(-0.85, -1.4), toWorld(0.85, -1.4)];
  room.lookupBounds = [Math.min(...bounds.map(p => p[0])), Math.min(...bounds.map(p => p[1])), Math.max(...bounds.map(p => p[0])), Math.max(...bounds.map(p => p[1]))];
  return configureCtClub(room);
}
