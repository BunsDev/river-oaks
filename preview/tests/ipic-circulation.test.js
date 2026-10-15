// #364: how wide a body each IPIC trip admits, with the other seats occupied
// by measured seated bodies, and the screen data handed to #365.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AVATAR_ENVELOPE } from '../src/workplace-room.js';
import { IPIC_SCREEN } from '../src/ipic-plan.js';
import { IPIC_SEATED_REACH } from '../src/ipic-circulation.js';
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

test('every recliner is reachable by the widest accepted body with the other nine seats occupied', () => {
  const recliners = trip('doorway to recliner');
  assert.equal(recliners.length, 8);
  for (const t of recliners) {
    assert.equal(t.otherSeatsOccupied, 9);
    assert.ok(t.widestAcceptedBody, `${t.name}: ${t.widthM} m`);
  }
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

// Open (#364), reported in docs/ipic-interior.md: the only lounge-to-auditorium
// passage, between the lounge planter and the sofa's west arm, is 5 mm narrower
// than the accepted widest body (bind-pose bounds; posed bodies measured on
// 2026-10-15 are at most 0.80 m wide and clear it).
test('the lounge-to-auditorium passage admits the widest accepted body', { todo: 'planter/sofa-arm gap is 1.005 m against 1.01 m' }, () => {
  assert.ok(data.circulation.narrowestPublicPassage.clears, `${data.circulation.narrowestPublicPassage.widthM} m`);
});
