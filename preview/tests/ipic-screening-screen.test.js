import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { IPIC_SCREEN } from '../src/ipic-plan.js';
import { fitVideoToScreen } from '../src/ipic-screening.js';
import { createScreenBinding } from '../src/ipic-screening-screen.js';

// A decoded video element as the binding sees it: a size, a ready state and frame callbacks.
const video = (width, height) => ({
  videoWidth: width, videoHeight: height, readyState: 4, HAVE_CURRENT_DATA: 2, cancelled: 0, callbacks: 0,
  requestVideoFrameCallback() { return ++this.callbacks; }, cancelVideoFrameCallback() { this.cancelled++; },
});
// The auditorium screen as store-interiors.js publishes it: IPIC's own material and the screen's aspect.
function screen() {
  const material = new THREE.MeshStandardMaterial({ color: '#acb3d6', emissive: '#747fad', emissiveIntensity: 0.6, roughness: 1 });
  material.name = 'ipic-cinema-screen';
  return { material, aspect: IPIC_SCREEN.width / IPIC_SCREEN.height };
}
// Every property the material has, own or inherited behaviour included, apart from its version counter.
function snapshot(material) {
  const value = v => (v?.isColor ? v.getHex() : v?.isVector2 ? v.toArray() : v);
  const props = Object.fromEntries(Object.entries(material).filter(([key]) => key !== 'version').map(([key, v]) => [key, value(v)]));
  return { props, ownCompile: Object.hasOwn(material, 'onBeforeCompile'), ownKey: Object.hasOwn(material, 'customProgramCacheKey'), key: material.customProgramCacheKey() };
}
const disposed = texture => { const seen = { value: false }; texture.addEventListener('dispose', () => { seen.value = true; }); return seen; };

test('the film gets its own texture, fitted to the screen at the film’s aspect', () => {
  const s = screen(), v = video(1280, 720), binding = createScreenBinding({ THREE });
  binding.sync({ screen: s, video: v, key: 'g1:1280x720', show: true });
  const texture = s.material.map;
  assert.ok(texture?.isVideoTexture && s.material.emissiveMap === texture, 'the film is the screen’s map and emission');
  const fit = fitVideoToScreen(16 / 9, s.aspect);
  assert.deepEqual(texture.repeat.toArray(), fit.repeat);
  assert.deepEqual(texture.offset.toArray(), fit.offset);
  assert.notEqual(s.material.customProgramCacheKey(), screen().material.customProgramCacheKey(), 'the screen draws its own mattes while a film shows');
  binding.sync({ screen: s, video: v, key: 'g1:1280x720', show: true });
  assert.equal(s.material.map, texture, 'the same source and size keep the same texture');
  assert.deepEqual(binding.inspect().counts, { created: 1, disposed: 0 });
});

test('a new source or decoded size gets a new texture and fit; the old one is released', () => {
  const s = screen(), wide = video(1280, 720), square = video(640, 480), binding = createScreenBinding({ THREE });
  binding.sync({ screen: s, video: wide, key: 'g1:1280x720', show: true });
  const first = s.material.map, firstDisposed = disposed(first);
  binding.sync({ screen: s, video: square, key: 'g2:640x480', show: true });
  const second = s.material.map;
  assert.ok(second?.isVideoTexture && second !== first, 'a new texture for the new size');
  assert.equal(firstDisposed.value, true, 'the old texture is disposed');
  assert.equal(wide.cancelled, 1, 'and its frame callback cancelled');
  assert.deepEqual(second.repeat.toArray(), fitVideoToScreen(4 / 3, s.aspect).repeat, '4:3 is pillarboxed at its own aspect');
  assert.deepEqual(binding.inspect().counts, { created: 2, disposed: 1 });
  assert.deepEqual([binding.inspect().width, binding.inspect().height], [640, 480]);
});

test('nothing stays on the screen while a replacement loads, and leaving restores the screen exactly', () => {
  const s = screen(), binding = createScreenBinding({ THREE }), before = snapshot(s.material);
  binding.sync({ screen: s, video: video(1280, 720), key: 'g1:1280x720', show: true });
  // The next film is loading: no decoded frame of it yet, so the old film's frame must not stand in for it.
  binding.sync({ screen: s, video: video(0, 0), key: 'g2:0x0', show: false });
  assert.deepEqual(snapshot(s.material), before, 'the screen is its own idle self again');
  assert.equal(binding.inspect().key, null);
  binding.sync({ screen: s, video: video(640, 360), key: 'g2:640x360', show: true });
  assert.ok(s.material.map?.isVideoTexture);
  binding.release();
  assert.deepEqual(snapshot(s.material), before, 'leaving restores every property, including shader hooks');
  assert.deepEqual(binding.inspect().counts, { created: 2, disposed: 2 });
  binding.release();
  assert.deepEqual(binding.inspect().counts, { created: 2, disposed: 2 }, 'releasing twice is harmless');
});

test('a rebuilt world’s new screen takes the film, and the old screen is restored first', () => {
  const old = screen(), rebuilt = screen(), binding = createScreenBinding({ THREE }), before = snapshot(old.material);
  binding.sync({ screen: old, video: video(1280, 720), key: 'g1:1280x720', show: true });
  binding.sync({ screen: rebuilt, video: video(1280, 720), key: 'g1:1280x720', show: true });
  assert.deepEqual(snapshot(old.material), before);
  assert.ok(rebuilt.material.map?.isVideoTexture);
  binding.sync({ screen: null, video: video(1280, 720), key: 'g1:1280x720', show: true });
  assert.equal(rebuilt.material.map, null, 'no screen: nothing is bound');
});

test('a paused film’s frame reaches the screen: uploaded on binding and after each paused seek', () => {
  // three.js uploads a VideoTexture when requestVideoFrameCallback fires, and a paused element that has
  // just loaded or seeked presents no new frame: without these uploads a viewer joining a paused film, or
  // one whose autoplay was refused, sees a black screen though the element holds the frame.
  const s = screen(), v = Object.assign(video(1280, 720), { paused: true, seeking: false, currentTime: 2 }), binding = createScreenBinding({ THREE });
  binding.sync({ screen: s, video: v, key: 'g1:1280x720', show: true });
  const texture = s.material.map, first = texture.version;
  assert.ok(first > 0, 'the bound frame is uploaded at once');
  binding.sync({ screen: s, video: v, key: 'g1:1280x720', show: true });
  assert.equal(texture.version, first, 'an unchanged paused frame is not uploaded again');
  v.currentTime = 2.3; v.seeking = true;
  binding.sync({ screen: s, video: v, key: 'g1:1280x720', show: true });
  assert.equal(texture.version, first, 'not while the seek is still in flight');
  v.seeking = false;
  binding.sync({ screen: s, video: v, key: 'g1:1280x720', show: true });
  assert.ok(texture.version > first, 'the seeked paused frame is uploaded');
  const playing = texture.version; v.paused = false; v.currentTime = 2.5;
  binding.sync({ screen: s, video: v, key: 'g1:1280x720', show: true });
  assert.equal(texture.version, playing, 'while playing, frame callbacks upload frames');
});
