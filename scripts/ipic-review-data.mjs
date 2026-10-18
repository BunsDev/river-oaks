// IPIC circulation and screen review data (#364, for #365 and design review).
//   node scripts/ipic-review-data.mjs          write docs/ipic-review/{circulation,screen}.json
//   node scripts/ipic-review-data.mjs --check  exit 1 if either file is stale
// Pure plan maths from the same modules the game and server use; no browser.
import { readFileSync, writeFileSync } from 'node:fs';
import { createWalkingEnvironment } from '../preview/src/walking.js';
import { AVATAR_ENVELOPE } from '../preview/src/workplace-room.js';
import { IPIC_INTERIOR, IPIC_SCREEN } from '../preview/src/ipic-plan.js';
import { IPIC_SEATED_REACH, ipicBottleneck, ipicClearance, ipicReachable, largestCircle, seatApproach, seatedFootprint } from '../preview/src/ipic-circulation.js';
import { SEAT_REACH } from '../preview/src/shared-seating.js';

const root = new URL('../', import.meta.url);
const STEP = .05, round = (n, places = 3) => +n.toFixed(places);
// The game's seated eye: cushion height plus 0.69 m (store-encounters.js).
const SEATED_EYE = .69;
// The widest walking (posed) body measured on 2026-10-15 (docs/superpowers/plans/2026-10-15-ipic-route-evidence.md).
const WIDEST_POSED_BODY = .8;

export function ipicReviewData(world = JSON.parse(readFileSync(new URL('preview/public/data/district.json', root)))) {
  const env = createWalkingEnvironment(world), room = env.rooms.find(r => r.interior === IPIC_INTERIOR);
  const footprints = except => room.ipicSeats.filter(s => s !== except).map(s => seatedFootprint(s, IPIC_SEATED_REACH));
  const nearest = point => {
    let best = { kind: 'wall', clearance: ipicClearance({ ...room, obstacles: [] }, point) };
    room.obstacles.forEach((o, i) => {
      const c = Math.hypot(point[0] - Math.max(o.a0, Math.min(point[0], o.a1)), point[1] - Math.max(o.d0, Math.min(point[1], o.d1)));
      if (c < best.clearance) best = { kind: room.fixtures[i].kind, clearance: c };
    });
    return best.kind;
  };
  const trip = (name, from, to, occupied = []) => {
    const width = ipicBottleneck(room, from, to, { step: STEP, blockers: occupied });
    return { name, from, to, otherSeatsOccupied: occupied.length, widthM: width === null ? null : round(2 * width, 2),
      widestAcceptedBody: width !== null && width >= AVATAR_ENVELOPE.bodyHalfWidth, serverBody: width !== null && width >= .35, endClearanceM: round(ipicClearance(room, to, occupied), 2),
      endNearest: nearest(to) };
  };
  const door = [0, -.6], doorway = [-4.7, 26.6], laneTop = [-1.4, 20.5];
  const trips = [
    trip('street door to the top of the left escalator lane', door, laneTop),
    trip('street door to the top of the right escalator lane', door, [1.4, 20.5]),
    trip('lane top to inside the auditorium doorway', laneTop, doorway),
    ...room.ipicSeats.filter(s => s.key.startsWith('recliner')).map(s => trip(`doorway to ${s.key} approach`, doorway, seatApproach(s), footprints(s))),
    ...room.ipicSeats.filter(s => s.key === 'lounge-sofa').map(s => trip(`lane top to lounge-sofa:${s.slot} approach`, laneTop, seatApproach(s), footprints(s))),
  ];
  // The narrowest public passage: the tightest of the trips every visitor makes (street door to either lane
  // top, lane top to the auditorium). Until the sofa moved (2026-10-18) it was the gap between the lounge
  // planter and the sofa's west arm.
  const narrowest = trips.slice(0, 3).reduce((x, y) => (y.widthM < x.widthM ? y : x));
  // Where the widest accepted body sits each recliner from, with the other nine seats held: the
  // nearest spot it can walk to from the doorway that is within the server's sit reach (SEAT_REACH,
  // flat distance) and sees the cushion as the server's sit check does (eye 1.68 m, cushion + 0.6 m).
  const world3 = ([a, d], above) => { const [x, n] = room.toWorld(a, d); return [x, n, room.floor + 6 + above]; };
  const reclinerSitSpots = room.ipicSeats.filter(s => s.key.startsWith('recliner')).map(seat => {
    const blockers = footprints(seat), reachable = ipicReachable(room, doorway, { radius: AVATAR_ENVELOPE.bodyHalfWidth, blockers, step: .1 });
    const cushion = world3([seat.a, seat.d], seat.height + .6), candidates = [];
    for (let a = seat.a - SEAT_REACH; a <= seat.a + SEAT_REACH; a += .1) for (let d = seat.d - SEAT_REACH; d <= seat.d + SEAT_REACH; d += .1) {
      const distance = Math.hypot(a - seat.a, d - seat.d);
      if (distance <= SEAT_REACH && d >= 26.1 && reachable([a, d])) candidates.push({ at: [a, d], distance });
    }
    const spot = candidates.sort((x, y) => x.distance - y.distance).find(c => env.hasSightLine(world3(c.at, 1.68), cushion));
    return { seat: seat.key, otherSeatsOccupied: blockers.length, widestAcceptedBody: Boolean(spot), sightLine: Boolean(spot),
      sitSpot: spot ? spot.at.map(v => round(v, 2)) : null, sitDistanceM: spot ? round(spot.distance, 2) : null };
  });
  // In front of the first row, between its footrests and the back row's seated bodies.
  const footrestFront = Math.max(...room.fixtures.filter(f => f.kind === 'ipic-recliner-footrest' && f.d < 29.5).map(f => f.d + f.l / 2));
  const backRowReach = Math.min(...room.ipicSeats.filter(s => s.key.startsWith('recliner-1-')).map(s => s.d - IPIC_SEATED_REACH.back));
  const frontRowAisle = { between: ['front-row footrests', 'back-row seated bodies'], widthM: round(backRowReach - footrestFront, 3),
    widestAcceptedBodyM: round(2 * AVATAR_ENVELOPE.bodyHalfWidth, 3), clearsWidestAcceptedBody: backRowReach - footrestFront >= 2 * AVATAR_ENVELOPE.bodyHalfWidth,
    widestPosedBodyM: WIDEST_POSED_BODY, accepted: 'Val, 2026-10-15: footrest and base colliders follow the art' };
  const occupied = room.ipicSeats.map(s => seatedFootprint(s, IPIC_SEATED_REACH));
  const turning = Object.entries({ reception: [0, 5.9], 'mural landing': [12.1, 13.9], 'upper lounge': [20.1, 25.9], auditorium: [26.1, 33.9] })
    .map(([zone, band]) => { const c = largestCircle(room, band, { step: STEP, blockers: occupied }); return { zone, radiusM: round(c.clearance, 2), at: c.at.map(v => round(v, 2)) }; });
  const circulation = {
    schemaVersion: 1, interior: IPIC_INTERIOR, frame: 'room metres: a across the frontage from the door centre, d inward from the facade', gridM: STEP,
    bodies: {
      server: { radiusM: .35, note: 'preview/src/walking.js RADIUS; square-inflated boxes' },
      accepted: { ...AVATAR_ENVELOPE, source: 'preview/src/workplace-room.js AVATAR_ENVELOPE (2026-10-11, bind-pose bounds)' },
      seatedReach: { ...IPIC_SEATED_REACH, source: 'docs/superpowers/plans/2026-10-15-ipic-route-evidence/seated-extents.json' },
    },
    trips, reclinerSitSpots, frontRowAisle, narrowestPublicPassage: { trip: narrowest.name, widthM: narrowest.widthM, widestAcceptedBodyM: round(2 * AVATAR_ENVELOPE.bodyHalfWidth, 3), clears: narrowest.widestAcceptedBody },
    turningCircles: turning.map(t => ({ ...t, clearsLongestTurningBody: t.radiusM >= AVATAR_ENVELOPE.turningRadius })),
  };
  const screen = IPIC_SCREEN, floor = 6, left = screen.a - screen.width / 2, right = screen.a + screen.width / 2;
  const bottom = screen.y - screen.height / 2, top = screen.y + screen.height / 2, deg = r => round(r * 180 / Math.PI, 1);
  // The recliner in front blocks along its headrest: top 1.545 m, back face 0.63 m behind its seat origin (ipic-interior.js).
  const HEADREST = { top: 1.545, behind: .63 };
  const seats = room.ipicSeats.filter(s => s.key.startsWith('recliner')).map(s => {
    const eye = s.height + SEATED_EYE, distance = screen.d - s.d;
    const front = room.ipicSeats.find(o => o.key.startsWith('recliner') && o.a === s.a && o.d > s.d);
    const lowestVisible = front ? eye + (HEADREST.top - eye) / (front.d - HEADREST.behind - s.d) * distance : bottom;
    return { seat: `bench:ipic-${s.key}:${s.slot}`, at: [s.a, s.d], eyeM: round(eye, 2), distanceM: round(distance, 2),
      horizontalDeg: deg(Math.atan2(right - s.a, distance) - Math.atan2(left - s.a, distance)),
      offAxisDeg: deg(Math.atan2(screen.a - s.a, distance)), topElevationDeg: deg(Math.atan2(top - eye, distance)),
      lowestVisibleM: round(Math.max(bottom, lowestVisible), 2), hiddenBottomFraction: round(Math.max(0, Math.min(1, (lowestVisible - bottom) / screen.height)), 2) };
  });
  const captionFloor = Math.max(...seats.map(s => s.lowestVisibleM));
  const screenData = {
    schemaVersion: 1, interior: IPIC_INTERIOR, source: 'preview/src/ipic-plan.js IPIC_SCREEN',
    frame: 'room metres; heights above the auditorium floor (room floor + 6 m)',
    screen: { centre: [screen.a, screen.y, screen.d], widthM: screen.width, heightM: screen.height, aspect: round(screen.width / screen.height, 3),
      leftM: round(left, 3), rightM: round(right, 3), bottomM: round(bottom, 3), topM: round(top, 3), auditoriumFloorM: floor },
    seatedEye: `cushion height + ${SEATED_EYE} m (store-encounters.js); seated avatars in front are not modelled, only recliner headrests`,
    seats,
    burnedInTextSafe: { lowestM: captionFloor, fractionFromTop: round((top - captionFloor) / screen.height, 2),
      note: 'Lowest screen height every recliner sees over the headrest in front. Captions in the player are a WebVTT track, not burned in.' },
  };
  return { circulation, screen: screenData };
}

const files = { circulation: 'docs/ipic-review/circulation.json', screen: 'docs/ipic-review/screen.json' };
if (import.meta.url === `file://${process.argv[1]}`) {
  const data = ipicReviewData(), stale = [];
  for (const [key, path] of Object.entries(files)) {
    const text = `${JSON.stringify(data[key], null, 2)}\n`, url = new URL(path, root);
    let current = null; try { current = readFileSync(url, 'utf8'); } catch {}
    if (process.argv.includes('--check')) { if (current !== text) stale.push(path); } else writeFileSync(url, text);
  }
  if (stale.length) { console.error(`stale: ${stale.join(', ')}; run node scripts/ipic-review-data.mjs`); process.exit(1); }
  console.log(process.argv.includes('--check') ? 'IPIC review data is current' : `wrote ${Object.values(files).join(', ')}`);
}
