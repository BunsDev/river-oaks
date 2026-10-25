// The screening UI's film lifecycle (#498), driven through createIpicScreening with a small DOM double and
// the real three.js: screen binding, captions and transcript follow the shared film; leaving restores the
// screen. Written for the post-merge review of #571 (2026-10-24).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { SCREENING_MEDIA } from '../src/screening-contract.js';
import { createIpicScreening } from '../src/ipic-screening-ui.js';
const ORIGINAL = SCREENING_MEDIA['ipic-original-v1'], TWO = SCREENING_MEDIA['ipic-two-seats-v1'];
const flush = () => new Promise(resolve => setImmediate(resolve));

function element(tag) {
  const listeners = new Map(), attrs = new Map();
  const el = {
    tagName: tag.toUpperCase(), children: [], parent: null, dataset: {}, hidden: false, textContent: '', className: '', id: '',
    style: { setProperty() {}, removeProperty() {} },
    append(...kids) { for (const kid of kids) { kid.parent = el; el.children.push(kid); } },
    replaceChildren(...kids) { el.children = []; el.append(...kids); },
    remove() { if (el.parent) el.parent.children = el.parent.children.filter(c => c !== el); el.parent = null; },
    setAttribute(k, v) { attrs.set(k, String(v)); }, getAttribute(k) { return attrs.get(k) ?? null; },
    removeAttribute(k) { attrs.delete(k); if (k === 'src') el.src = ''; },
    addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type, extra = {}) { for (const fn of [...(listeners.get(type) ?? [])]) fn({ type, target: el, ...extra }); },
    querySelectorAll(sel) { return el.children.filter(c => c.tagName === sel.toUpperCase()); },
    listenerCount: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
  };
  if (tag === 'track') el.track = { mode: 'disabled', activeCues: [] };
  if (tag === 'video') {
    let time = 0;
    Object.assign(el, {
      paused: true, playbackRate: 1, muted: true, volume: 1, readyState: 0, src: '', error: null, videoWidth: 0, videoHeight: 0, seeking: false, HAVE_CURRENT_DATA: 2,
      plays: 0, loads: [],
      canPlayType: type => type.startsWith('video/webm') ? 'probably' : 'maybe',
      play() { el.plays++; const a = { aborted: false }; el.attempt = a; return Promise.resolve().then(() => { if (a.aborted) throw Object.assign(new Error('a'), { name: 'AbortError' }); el.paused = false; el.emit('playing'); }); },
      pause() { if (el.attempt) el.attempt.aborted = true; el.paused = true; },
      load() { el.loads.push(el.src); if (el.attempt) el.attempt.aborted = true; el.paused = true; el.error = null; el.readyState = 0; el.videoWidth = 0; el.videoHeight = 0; time = 0; },
      decode(w, h) { el.videoWidth = w; el.videoHeight = h; el.readyState = 4; el.emit('canplay'); },
    });
    Object.defineProperty(el, 'currentTime', { get: () => time, set: v => { time = v; } });
    Object.defineProperty(el, 'textTracks', { get: () => el.children.filter(c => c.tagName === 'TRACK').map(c => c.track) });
  }
  return el;
}
function harness() {
  const docListeners = element('doc');
  const doc = { createElement: element, defaultView: null, hidden: false, addEventListener: docListeners.addEventListener, removeEventListener: docListeners.removeEventListener };
  const host = element('div');
  const local = { now: 50_000 };
  const replies = [];
  const multiplayer = { connected: true, command: cmd => { const r = replies.shift(); return typeof r === 'function' ? r(cmd) : Promise.resolve(r ?? null); } };
  const material = new THREE.MeshStandardMaterial({ color: '#acb3d6', emissive: '#747fad', emissiveIntensity: 0.6 });
  const screen = { material, aspect: 2.39 };
  const ui = createIpicScreening({ host, THREE, getMultiplayer: () => multiplayer, getVenue: () => ({ active: true, auditorium: true }), getScreen: () => screen, now: () => local.now, doc });
  const video = () => host.children[0]?.children.find(c => c.tagName === 'VIDEO');
  const panel = () => host.children[0];
  return { ui, host, local, replies, screen, video, panel, doc };
}
const view = (film, more = {}) => ({ venueId: 'ipic', screeningId: 'ipic-e1-1', mediaId: film?.id ?? null, status: film ? 'playing' : 'stopped', revision: 1, epoch: 'e1', positionMs: 0, anchorServerTimeMs: 100_000, durationMs: film?.durationMs ?? 0, hostId: 'h', ...more });
const snapshot = screening => ({ serverTimeMs: 100_000, screenings: [screening] });

test('A → B → A: screen, captions and transcript follow the actual film; departure restores the material', async () => {
  const h = harness(), before = { color: h.screen.material.color.getHex(), map: h.screen.material.map, own: Object.keys(h.screen.material).length };
  h.replies.push({ ok: true, screening: view(ORIGINAL), canHost: true, serverTimeMs: 100_000 });
  h.ui.update(); await flush();
  h.video().decode(1280, 720); h.ui.update(); await flush(); h.ui.update();
  assert.equal(h.ui.inspect().state, 'playing');
  const first = h.screen.material.map;
  assert.ok(first?.isVideoTexture);
  h.ui.onSnapshot(snapshot(view(TWO, { screeningId: 'ipic-e1-3', revision: 3 })));
  h.ui.update();
  assert.equal(h.screen.material.map, before.map, 'nothing bound while B loads');
  const tracks = h.video().querySelectorAll('track');
  assert.deepEqual(tracks.map(t => t.src), [TWO.captions.src]);
  assert.equal(tracks[0].track.mode, 'hidden');
  h.video().decode(640, 480); h.ui.update(); await flush(); h.ui.update();
  assert.notEqual(h.screen.material.map, first);
  assert.deepEqual(h.ui.inspect().screen.counts, { created: 2, disposed: 1 });
  h.ui.onSnapshot(snapshot(view(ORIGINAL, { screeningId: 'ipic-e1-5', revision: 5 })));
  h.ui.update();
  assert.deepEqual(h.video().querySelectorAll('track').map(t => t.src), [ORIGINAL.captions.src]);
  h.ui.dispose();
  assert.deepEqual({ color: h.screen.material.color.getHex(), map: h.screen.material.map, own: Object.keys(h.screen.material).length }, before);
  assert.equal(h.host.children.length, 0);
});

test('a replayed host reply (its original, older view) does not set the panel back to the previous film', async () => {
  const h = harness();
  h.replies.push({ ok: true, screening: view(null, { revision: 2 }), canHost: true, serverTimeMs: 100_000 });
  h.ui.update(); await flush(); h.ui.update();
  // Host presses Start for ORIGINAL. The first reply is lost; meanwhile the room moves on (Start applied
  // as rev 3, then the host's Stop rev 4 and another Start of TWO rev 5 from another tab of the host).
  let release;
  h.replies.push(() => new Promise(r => { release = r; }));
  h.replies.push({ ok: true, replayed: true, screening: view(ORIGINAL, { screeningId: 'ipic-e1-3', revision: 3 }), serverTimeMs: 100_000 });
  h.panel().children.find(c => c.tagName === 'DIV' && c.children.some(b => b.dataset?.control === 'host-start'))
    .emit('click', { target: h.panel().children.flatMap(c => c.children ?? []).find(b => b.dataset?.control === 'host-start') });
  h.ui.onSnapshot(snapshot(view(TWO, { screeningId: 'ipic-e1-5', revision: 5 })));
  release(null); await flush(); await flush();
  h.video().decode(1280, 720); h.ui.update(); await flush(); h.ui.update();
  const status = h.panel().children[0].textContent;
  assert.equal(h.ui.inspect().mediaId, TWO.id);
  assert.match(status, new RegExp(TWO.label), `player shows ${h.ui.inspect().mediaId} but the panel says: "${status}"`);
});

test('a seek keeps the film on the screen with its texture, though the element is briefly not ready', async () => {
  const h = harness();
  h.replies.push({ ok: true, screening: view(ORIGINAL), canHost: false, serverTimeMs: 100_000 });
  h.ui.update(); await flush();
  h.video().decode(1280, 720); h.ui.update(); await flush(); h.ui.update();
  const bound = h.screen.material.map, counts = h.ui.inspect().screen.counts;
  assert.ok(bound?.isVideoTexture);
  // Chromium lowers readyState to HAVE_METADATA while a seek is in flight.
  Object.assign(h.video(), { seeking: true, readyState: 1 });
  h.ui.update(); h.ui.update();
  assert.equal(h.screen.material.map, bound, 'the film stays bound while the seek completes');
  assert.deepEqual(h.ui.inspect().screen.counts, counts, 'no texture is replaced');
  Object.assign(h.video(), { seeking: false, readyState: 4 });
  h.ui.update();
  assert.equal(h.screen.material.map, bound);
  // A failure during a seek still releases the screen.
  Object.assign(h.video(), { seeking: true, readyState: 1, error: { code: 3 } }); h.video().emit('error');
  h.video().error = { code: 3 }; h.video().emit('error');
  h.ui.update();
  assert.equal(h.ui.inspect().state, 'error');
  assert.equal(h.ui.inspect().attached, false, 'a failed film leaves the screen');
  h.ui.dispose();
});
