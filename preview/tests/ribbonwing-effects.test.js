import test from 'node:test';
import assert from 'node:assert/strict';
import { createRibbonwingSounds, MAX_HUMS, MAX_VOICES, HEARING } from '../src/ribbonwing-sounds.js';
import { createRibbonwingVehicle } from '../src/ribbonwing.js';
import { SAMPLES } from '../src/ribbonwing-trails.js';
import { VEHICLES } from '../src/vehicle-config.js';

// A WebAudio stand-in that counts live nodes, so the bounds and teardown are observable.
function fakeAudio() {
  const live = new Set(), log = { contexts: 0, closed: 0, started: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, setTargetAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {} });
  const node = extra => ({ connect(next) { return next; }, ...extra });
  class Context {
    constructor() { log.contexts++;this.state = 'running';this.currentTime = 0;this.destination = node({}); }
    createGain() { return node({ gain: param() }); }
    createBiquadFilter() { return node({ frequency: param(), Q: param(), type: '' }); }
    createOscillator() {
      const source = node({ frequency: param(), detune: param(), type: '', onended: null,
        start() { live.add(source);log.started++; }, stop() { if (live.delete(source)) queueMicrotask(() => source.onended?.()); } });
      return source;
    }
    resume() {} close() { log.closed++;this.state = 'closed'; }
  }
  return { Context, live, log };
}
const listeners = () => { const map = new Map();return { addEventListener: (type, fn) => map.set(type, fn), removeEventListener: type => map.delete(type), fire: type => map.get(type)?.(), map }; };
const craft = (id, x, extra = {}) => ({ id, position: [x, 0, 0], fanRate: 62, canopy: 0, gear: 0, maneuvering: false, ...extra });

test('Ribbonwing sounds wait for a gesture, hum for at most the nearest crafts in hearing, and honour the shared switch', () => {
  const audio = fakeAudio(), target = listeners();let on = true, hidden = false;
  const switcher = { enabled: () => on };
  const sounds = createRibbonwingSounds({ AudioContextClass: audio.Context, switcher, target, isHidden: () => hidden });
  const crafts = [craft('a', 5), craft('b', 10), craft('c', 20), craft('d', 30), craft('far', HEARING + 1)];
  sounds.update([0, 0, 0], crafts, 0);
  assert.deepEqual([audio.log.contexts, sounds.stats().hums], [0, 0], 'no audio before a click or key');
  target.fire('pointerdown');
  sounds.update([0, 0, 0], crafts, 0);
  assert.equal(sounds.stats().hums, MAX_HUMS, 'only the nearest crafts hum');
  assert.equal(audio.live.size, MAX_HUMS * 2, 'two oscillators per hum');
  sounds.update([0, 0, 0], [craft('a', 5, { fanRate: 0 }), ...crafts.slice(1)], 0);
  assert.equal(sounds.stats().hums, MAX_HUMS, 'a craft whose fans stop gives way to the next nearest');
  on = false;sounds.update([0, 0, 0], crafts, 1);
  assert.equal(sounds.stats().hums, 0, 'the game-sounds switch silences the hum');
  on = true;hidden = true;sounds.update([0, 0, 0], crafts, 2);
  assert.equal(sounds.stats().hums, 0, 'a hidden tab is silent');
  hidden = false;sounds.update([0, 0, 0], crafts, 3);
  assert.equal(sounds.stats().hums, MAX_HUMS);
  sounds.dispose();sounds.dispose();
  assert.deepEqual([audio.live.size, audio.log.closed, target.map.size], [0, 1, 0], 'dispose stops every node, closes the context once and drops the gesture listeners');
});

test('one-shots fire on the canopy, gear and maneuver crossings, rate-limited per craft and capped overall', async () => {
  const audio = fakeAudio(), target = listeners();
  const sounds = createRibbonwingSounds({ AudioContextClass: audio.Context, switcher: { enabled: () => true }, target, isHidden: () => false });
  target.fire('keydown');
  sounds.update([0, 0, 0], [craft('a', 3)], 0);
  const base = audio.log.started;
  sounds.update([0, 0, 0], [craft('a', 3, { canopy: 1 })], .1);
  assert.equal(audio.log.started - base, 1, 'the canopy whirs once as it crosses half open');
  sounds.update([0, 0, 0], [craft('a', 3, { canopy: 0 })], .2);
  assert.equal(audio.log.started - base, 1, 'not again within the gap');
  sounds.update([0, 0, 0], [craft('a', 3, { canopy: 1 })], 1);
  sounds.update([0, 0, 0], [craft('a', 3, { canopy: 1, gear: 1, maneuvering: true })], 1.1);
  assert.equal(audio.log.started - base, 4, 'canopy again, then the gear thunk and the whoosh');
  // Many crafts crossing at once never exceed the voice cap.
  const many = Array.from({ length: 12 }, (_, i) => craft(`m${i}`, 1 + i));
  sounds.update([0, 0, 0], many, 5);sounds.update([0, 0, 0], many.map(c => ({ ...c, gear: 1, canopy: 1, maneuvering: true })), 6);
  assert.ok(sounds.stats().voices <= MAX_VOICES, `voices ${sounds.stats().voices}`);
  sounds.dispose();
});

test('wingtip ribbons stream only during a maneuver, stay within their ring, fade away, honour reduced motion and dispose once', () => {
  const vehicle = createRibbonwingVehicle(VEHICLES.hover);
  const fly = (frames, phase, reducedMotion = false) => { vehicle.setFlightState({ phase, altitude: 6, occupied: true });for (let i = 0; i < frames; i++) { vehicle.object.position.x -= .4;vehicle.object.updateMatrixWorld(true);vehicle.animate(fly.t += 16, 8, reducedMotion); } };
  fly.t = 0;
  fly(30, 'hover');
  assert.deepEqual(vehicle.trails, { samples: [0, 0], draws: 0 }, 'no ribbons in ordinary flight');
  fly(200, 'maneuver');
  assert.deepEqual(vehicle.trails, { samples: [SAMPLES, SAMPLES], draws: 2 }, 'two ribbons, each bounded by its ring');
  fly(120, 'hover');
  assert.deepEqual(vehicle.trails.samples, [0, 0], 'they fade out after the maneuver');
  fly(60, 'maneuver', true);
  assert.deepEqual(vehicle.trails.draws, 0, 'reduced motion draws none');
  const ribbons = [];vehicle.object.traverse(object => { if (object.name.endsWith('ribbon')) ribbons.push(object); });
  assert.equal(ribbons.length, 2);
  let disposed = 0;for (const ribbon of ribbons) ribbon.geometry.addEventListener('dispose', () => disposed++);
  vehicle.dispose();vehicle.dispose();
  assert.equal(disposed, 2, 'each ribbon buffer is freed once');
});
