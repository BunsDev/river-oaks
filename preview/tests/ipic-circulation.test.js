// #364: how wide a body each IPIC trip admits, with the other seats occupied
// by measured seated bodies, and the screen data handed to #365.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';
import { IPIC_SCREEN } from '../src/ipic-plan.js';
import { IPIC_SEATED_REACH } from '../src/ipic-circulation.js';
import { SEAT_REACH } from '../src/shared-seating.js';
import { ipicReviewData } from '../../scripts/ipic-review-data.mjs';

const data = ipicReviewData();
const committed = name => JSON.parse(readFileSync(new URL(`../../docs/ipic-review/${name}.json`, import.meta.url)));
const trip = prefix => data.circulation.trips.filter(t => t.name.startsWith(prefix));

test('the committed circulation and screen data match the plan', () => {
  assert.deepEqual(committed('circulation'), data.circulation, 'run node scripts/ipic-review-data.mjs');
  assert.deepEqual(committed('screen'), data.screen, 'run node scripts/ipic-review-data.mjs');
});

test('the seated reach matches the worst measured look on every side', () => {
  const measured = JSON.parse(readFileSync(new URL('../../docs/superpowers/plans/2026-10-15-ipic-route-evidence/seated-extents.json', import.meta.url)));
  const worst = measured.worst.seated;
  assert.deepEqual(IPIC_SEATED_REACH, { side: Math.max(worst.left.value, worst.right.value), front: worst.front.value, back: worst.back.value });
  assert.equal(Object.keys(measured.looks).length, 22);
});

test('both escalator lanes carry the widest accepted body straight up from the street door', () => {
  for (const t of trip('street door')) assert.ok(t.widestAcceptedBody && t.widthM >= 1.7, `${t.name}: ${t.widthM} m`);
});

// Recliner footrests and bases collide as drawn (Val, 2026-10-15). With the back row seated the
// front-row aisle is narrower than the widest accepted (bind-pose) body, which instead sits from any
// spot within the server's sit reach that it can walk to and that sees the cushion.
test('the widest accepted body reaches a sit spot for every recliner with the other nine seats occupied', () => {
  const spots = data.circulation.reclinerSitSpots;
  assert.equal(spots?.length, 8);
  for (const s of spots) {
    assert.equal(s.otherSeatsOccupied, 9);
    assert.ok(s.widestAcceptedBody && s.sitDistanceM <= SEAT_REACH && s.sightLine, `${s.seat}: ${JSON.stringify(s)}`);
  }
});

test('the server body walks to every recliner approach with the other nine seats occupied', () => {
  const recliners = trip('doorway to recliner');
  assert.equal(recliners.length, 8);
  for (const t of recliners) assert.ok(t.otherSeatsOccupied === 9 && t.serverBody, `${t.name}: ${t.widthM} m`);
});

test('the front-row aisle with the back row seated is recorded and fits the widest posed body', () => {
  const aisle = data.circulation.frontRowAisle;
  assert.ok(aisle, 'no front-row aisle record');
  assert.ok(aisle.widthM >= aisle.widestPosedBodyM && !aisle.clearsWidestAcceptedBody, JSON.stringify(aisle));
});

test('each zone where a route turns has room for the longest turning body with every seat occupied', () => {
  for (const zone of data.circulation.turningCircles) assert.ok(zone.radiusM >= AVATAR_ENVELOPE.turningRadius, `${zone.zone}: ${zone.radiusM} m`);
});

test('the screen data hands #365 the plan screen and a sightline per recliner', () => {
  const { screen, seats, burnedInTextSafe } = data.screen;
  assert.deepEqual([screen.widthM, screen.heightM, screen.leftM, screen.rightM], [IPIC_SCREEN.width, IPIC_SCREEN.height, IPIC_SCREEN.a - IPIC_SCREEN.width / 2, IPIC_SCREEN.a + IPIC_SCREEN.width / 2].map(v => +v.toFixed(3)));
  assert.equal(seats.length, 8);
  // The front row sees the whole screen; the back row sees over the headrests in front.
  for (const seat of seats) assert.ok(seat.at[1] === 31 ? seat.hiddenBottomFraction === 0 : seat.hiddenBottomFraction > 0 && seat.lowestVisibleM < screen.topM, seat.seat);
  assert.equal(burnedInTextSafe.lowestM, Math.max(...seats.map(s => s.lowestVisibleM)));
});

// The only lounge-to-auditorium passage runs between the lounge planter and the
// sofa's west arm. It was 5 mm narrower than the widest accepted body until Val
// had the planter moved about 5 cm (2026-10-15).
test('the lounge-to-auditorium passage admits the widest accepted body', () => {
  assert.ok(data.circulation.narrowestPublicPassage.clears, `${data.circulation.narrowestPublicPassage.widthM} m`);
});
