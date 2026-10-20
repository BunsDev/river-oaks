import test from 'node:test';
import assert from 'node:assert/strict';
import { IPIC_AUDITORIUM_ROWS, IPIC_SCREEN } from '../src/ipic-plan.js';
import { fitVideoToScreen } from '../src/ipic-screening.js';
import { FOCUS_VIEW, filmCorners, focusBand, focusBlend, framingFov, screenFocusPose } from '../src/ipic-screening-view.js';

// The screen in the room frame used by the fixtures: x = a, y = height, z = -d. It hangs on the auditorium
// wing's north wall facing the seats (+a), so as they see it its right runs toward +d (-z).
const room = ([a, h, d]) => [a, h, -d];
const [fa, fd] = IPIC_SCREEN.facing;
const film = (aspect = 16 / 9) => {
  const fit = fitVideoToScreen(aspect, IPIC_SCREEN.width / IPIC_SCREEN.height);
  return { center: room([IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d]), right: [-fd || 0, 0, -fa || 0], up: [0, 1, 0], width: IPIC_SCREEN.width / fit.repeat[0], height: IPIC_SCREEN.height / fit.repeat[1] };
};
// A recliner's seated eye (cushion + 0.69 m) in row r (0 is the back row) at d, and the point on the screen's
// centre line at a given distance from it.
const seatedEye = (r, d) => { const row = IPIC_AUDITORIUM_ROWS[r]; return room([row.a, 6 + row.floor + .53 + .69, d]); };
const onCentreLine = distance => room([IPIC_SCREEN.a + fa * distance, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d + fd * distance]);
const backRow = 0, frontRow = IPIC_AUDITORIUM_ROWS.length - 1;
// Every corner inside the view at that fov and aspect (the same test a renderer's frustum makes).
function inView(pose, corners, aspect) {
  const d = pose.target.map((v, i) => v - pose.position[i]), f = d.map(v => v / Math.hypot(...d));
  const r = [-f[2], 0, f[0]].map(v => v / Math.hypot(f[2], f[0])), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], t = Math.tan(pose.fov * Math.PI / 360);
  return corners.every(c => { const v = c.map((x, i) => x - pose.position[i]), z = dotp(v, f);
    return z > 0 && Math.abs(dotp(v, u)) / z <= t + 1e-9 && Math.abs(dotp(v, r)) / z <= t * aspect + 1e-9; });
}

test('focus frames the whole film from the screen’s centre line at the viewer’s row depth', () => {
  for (const [name, r, d] of [['back row', backRow, 30], ['middle row', 1, 28], ['front row', frontRow, 30], ['front row east', frontRow, 32]]) {
    const eye = seatedEye(r, d), pose = screenFocusPose({ eye, film: film(), aspect: 1440 / 900 });
    assert.deepEqual(pose.position.map(v => +v.toFixed(6)), onCentreLine(IPIC_AUDITORIUM_ROWS[r].distance).map(v => +v.toFixed(6)), `${name}: on the centre line, at its own row`);
    assert.ok(pose.fits && pose.fov >= FOCUS_VIEW.minFov && pose.fov <= FOCUS_VIEW.maxFov, `${name}: ${pose.fov.toFixed(1)}°`);
    assert.ok(inView(pose, filmCorners(film()), 1440 / 900), `${name}: every corner of the film is in view`);
  }
  // The house sized from viewing guidance (2026-10-19): unlike the photographed house's front row, every
  // recliner's own seated eye frames the whole film within the widest comfortable view.
  for (let r = 0; r < IPIC_AUDITORIUM_ROWS.length; r++) for (const d of [28, 30, 32]) {
    const fov = framingFov(seatedEye(r, d), film(), 1440 / 900);
    assert.ok(fov <= FOCUS_VIEW.maxFov, `row ${r} at ${d}: the seated eye needs ${fov.toFixed(0)}°`);
  }
  // A narrow portrait phone in the front row cannot see the whole film within the widest comfortable view: fits says so.
  const phone = screenFocusPose({ eye: seatedEye(frontRow, 30), film: film(), aspect: 390 / 844 });
  assert.deepEqual([phone.fits, phone.fov], [false, FOCUS_VIEW.maxFov]);
  // Never nearer the screen than the minimum distance, whatever the eye.
  assert.equal(screenFocusPose({ eye: onCentreLine(.5), film: film(), aspect: 1.6 }).distance, FOCUS_VIEW.minDistance);
});

// Where each corner lands in normalised device coordinates, with the pose's lens shift (a renderer's off-centre
// projection: the film's centre moves up by shift).
function projected(pose, corners, aspect) {
  const d = pose.target.map((v, i) => v - pose.position[i]), f = d.map(v => v / Math.hypot(...d));
  const r = [-f[2], 0, f[0]].map(v => v / Math.hypot(f[2], f[0])), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], t = Math.tan(pose.fov * Math.PI / 360);
  return corners.map(c => { const v = c.map((x, i) => x - pose.position[i]), z = dotp(v, f); return [dotp(v, r) / z / t / aspect, dotp(v, u) / z / t + (pose.shift ?? 0)]; });
}

test('focus puts the whole film above the screening panel from every row, never past the back row', () => {
  // At 1440 × 900 the panel's top edge is at 588 px; the band the film must stay in ends 12 px above it.
  const aspect = 1440 / 900, band = focusBand({ top: 0, height: 900 }, { top: 588, height: 190 }), back = IPIC_AUDITORIUM_ROWS[backRow].distance;
  assert.ok(Math.abs(band.bottom - (1 - 2 * 576 / 900)) < 1e-9 && band.top === 1, JSON.stringify(band));
  IPIC_AUDITORIUM_ROWS.forEach((row, r) => {
    const name = `row ${r}`, eye = seatedEye(r, 30);
    const pose = screenFocusPose({ eye, film: film(), aspect, band, maxDistance: back });
    const ndc = projected(pose, filmCorners(film()), aspect);
    assert.ok(pose.fits, `${name}: fits within ${FOCUS_VIEW.maxFov}° (wanted ${pose.wanted.toFixed(1)}°)`);
    assert.ok(ndc.every(([x, y]) => Math.abs(x) <= 1 + 1e-9 && y <= band.top + 1e-9 && y >= band.bottom - 1e-9), `${name}: every corner in view and above the panel: ${JSON.stringify(ndc)}`);
    assert.ok(pose.distance >= row.distance - 1e-9 && pose.distance <= back + 1e-9, `${name}: from its own row or behind it, never past the back row (${pose.distance.toFixed(2)} m)`);
    assert.equal(pose.position[1], film().center[1], `${name}: the camera stays at the film's centre height, above every head`);
  });
  // Without the panel (the whole view free), focus is the centred framing at the viewer's own row.
  const front = seatedEye(frontRow, 30), free = screenFocusPose({ eye: front, film: film(), aspect });
  assert.deepEqual([free.shift, +free.distance.toFixed(6)], [0, +IPIC_AUDITORIUM_ROWS[frontRow].distance.toFixed(6)]);
  // The front row is far enough back that, even with no room to step back, its film fits above the panel.
  assert.equal(screenFocusPose({ eye: front, film: film(), aspect, band }).fits, true);
});

test('a 4:3 film frames tighter than a 16:9 one from the same row', () => {
  // From the front row, the closest to the screen, where the framing is wider than the narrowest view.
  const eye = seatedEye(frontRow, 30);
  assert.ok(screenFocusPose({ eye, film: film(4 / 3), aspect: 1.6 }).fov < screenFocusPose({ eye, film: film(16 / 9), aspect: 1.6 }).fov);
});

test('the change of view eases unless motion is reduced', () => {
  assert.equal(focusBlend(0), 0);
  assert.equal(focusBlend(FOCUS_VIEW.easeSeconds), 1);
  assert.ok(focusBlend(FOCUS_VIEW.easeSeconds / 2) > 0.4 && focusBlend(FOCUS_VIEW.easeSeconds / 2) < 0.6);
  assert.equal(focusBlend(0, { reducedMotion: true }), 1, 'reduced motion: immediate');
});
