import test from 'node:test';
import assert from 'node:assert/strict';
import { startArtRotation, ROTATION_MS, CLIP_LIMIT_MS } from '../src/access-art-rotation.js';

// The smallest DOM the rotation touches: slides with attributes and a data-src,
// one clip that records play/pause, a pause button and a visibility source.
class Node {
  constructor(tagName, attributes = {}) { this.tagName = tagName; this.attributes = new Map(Object.entries(attributes)); this.dataset = {}; this.listeners = {}; this.hidden = false; }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  removeAttribute(name) { this.attributes.delete(name); }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] ?? []).filter(item => item !== fn); }
  dispatch(type) { for (const fn of this.listeners[type] ?? []) fn(); }
}
class Clip extends Node {
  constructor(attributes) { super('VIDEO', attributes); this.plays = 0; this.paused = true; this.refuse = false; this.currentTime = 3; }
  play() { this.plays++; this.paused = false; return this.refuse ? Promise.reject(new Error('NotAllowedError')) : Promise.resolve(); }
  pause() { this.paused = true; }
}
function scene({ clipAt = 1, count = 4 } = {}) {
  const slides = Array.from({ length: count }, (_, i) => {
    const slide = i === clipAt ? new Clip() : new Node('IMG');
    if (i === 0) { slide.setAttribute('data-active', ''); slide.setAttribute('src', 'slide-0'); }
    else slide.dataset.src = `slide-${i}`;
    return slide;
  });
  const button = new Node('BUTTON'), doc = new Node('DOC');
  doc.hidden = false;
  return { slides, button, doc, root: { querySelectorAll: () => slides, querySelector: () => button } };
}
const active = slides => slides.findIndex(slide => slide.hasAttribute('data-active'));
const flush = () => new Promise(resolve => setImmediate(resolve));

test('stills crossfade on the interval and later slides load only just before they show', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { slides, doc, root } = scene({ clipAt: -1 });
  const rotation = startArtRotation(root, { doc, reducedMotion: { matches: false } });
  assert.equal(slides[1].getAttribute('src'), 'slide-1', 'the next slide is ready before the first crossfade');
  assert.equal(slides[2].getAttribute('src'), null, 'slides further ahead wait');
  t.mock.timers.tick(ROTATION_MS - 1); assert.equal(active(slides), 0);
  t.mock.timers.tick(1); assert.equal(active(slides), 1);
  assert.equal(slides[2].getAttribute('src'), 'slide-2');
  assert.equal(slides.filter(slide => slide.hasAttribute('data-active')).length, 1, 'one slide shows at a time');
  assert.equal(slides[1].getAttribute('aria-hidden'), 'false'); assert.equal(slides[0].getAttribute('aria-hidden'), 'true');
  for (let i = 0; i < 3; i++) t.mock.timers.tick(ROTATION_MS); // one tick per crossfade
  assert.equal(active(slides), 0, 'it wraps around');
  rotation.stop();
});

test('the clip plays once from the start and hands on when it ends', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { slides, doc, root } = scene({ clipAt: 1 });
  startArtRotation(root, { doc, reducedMotion: { matches: false } });
  assert.equal(slides[1].preload, 'auto', 'the upcoming clip starts loading early');
  t.mock.timers.tick(ROTATION_MS);
  assert.equal(active(slides), 1); assert.equal(slides[1].plays, 1); assert.equal(slides[1].currentTime, 0);
  t.mock.timers.tick(ROTATION_MS * 1.5); assert.equal(active(slides), 1, 'a playing clip is not cut off by the still interval');
  slides[1].onended(); assert.equal(active(slides), 2); assert.equal(slides[1].paused, true);
});

test('a clip that never ends, or cannot autoplay, still moves on', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const stalled = scene({ clipAt: 1 });
  startArtRotation(stalled.root, { doc: stalled.doc, reducedMotion: { matches: false } });
  t.mock.timers.tick(ROTATION_MS); t.mock.timers.tick(CLIP_LIMIT_MS);
  assert.equal(active(stalled.slides), 2);
  const refused = scene({ clipAt: 1 });
  refused.slides[1].refuse = true;
  startArtRotation(refused.root, { doc: refused.doc, reducedMotion: { matches: false } });
  t.mock.timers.tick(ROTATION_MS); await flush();
  t.mock.timers.tick(ROTATION_MS); assert.equal(active(refused.slides), 2, 'the poster stands in for a still');
});

test('reduced motion keeps the first still and hides the pause control', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { slides, button, doc, root } = scene();
  startArtRotation(root, { doc, reducedMotion: { matches: true } });
  t.mock.timers.tick(ROTATION_MS * 5);
  assert.equal(active(slides), 0); assert.equal(slides[1].plays, 0); assert.equal(button.hidden, true);
  assert.equal(slides.filter(slide => slide.getAttribute('src')).length, 1, 'later slides and the clip are never fetched');
});

test('pause stops the rotation and play resumes it', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { slides, button, doc, root } = scene({ clipAt: -1 });
  startArtRotation(root, { doc, reducedMotion: { matches: false } });
  assert.equal(button.hidden, false);
  button.dispatch('click');
  assert.equal(button.getAttribute('aria-pressed'), 'true'); assert.equal(button.getAttribute('aria-label'), 'Play the background art');
  t.mock.timers.tick(ROTATION_MS * 3); assert.equal(active(slides), 0);
  button.dispatch('click'); t.mock.timers.tick(ROTATION_MS); assert.equal(active(slides), 1);
});

test('nothing runs while the tab is hidden or the gate is closed', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let open = true;
  const { slides, doc, root } = scene({ clipAt: 1 });
  const rotation = startArtRotation(root, { doc, reducedMotion: { matches: false }, isOpen: () => open });
  doc.hidden = true; doc.dispatch('visibilitychange');
  t.mock.timers.tick(ROTATION_MS * 3); assert.equal(active(slides), 0);
  doc.hidden = false; doc.dispatch('visibilitychange');
  t.mock.timers.tick(ROTATION_MS); assert.equal(slides[1].plays, 1);
  open = false; rotation.sync();
  assert.equal(slides[1].paused, true, 'closing the gate stops the clip');
  t.mock.timers.tick(CLIP_LIMIT_MS * 2); assert.equal(active(slides), 1);
});

test('a single slide never starts a rotation', t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { slides, doc, root } = scene({ clipAt: -1, count: 1 });
  startArtRotation(root, { doc, reducedMotion: { matches: false } });
  t.mock.timers.tick(ROTATION_MS * 2); assert.equal(active(slides), 0);
});
