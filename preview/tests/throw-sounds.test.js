import test from 'node:test';
import assert from 'node:assert/strict';
import { createThrowSounds } from '../src/throw-sounds.js';

// A minimal WebAudio stand-in that records what each sound builds and starts.
function fakeAudio() {
  const started = [], stopped = [], made = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = kind => { const item = { kind, connect: next => next ?? item }; made.push(kind); return item; };
  class FakeContext {
    constructor() { this.sampleRate = 48000; this.currentTime = 1; this.state = 'running'; this.destination = node('destination'); this.suspended = 0; }
    createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
    createGain() { return Object.assign(node('gain'), { gain: param() }); }
    createBiquadFilter() { return Object.assign(node('filter'), { frequency: param(), Q: param(), type: '' }); }
    createBufferSource() { return Object.assign(node('noise'), { start: at => started.push(['noise', at]), stop: at => stopped.push(at) }); }
    createOscillator() { return Object.assign(node('tone'), { frequency: param(), type: '', start: at => started.push(['tone', at]), stop: at => stopped.push(at) }); }
    suspend() { this.suspended += 1; }
  }
  return { FakeContext, started, stopped, made };
}
const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), map }; };

test('each throwing sound builds a short WebAudio voice and starts it', () => {
  const { FakeContext, started } = fakeAudio(), storage = memory();
  const sounds = createThrowSounds({ storage, AudioContextClass: FakeContext });
  assert.equal(sounds.enabled(), true, 'on unless the viewer turned them off');
  for (const kind of ['release', 'dart', 'dart-miss', 'tap', 'clink', 'plop', 'slide', 'knock', 'axe-stick', 'axe-bounce']) {
    const before = started.length;
    assert.equal(typeof sounds.play(kind, { strength: 0.8, seconds: 1.2 })?.stop, 'function', kind);
    assert.ok(started.length > before, `${kind} starts at least one voice`);
  }
  assert.ok(started.every(([, at]) => at > 1), 'scheduled just after the current time');
  assert.equal(sounds.play('fanfare'), null, 'unknown sounds play nothing');
  const delayed = started.length; sounds.play('knock', { delay: 0.5 });
  assert.ok(started.slice(delayed).every(([, at]) => at >= 1.5), 'a delay schedules later');
});

test('one remembered switch turns every sound off, and no WebAudio is never an error', () => {
  const { FakeContext, started } = fakeAudio(), storage = memory();
  const sounds = createThrowSounds({ storage, AudioContextClass: FakeContext }), heard = [];
  sounds.subscribe(on => heard.push(on));
  sounds.play('dart');
  sounds.setEnabled(false);
  const before = started.length;
  assert.equal(sounds.play('dart'), null);
  assert.equal(sounds.unlock(), false, 'nothing to wake while off');
  assert.equal(started.length, before, 'nothing plays while off');
  assert.deepEqual([storage.map.get('river-oaks-game-sounds'), heard], ['off', [false]]);
  assert.equal(createThrowSounds({ storage, AudioContextClass: FakeContext }).enabled(), false, 'the choice is remembered');
  const silent = createThrowSounds({ storage: memory(), AudioContextClass: undefined });
  assert.equal(silent.play('axe-stick'), null);
  assert.equal(silent.unlock(), false);
  const broken = createThrowSounds({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, AudioContextClass: FakeContext });
  assert.equal(broken.enabled(), true, 'blocked storage keeps the default');
  broken.setEnabled(false);
  assert.equal(broken.enabled(), false);
});

test('a slide can be stopped early, a throw unlocks the context, and a broken audio stack never throws', () => {
  const { FakeContext, stopped } = fakeAudio(), made = [];
  class Counted extends FakeContext { constructor() { super(); made.push(this); } }
  const sounds = createThrowSounds({ storage: memory(), AudioContextClass: Counted });
  assert.equal(sounds.unlock(), true, 'a press makes the context inside its gesture');
  assert.equal(made.length, 1);
  const hiss = sounds.play('slide', { seconds: 3 });
  const scheduled = stopped.at(-1);
  assert.ok(scheduled > 3, 'the hiss is scheduled for its full length');
  hiss.stop();
  assert.ok(stopped.at(-1) < 1.2, `stopping ends it within a moment (${stopped.at(-1)})`);
  sounds.play('knock');
  assert.equal(made.length, 1, 'one context for every sound');
  class Broken extends FakeContext { createBuffer() { throw new Error('no buffers'); } }
  const broken = createThrowSounds({ storage: memory(), AudioContextClass: Broken });
  assert.doesNotThrow(() => broken.play('dart'));
  assert.equal(broken.play('dart'), null);
  assert.equal(broken.unlock(), false);
});
