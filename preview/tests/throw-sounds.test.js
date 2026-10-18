import test from 'node:test';
import assert from 'node:assert/strict';
import { createThrowSounds } from '../src/throw-sounds.js';

// A minimal WebAudio stand-in that records what each sound builds and starts.
function fakeAudio() {
  const started = [], made = [];
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} });
  const node = kind => { const item = { kind, connect: next => next ?? item }; made.push(kind); return item; };
  class FakeContext {
    constructor() { this.sampleRate = 48000; this.currentTime = 1; this.state = 'running'; this.destination = node('destination'); this.suspended = 0; }
    createBuffer(channels, length) { const data = new Float32Array(length); return { getChannelData: () => data }; }
    createGain() { return Object.assign(node('gain'), { gain: param() }); }
    createBiquadFilter() { return Object.assign(node('filter'), { frequency: param(), Q: param(), type: '' }); }
    createBufferSource() { return Object.assign(node('noise'), { start: at => started.push(['noise', at]), stop() {} }); }
    createOscillator() { return Object.assign(node('tone'), { frequency: param(), type: '', start: at => started.push(['tone', at]), stop() {} }); }
    suspend() { this.suspended += 1; }
  }
  return { FakeContext, started, made };
}
const memory = () => { const map = new Map(); return { getItem: key => map.get(key) ?? null, setItem: (key, value) => map.set(key, String(value)), map }; };

test('each throwing sound builds a short WebAudio voice and starts it', () => {
  const { FakeContext, started } = fakeAudio(), storage = memory();
  const sounds = createThrowSounds({ storage, AudioContextClass: FakeContext });
  assert.equal(sounds.enabled(), true, 'on unless the viewer turned them off');
  for (const kind of ['release', 'dart', 'dart-miss', 'tap', 'clink', 'plop', 'slide', 'knock', 'axe-stick', 'axe-bounce']) {
    const before = started.length;
    assert.equal(sounds.play(kind, { strength: 0.8, seconds: 1.2 }), true, kind);
    assert.ok(started.length > before, `${kind} starts at least one voice`);
  }
  assert.ok(started.every(([, at]) => at > 1), 'scheduled just after the current time');
  assert.equal(sounds.play('fanfare'), false, 'unknown sounds play nothing');
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
  assert.equal(sounds.play('dart'), false);
  assert.equal(started.length, before, 'nothing plays while off');
  assert.deepEqual([storage.map.get('river-oaks-game-sounds'), heard], ['off', [false]]);
  assert.equal(createThrowSounds({ storage, AudioContextClass: FakeContext }).enabled(), false, 'the choice is remembered');
  const silent = createThrowSounds({ storage: memory(), AudioContextClass: undefined });
  assert.equal(silent.play('axe-stick'), false);
  const broken = createThrowSounds({ storage: { getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); } }, AudioContextClass: FakeContext });
  assert.equal(broken.enabled(), true, 'blocked storage keeps the default');
  broken.setEnabled(false);
  assert.equal(broken.enabled(), false);
});
