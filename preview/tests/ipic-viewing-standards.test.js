// The auditorium's proportions against cinema viewing guidance (Val, 2026-10-19; IPIC_VIEWING in
// ipic-plan.js): horizontal angle of view per row, the look up to the image's top, the C-value over each
// headrest in front, seats facing the screen, and a wing three times the old room's width.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { IPIC_AUDITORIUM_ROWS, IPIC_AUDITORIUM_SEAT_D, IPIC_SCREEN, IPIC_VIEWING, IPIC_WING, ipicFloor, ipicSeatForward } from '../src/ipic-plan.js';
import { storeRoomsFor } from '../src/store-rooms.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const room = storeRoomsFor(world).find(r => r.interior === 'ipic-photo-v1');
const recliners = room.ipicSeats.filter(seat => seat.key.startsWith('recliner'));
const degrees = radians => radians * 180 / Math.PI;
const [fa, fd] = IPIC_SCREEN.facing, right = [-fd || 0, fa];
// A point's distance in front of the screen plane, and its offset from the screen's centre line.
const ahead = ([a, d]) => (a - IPIC_SCREEN.a) * fa + (d - IPIC_SCREEN.d) * fd;
const across = ([a, d]) => (a - IPIC_SCREEN.a) * right[0] + (d - IPIC_SCREEN.d) * right[1];
// Heights over the upper floor: a seated eye, and the image's edges.
const eye = seat => ipicFloor(seat.d, seat.a) - 6 + IPIC_VIEWING.seatedEye;
const top = IPIC_SCREEN.y + IPIC_SCREEN.height / 2, bottom = IPIC_SCREEN.y - IPIC_SCREEN.height / 2;

test('every recliner sees the screen within SMPTE EG-18 and THX horizontal angles', () => {
  assert.equal(recliners.length, IPIC_AUDITORIUM_ROWS.length * IPIC_AUDITORIUM_SEAT_D.length);
  for (const seat of recliners) {
    const angle = degrees(2 * Math.atan(IPIC_SCREEN.width / 2 / ahead([seat.a, seat.d])));
    assert.ok(angle >= IPIC_VIEWING.smpteMin && angle <= IPIC_VIEWING.frontMax, `${seat.key}: ${angle.toFixed(1)}°`);
  }
  const angles = IPIC_AUDITORIUM_ROWS.map(row => row.angle);
  assert.ok(angles.every((angle, i) => !i || angle > angles[i - 1]), 'rows are listed back to front');
  assert.ok(angles.at(-1) > 55, `the front row uses the room up to the 60° limit: ${angles.at(-1).toFixed(1)}°`);
  assert.ok(angles.some(angle => angle >= IPIC_VIEWING.thxMin && angle <= 45), `a row sits near THX's 40° ideal: ${angles.map(a => a.toFixed(1))}`);
  // The old house: two rows 5.79 m and 2.79 m from a 12.1 m screen saw 92° and 130°.
  assert.ok(Math.max(...angles) < 92);
});

test('the image\'s top edge stays within 35° of every seated eye', () => {
  for (const seat of recliners) {
    const up = degrees(Math.atan2(top - eye(seat), ahead([seat.a, seat.d])));
    assert.ok(up <= IPIC_VIEWING.verticalMax, `${seat.key}: ${up.toFixed(1)}° up to the top`);
  }
});

test('each row\'s eye line to the bottom of the image clears the headrest in front by the C-value', () => {
  for (let row = 0; row < IPIC_AUDITORIUM_ROWS.length - 1; row++) for (const d of IPIC_AUDITORIUM_SEAT_D) {
    const seat = recliners.find(s => s.key === `recliner-${row}-${IPIC_AUDITORIUM_SEAT_D.indexOf(d)}`);
    const front = recliners.find(s => s.key === `recliner-${row + 1}-${IPIC_AUDITORIUM_SEAT_D.indexOf(d)}`);
    const D = ahead([seat.a, seat.d]), x = ahead([front.a, front.d]) + IPIC_VIEWING.headrest.behind;
    const line = bottom + (eye(seat) - bottom) * x / D, headrest = ipicFloor(front.d, front.a) - 6 + IPIC_VIEWING.headrest.top;
    // The rake is solved to the C-value exactly; its floors are kept to 0.1 mm.
    assert.ok(line - headrest >= IPIC_VIEWING.cValue - 2e-4, `${seat.key} over ${front.key}: ${(line - headrest).toFixed(4)} m`);
  }
  // The rake steps down towards the screen, and the back row is level with the doorway.
  assert.equal(IPIC_AUDITORIUM_ROWS[0].floor, 0);
  assert.ok(IPIC_AUDITORIUM_ROWS.every((row, i) => !i || row.floor < IPIC_AUDITORIUM_ROWS[i - 1].floor));
});

test('recliners face the screen, centred on it, and the screen fits the wing\'s end wall under its ceiling', () => {
  for (const seat of recliners) {
    const [x, z] = ipicSeatForward(seat);
    assert.ok(Math.abs(x + fa) < 1e-9 && Math.abs(z + fd) < 1e-9, `${seat.key} faces the screen`);
  }
  const offsets = IPIC_AUDITORIUM_SEAT_D.map(d => across([IPIC_SCREEN.a + fa, d]));
  assert.ok(Math.abs(offsets.reduce((sum, v) => sum + v, 0)) < 1e-9, 'the seat block is centred on the screen');
  assert.ok(IPIC_SCREEN.d - IPIC_SCREEN.width / 2 > IPIC_WING.d0 && IPIC_SCREEN.d + IPIC_SCREEN.width / 2 < IPIC_WING.d1, 'the screen fits along the end wall');
  assert.ok(Math.abs(IPIC_SCREEN.width / IPIC_SCREEN.height - 2.39) < .01, '2.39:1 scope');
  assert.ok(6 + top < room.height, 'the top of the image is under the ceiling');
  assert.ok(Math.abs(IPIC_SCREEN.a - IPIC_WING.aMin) < .2, 'on the north end wall');
});

test('the wing runs three times the old auditorium\'s width along the building', () => {
  const [wing] = room.parts;
  assert.deepEqual({ ...wing }, { ...IPIC_WING });
  assert.ok(Math.abs((wing.aMax - wing.aMin) / 3 - (room.aMax - room.aMin)) < .05, `${wing.aMax - wing.aMin} m against ${room.aMax - room.aMin} m`);
  assert.ok(wing.d1 <= room.depth && wing.d0 >= 26, 'behind the cinema wall, within the room\'s depth');
});
