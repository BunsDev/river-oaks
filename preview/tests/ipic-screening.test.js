import test from 'node:test';
import assert from 'node:assert/strict';
import { SCREENING_MEDIA } from '../src/screening-contract.js';
import { SCREENING_SYNC, createScreeningPlayer, createServerClock, pickScreeningSource } from '../src/ipic-screening.js';

const FILM = SCREENING_MEDIA['ipic-fixture-v1'];
const tick = () => new Promise(resolve => setImmediate(resolve));

// A media element double: time advances only while playing, at its playback rate.
function fakeMedia({ canPlay = type => type.startsWith('video/webm') ? 'probably' : 'maybe', play = () => Promise.resolve(), slowSeeks = false } = {}) {
  const listeners = new Map(), calls = { play: 0, pause: 0, load: 0, seeks: [] };
  let time = 0;
  const media = {
    calls, paused: true, playbackRate: 1, muted: true, volume: 1, readyState: 4, src: '', textTracks: [{ mode: 'disabled' }],
    get currentTime() { return time; }, set currentTime(value) { calls.seeks.push(value); time = value; if (slowSeeks) media.seeking = true; },
    // With slowSeeks, a seek stays pending (time frozen, as a decoder works from the keyframe) until landed.
    seeking: false, land() { media.seeking = false; media.emit('seeked'); },
    canPlayType: canPlay,
    // As in browsers, pause() while play() is pending aborts that play() and stays paused.
    play() { calls.play++; const attempt = { aborted: false }; media.attempt = attempt;
      return play().then(() => { if (attempt.aborted) throw Object.assign(new Error('aborted'), { name: 'AbortError' }); media.paused = false; media.emit('playing'); }); },
    pause() { calls.pause++; if (media.attempt) media.attempt.aborted = true; media.paused = true; },
    load() { calls.load++; media.readyState = 0; },
    removeAttribute(key) { if (key === 'src') media.src = ''; },
    addEventListener(type, fn) { (listeners.get(type) ?? listeners.set(type, new Set()).get(type)).add(fn); },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); },
    emit(type) { for (const fn of listeners.get(type) ?? []) fn({ type }); },
    listenerCount: () => [...listeners.values()].reduce((sum, set) => sum + set.size, 0),
    advance(ms) { if (!media.paused && !media.seeking) time += ms / 1000 * media.playbackRate; },
  };
  return media;
}
const view = (more = {}) => ({ venueId: 'ipic', screeningId: 'ipic-e1-1', mediaId: FILM.id, status: 'playing', revision: 1, epoch: 'e1', positionMs: 0, anchorServerTimeMs: 100_000, durationMs: FILM.durationMs, hostId: 'host', ...more });
function setup({ media = fakeMedia(), offset = 0 } = {}) {
  const local = { now: 50_000 };
  const clock = createServerClock({ now: () => local.now });
  clock.observeSync(local.now + offset, local.now, local.now); // a zero-latency sync: server = local + offset
  const player = createScreeningPlayer({ media, clock, now: () => local.now });
  return { media, clock, player, local };
}

test('the player picks the first bundled source the browser can decode, and none is honest', () => {
  assert.equal(pickScreeningSource(FILM, fakeMedia()).type.startsWith('video/webm'), true);
  assert.equal(pickScreeningSource(FILM, fakeMedia({ canPlay: type => type.startsWith('video/mp4') ? 'maybe' : '' })).type.startsWith('video/mp4'), true);
  assert.equal(pickScreeningSource(FILM, fakeMedia({ canPlay: () => '' })), null);
  assert.ok(FILM.sources.every(source => source.src.startsWith('/assets/ipic/screening/')), 'only bundled files, never a URL from the town');
});

test('the server clock prefers a tight round trip over snapshot frames', () => {
  let now = 10_000;
  const clock = createServerClock({ now: () => now });
  clock.observeFrame(80_000, 10_000); // a frame: server time when built, received now (latency unknown)
  assert.equal(clock.serverNow(), 80_000);
  now = 10_100;
  clock.observeSync(80_150, 10_000, 10_100); // sent at 10_000, answered at 10_100: a 100 ms round trip
  assert.equal(clock.serverNow(), 80_150 + 50, 'half the round trip is added to the reply time');
  clock.observeFrame(79_000, 10_100); // a stale frame from a slower edge does not override the sync
  assert.equal(clock.serverNow(), 80_200);
});

test('a late viewer seeks to the running film instead of restarting it', async () => {
  const f = setup({ offset: 54_000 }); // server time 104_000: the film started 4 s ago
  f.player.apply(view());
  f.player.tick(); await tick();
  assert.equal(f.media.calls.play, 1);
  assert.ok(Math.abs(f.media.currentTime * 1000 - 4000) < 1, `seeked to ${f.media.currentTime}`);
  assert.equal(f.player.stats().state, 'playing');
});

test('small drift is nudged with the playback rate; large drift is seeked; the rate settles back', async () => {
  const f = setup({ offset: 52_000 });
  f.player.apply(view()); f.player.tick(); await tick();
  f.media.currentTime = 2.2; // 200 ms ahead of the server
  f.player.tick();
  assert.ok(f.media.playbackRate < 1 && f.media.playbackRate >= 1 - SCREENING_SYNC.maxRateChange, `rate ${f.media.playbackRate}`);
  f.media.currentTime = 2.02; f.player.tick();
  assert.equal(f.media.playbackRate, 1, 'inside the dead band');
  const seeks = f.media.calls.seeks.length;
  f.media.currentTime = 1.0; f.player.tick(); // a full second behind
  assert.equal(f.media.calls.seeks.length, seeks + 2);
  assert.ok(Math.abs(f.media.currentTime - 2.0) < 1e-6);
});

test('a shared pause stops the local film on the paused frame; the end holds the last frame', async () => {
  const f = setup({ offset: 53_000 });
  f.player.apply(view()); f.player.tick(); await tick();
  f.player.apply(view({ status: 'paused', revision: 2, positionMs: 3200, anchorServerTimeMs: 103_200 }));
  f.player.tick();
  assert.equal(f.media.paused, true);
  assert.ok(Math.abs(f.media.currentTime - 3.2) < 1e-6);
  f.player.apply(view({ status: 'ended', revision: 3, positionMs: FILM.durationMs, anchorServerTimeMs: 112_000 }));
  f.player.tick();
  assert.deepEqual([f.media.paused, f.player.stats().state, f.media.currentTime], [true, 'ended', FILM.durationMs / 1000]);
});

test('older revisions are ignored; a new epoch resets', () => {
  const f = setup({ offset: 51_000 });
  f.player.apply(view({ revision: 5 }));
  f.player.apply(view({ revision: 4, status: 'paused', positionMs: 999 }));
  assert.equal(f.player.stats().revision, 5, 'a stale snapshot cannot rewind the film');
  f.player.apply(view({ epoch: 'e2', revision: 6, status: 'stopped', mediaId: null, screeningId: null, positionMs: 0, anchorServerTimeMs: 0, durationMs: 0, hostId: null }));
  assert.deepEqual([f.player.stats().epoch, f.player.stats().sharedStatus], ['e2', 'stopped']);
});

test('autoplay denial waits for a gesture without retry loops or a shared change', async () => {
  let deny = true;
  const media = fakeMedia({ play: () => deny ? Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' })) : Promise.resolve() });
  const f = setup({ media, offset: 51_000 });
  f.player.apply(view()); f.player.tick(); await tick();
  assert.equal(f.player.stats().state, 'blocked');
  f.player.tick(); f.player.tick(); await tick();
  assert.equal(media.calls.play, 1, 'no automatic retries');
  assert.equal(f.player.stats().sharedStatus, 'playing', 'one viewer’s autoplay policy does not touch the shared film');
  deny = false;
  await f.player.unlock(); await tick();
  assert.equal(f.player.stats().state, 'playing');
});

test('a media error offers retry, and an unsupported film says so', async () => {
  const f = setup({ offset: 51_000 });
  f.player.apply(view()); f.player.tick(); await tick();
  f.media.emit('error');
  assert.equal(f.player.stats().state, 'error');
  const loads = f.media.calls.load;
  f.player.retry();
  assert.equal(f.media.calls.load, loads + 1);
  assert.equal(f.player.stats().state, 'loading');
  const none = setup({ media: fakeMedia({ canPlay: () => '' }), offset: 51_000 });
  none.player.apply(view());
  assert.equal(none.player.stats().state, 'unsupported');
  none.player.tick(); await tick();
  assert.equal(none.media.calls.play, 0);
});

test('dispose stops and releases the film; a late play promise cannot revive it', async () => {
  let resolve;
  const media = fakeMedia({ play: () => new Promise(r => { resolve = r; }) });
  const f = setup({ media, offset: 51_000 });
  f.player.apply(view()); f.player.tick();
  f.player.dispose();
  resolve(); await tick();
  assert.equal(f.player.stats().state, 'disposed');
  assert.equal(media.src, '');
  assert.equal(media.listenerCount(), 0);
  assert.equal(media.paused, true);
  f.player.apply(view({ revision: 9 })); f.player.tick();
  assert.equal(media.calls.play, 1, 'nothing plays after dispose');
});

test('two viewers with skewed clocks and late frames converge within 500 ms in 5 s', async () => {
  // Local profile: viewer A's clock estimate is 120 ms behind the server and viewer B's is
  // 90 ms ahead; both start more than 0.9 s off the shared position. Ticks every 50 ms.
  const viewers = [{ offset: 54_000 - 120 }, { offset: 54_000 + 90 }].map(({ offset }) => setup({ offset }));
  for (const [i, v] of viewers.entries()) { v.player.apply(view()); v.player.tick(); await tick(); v.media.currentTime = i ? 4.9 : 3.1; }
  const samples = [];
  for (let ms = 0; ms <= 5000; ms += 50) {
    for (const v of viewers) { v.local.now += 50; v.media.advance(50); v.player.tick(); }
    samples.push(Math.abs(viewers[0].media.currentTime - viewers[1].media.currentTime) * 1000);
  }
  assert.ok(samples.at(-1) < 500, `final spread ${samples.at(-1)} ms`);
  assert.ok(samples.slice(-20).every(spread => spread < 500), 'stays converged');
});

test('a shared pause that aborts a pending play is not an error', async () => {
  let resolve;
  const media = fakeMedia({ play: () => new Promise(r => { resolve = r; }) });
  const f = setup({ media, offset: 51_000 });
  f.player.apply(view()); f.player.tick();
  f.player.apply(view({ status: 'paused', revision: 2, positionMs: 1000, anchorServerTimeMs: 101_000 })); f.player.tick();
  assert.equal(media.attempt.aborted, true, 'the shared pause aborts the pending play at once');
  resolve(); await tick(); await tick();
  assert.deepEqual([f.player.stats().state, media.paused], ['paused', true], 'the pending play was aborted, not started');
});

test('the film keeps its aspect on the wide IPIC screen: pillarboxed, never stretched', async () => {
  const { fitVideoToScreen } = await import('../src/ipic-screening.js');
  const wide = fitVideoToScreen(16 / 9, 9.8 / 3.25);
  assert.ok(Math.abs(wide.repeat[0] - (9.8 / 3.25) / (16 / 9)) < 1e-9 && wide.repeat[1] === 1);
  assert.ok(Math.abs(wide.offset[0] + (wide.repeat[0] - 1) / 2) < 1e-9 && wide.offset[1] === 0, 'centred');
  // The visible video spans exactly its own aspect: u in [l, r] maps to texture 0..1.
  const l = -wide.offset[0] / wide.repeat[0], r = (1 - wide.offset[0]) / wide.repeat[0];
  assert.ok(Math.abs((r - l) * (9.8 / 3.25) - 16 / 9) < 1e-9);
  const tall = fitVideoToScreen(4, 2);
  assert.deepEqual([tall.repeat[0], tall.offset[0]], [1, 0]);
  assert.ok(tall.repeat[1] === 2 && tall.offset[1] === -0.5, 'letterboxed top and bottom');
  assert.deepEqual(fitVideoToScreen(Number.NaN, 3), { repeat: [1, 1], offset: [0, 0] }, 'unknown size maps plainly until metadata arrives');
});

test('captions come from the active cues of a tracked track, because the video itself is never shown', () => {
  // The film reaches the screen as texture frames; a browser draws cues only on a visible video
  // element, so the panel must render them. 'hidden' keeps the cues tracked without drawing them.
  const media = fakeMedia(), track = media.textTracks[0];
  const { player } = setup({ media });
  player.setCaptions(true);
  assert.equal(track.mode, 'hidden');
  track.activeCues = [{ text: 'Fixture clip: a test pattern' }, { text: 'for shared playback.' }];
  assert.equal(player.captionText(), 'Fixture clip: a test pattern\nfor shared playback.');
  player.setCaptions(false);
  assert.equal(track.mode, 'disabled');
  assert.equal(player.captionText(), '', 'captions off shows nothing');
  player.setCaptions(true); track.activeCues = [];
  assert.equal(player.captionText(), '', 'between cues shows nothing');
  player.dispose();
  assert.equal(player.captionText(), '');
});

// Found by the #368 soak on main (2026-10-15): with the short's 2 s keyframes a loaded decoder took
// 0.3-1.2 s per seek. Each seek landed that far behind, past the 400 ms threshold, so the next tick
// seeked again, and a tick during a pending seek abandoned it: the viewer froze for up to 1.2 s.
test('a slow seek is never re-issued while pending, and the next seek aims ahead by the time seeks take', async () => {
  const f = setup({ media: fakeMedia({ slowSeeks: true }), offset: 52_000 });
  const seeks = () => f.media.calls.seeks.length;
  f.player.apply(view()); f.player.tick(); await tick(); // late join: seeks to 2.0 s, nothing measured yet
  assert.ok(Math.abs(f.media.currentTime - 2.0) < 1e-6, `late join aims at the target: ${f.media.currentTime}`);
  // The decoder takes 800 ms; the shared film runs on and no tick may seek again meanwhile.
  const pending = seeks();
  for (let i = 0; i < 8; i++) { f.local.now += 100; f.player.tick(); }
  assert.equal(seeks(), pending, 'no second seek while the first is pending');
  f.media.land();
  // It landed 800 ms behind; the correction seeks once, aiming 800 ms past the target of 2.8 s.
  f.player.tick();
  assert.equal(seeks(), pending + 1);
  assert.ok(Math.abs(f.media.currentTime - 3.6) < 0.05, `aimed ${f.media.currentTime} for 2.8 s plus the measured 0.8 s`);
  // That seek also takes 800 ms and lands on the shared position: nothing more is needed.
  f.local.now += 800; f.media.land(); f.player.tick();
  assert.equal(seeks(), pending + 1, 'landed in step: no further seek');
  assert.ok(Math.abs(f.player.stats().driftMs) < 50, `drift ${f.player.stats().driftMs}`);
});

// The first version adopted the slowest recent seek at once; under swinging load the next seek was
// faster and the viewer landed up to 1.3 s ahead (A/B on main, 2026-10-15). The lead is the fastest
// of the last few seeks, so a seek lands on the target or a little behind, never ahead.
test('one slow seek does not push the aim ahead: the lead is the fastest of the recent seeks', async () => {
  const f = setup({ media: fakeMedia({ slowSeeks: true }), offset: 52_000 });
  const seekBehind = async (ms, behindS) => { f.media.currentTime = f.media.currentTime - behindS; f.media.land(); f.player.tick(); f.local.now += ms; f.media.land(); };
  f.player.apply(view()); f.player.tick(); await tick(); f.local.now += 200; f.media.land(); // a 200 ms seek
  await seekBehind(1200, 1); // then a 1.2 s one
  const at = () => (f.local.now + 52_000 - 100_000) / 1000;
  f.media.currentTime = at() - 1; f.media.land(); f.player.tick();
  assert.ok(f.media.currentTime - at() <= 0.2 + 1e-6, `aimed ${(f.media.currentTime - at()).toFixed(3)} s ahead; the fastest recent seek was 0.2 s`);
});

test('a seek that never lands is retried after the timeout, and the lead stays bounded', async () => {
  const f = setup({ media: fakeMedia({ slowSeeks: true }), offset: 52_000 });
  f.player.apply(view()); f.player.tick(); await tick(); f.media.land();
  f.media.currentTime = 0.5; f.media.land();
  const seeks = f.media.calls.seeks.length;
  f.player.tick(); // seeks; the decoder never answers
  f.local.now += SCREENING_SYNC.seekTimeoutMs + 1; f.player.tick();
  assert.equal(f.media.calls.seeks.length, seeks + 2, 'retried after the timeout');
  // A very slow measured seek never pushes the aim past the cap.
  f.local.now += 10_000; f.media.land(); f.media.currentTime = 1.0; f.media.land(); f.player.tick();
  assert.ok(f.media.currentTime * 1000 - (2_000 + SCREENING_SYNC.seekTimeoutMs + 1 + 10_000) <= SCREENING_SYNC.maxSeekLeadMs + 1, `aim ${f.media.currentTime}`);
});
