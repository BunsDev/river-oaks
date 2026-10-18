import test from 'node:test';
import assert from 'node:assert/strict';
import { IPIC_SCREEN } from '../src/ipic-plan.js';
import { fitVideoToScreen } from '../src/ipic-screening.js';
import { FOCUS_VIEW, filmCorners, focusBand, focusBlend, framingFov, screenFocusPose } from '../src/ipic-screening-view.js';

// The screen in the room frame used by the fixtures: x = a, y = height, z = -d; it faces the seats (+z).
const room = ([a, h, d]) => [a, h, -d];
const film = (aspect = 16 / 9) => {
  const fit = fitVideoToScreen(aspect, IPIC_SCREEN.width / IPIC_SCREEN.height);
  return { center: room([IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d]), right: [1, 0, 0], up: [0, 1, 0], width: IPIC_SCREEN.width / fit.repeat[0], height: IPIC_SCREEN.height / fit.repeat[1] };
};
// Every corner inside the view at that fov and aspect (the same test a renderer's frustum makes).
function inView(pose, corners, aspect) {
  const d = pose.target.map((v, i) => v - pose.position[i]), f = d.map(v => v / Math.hypot(...d));
  const r = [-f[2], 0, f[0]].map(v => v / Math.hypot(f[2], f[0])), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], t = Math.tan(pose.fov * Math.PI / 360);
  return corners.every(c => { const v = c.map((x, i) => x - pose.position[i]), z = dotp(v, f);
    return z > 0 && Math.abs(dotp(v, u)) / z <= t + 1e-9 && Math.abs(dotp(v, r)) / z <= t * aspect + 1e-9; });
}

test('focus frames the whole film from the screen’s centre line at the viewer’s row depth', () => {
  // Recliner eyes (cushion + 0.69 m): back row on the riser, front row, and the front row's east end.
  const back = room([-0.6, 6 + 0.4 + 0.53 + 0.69, 29.3]), front = room([-0.6, 6 + 0.53 + 0.69, 31]), east = room([3.2, 6 + 0.53 + 0.69, 31]);
  for (const [name, eye, depth] of [['back row', back, IPIC_SCREEN.d - 29.3], ['front row', front, IPIC_SCREEN.d - 31], ['front row east', east, IPIC_SCREEN.d - 31]]) {
    const pose = screenFocusPose({ eye, film: film(), aspect: 1440 / 900 });
    assert.deepEqual(pose.position.map(v => +v.toFixed(6)), room([IPIC_SCREEN.a, 6 + IPIC_SCREEN.y, IPIC_SCREEN.d - depth]).map(v => +v.toFixed(6)), `${name}: on the centre line, at its own row`);
    assert.ok(pose.fits && pose.fov >= FOCUS_VIEW.minFov && pose.fov <= FOCUS_VIEW.maxFov, `${name}: ${pose.fov.toFixed(1)}°`);
    assert.ok(inView(pose, filmCorners(film()), 1440 / 900), `${name}: every corner of the film is in view`);
    // From the seat itself the same film needs a much wider view: why focus does not stay at the eye.
    if (name !== 'back row') assert.ok(framingFov(eye, film(), 1440 / 900) > FOCUS_VIEW.maxFov, `${name}: the seated eye needs ${framingFov(eye, film(), 1440 / 900).toFixed(0)}°`);
  }
  // A narrow portrait phone cannot see the whole film within the widest comfortable view: fits says so.
  const phone = screenFocusPose({ eye: back, film: film(), aspect: 390 / 844 });
  assert.deepEqual([phone.fits, phone.fov], [false, FOCUS_VIEW.maxFov]);
  // Never nearer the screen than the minimum distance, whatever the eye.
  assert.equal(screenFocusPose({ eye: room([0, 8, IPIC_SCREEN.d - 0.5]), film: film(), aspect: 1.6 }).distance, FOCUS_VIEW.minDistance);
});

// Where each corner lands in normalised device coordinates, with the pose's lens shift (a renderer's off-centre
// projection: the film's centre moves up by shift).
function projected(pose, corners, aspect) {
  const d = pose.target.map((v, i) => v - pose.position[i]), f = d.map(v => v / Math.hypot(...d));
  const r = [-f[2], 0, f[0]].map(v => v / Math.hypot(f[2], f[0])), u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const dotp = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], t = Math.tan(pose.fov * Math.PI / 360);
  return corners.map(c => { const v = c.map((x, i) => x - pose.position[i]), z = dotp(v, f); return [dotp(v, r) / z / t / aspect, dotp(v, u) / z / t + (pose.shift ?? 0)]; });
}

test('focus puts the whole film above the screening panel, stepping back for the front row but never past the back row', () => {
  // At 1440 × 900 the panel's top edge is at 588 px; the band the film must stay in ends 12 px above it.
  const aspect = 1440 / 900, band = focusBand({ top: 0, height: 900 }, { top: 588, height: 190 }), back = IPIC_SCREEN.d - 28;
  assert.ok(Math.abs(band.bottom - (1 - 2 * 576 / 900)) < 1e-9 && band.top === 1, JSON.stringify(band));
  // Recliner rows are at d = 28 (back, on the riser) and d = 31 (front).
  for (const [name, d] of [['front row', 31], ['back row', 28]]) {
    const eye = room([-0.6, 6 + 0.53 + 0.69 + (d === 28 ? 0.4 : 0), d]);
    const pose = screenFocusPose({ eye, film: film(), aspect, band, maxDistance: back });
    const ndc = projected(pose, filmCorners(film()), aspect);
    assert.ok(pose.fits, `${name}: fits within ${FOCUS_VIEW.maxFov}° (wanted ${pose.wanted.toFixed(1)}°)`);
    assert.ok(ndc.every(([x, y]) => Math.abs(x) <= 1 + 1e-9 && y <= band.top + 1e-9 && y >= band.bottom - 1e-9), `${name}: every corner in view and above the panel: ${JSON.stringify(ndc)}`);
    assert.ok(pose.distance >= IPIC_SCREEN.d - d - 1e-9 && pose.distance <= back + 1e-9, `${name}: from its own row or behind it, never past the back row (${pose.distance.toFixed(2)} m)`);
    assert.equal(pose.position[1], film().center[1], `${name}: the camera stays at the film's centre height, above every head`);
  }
  // Without the panel (the whole view free), focus is the centred framing at the viewer's own row.
  const free = screenFocusPose({ eye: room([-0.6, 7.22, 31]), film: film(), aspect });
  assert.deepEqual([free.shift, +free.distance.toFixed(6)], [0, +(IPIC_SCREEN.d - 31).toFixed(6)]);
  // With no room to step back (maxDistance at the row), a front-row film that cannot fit above the panel says so.
  assert.equal(screenFocusPose({ eye: room([-0.6, 7.22, 31]), film: film(), aspect, band }).fits, false);
});

test('a 4:3 film frames tighter than a 16:9 one from the same row', () => {
  const eye = room([-0.6, 7.62, 29.3]);
  assert.ok(screenFocusPose({ eye, film: film(4 / 3), aspect: 1.6 }).fov < screenFocusPose({ eye, film: film(16 / 9), aspect: 1.6 }).fov);
});

test('the change of view eases unless motion is reduced', () => {
  assert.equal(focusBlend(0), 0);
  assert.equal(focusBlend(FOCUS_VIEW.easeSeconds), 1);
  assert.ok(focusBlend(FOCUS_VIEW.easeSeconds / 2) > 0.4 && focusBlend(FOCUS_VIEW.easeSeconds / 2) < 0.6);
  assert.equal(focusBlend(0, { reducedMotion: true }), 1, 'reduced motion: immediate');
});
