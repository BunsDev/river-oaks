// Client playback for venue screenings (#367). The town owns the timeline (#366,
// server/screenings.js); this module only follows it. It projects the shared position
// from the latest snapshot and an estimate of server time, keeps one local media element
// within a few hundred milliseconds of it, and reports what this viewer's decoder is
// actually doing (loading, playing, buffering, blocked, error) separately from the shared
// status. Nothing here sends a command or changes the shared film: autoplay denial,
// decoder errors and buffering stay local to this viewer.
import { SCREENING_MEDIA, screeningPositionAt, screeningStatusAt } from './screening-contract.js';

// Correction profile: inside the dead band nothing changes; up to the seek threshold the
// playback rate is nudged (at most 8 %, so pitch stays natural); beyond it the film seeks.
export const SCREENING_SYNC = Object.freeze({ deadBandMs: 40, seekMs: 400, maxRateChange: 0.08, rateGainPerMs: 0.0004, frameUncertaintyMs: 250, samples: 16 });

// Texture mapping that keeps the film's aspect on the screen: a narrower film is
// pillarboxed and a wider one letterboxed. The screen draws the black mattes itself
// (ipic-screening-screen.js), so a film needs no border of its own.
export function fitVideoToScreen(videoAspect, screenAspect) {
  if (!(videoAspect > 0) || !(screenAspect > 0)) return { repeat: [1, 1], offset: [0, 0] };
  const x = Math.max(1, screenAspect / videoAspect), y = Math.max(1, videoAspect / screenAspect);
  return { repeat: [x, y], offset: [(1 - x) / 2, (1 - y) / 2] };
}

// The bundled sources this browser says it may decode, in catalog order. canPlayType is a hint,
// not a decode: the player still tries each one, once per load attempt (#498).
export function screeningSources(media, element) {
  return media?.sources?.filter(source => ['probably', 'maybe'].includes(element.canPlayType(source.type))) ?? [];
}
export function pickScreeningSource(media, element) {
  return screeningSources(media, element)[0] ?? null;
}

// How long a load or a buffer may sit without progress before the viewer is told and offered
// Retry (a new attempt from the first encoding) instead of an endless spinner.
export const SCREENING_LOAD = Object.freeze({ stallMs: 30_000 });
// MediaError codes: 1 aborted (our own reload or switch), 2 network, 3 decode, 4 source not supported.
const MEDIA_ERR = Object.freeze({ ABORTED: 1, NETWORK: 2 });

// Server time estimate. A sync reply measured over a round trip is accurate to half that
// trip; a snapshot frame only bounds it (its age and latency are unknown). The estimate
// uses the most certain recent sample.
export function createServerClock({ now = () => performance.now() } = {}) {
  const samples = [];
  const add = (offset, uncertainty) => { samples.push({ offset, uncertainty }); if (samples.length > SCREENING_SYNC.samples) samples.shift(); };
  const best = () => samples.reduce((a, b) => (b.uncertainty <= a.uncertainty ? b : a), samples[0]);
  return {
    observeFrame(serverTimeMs, receivedAt = now()) { if (Number.isFinite(serverTimeMs)) add(serverTimeMs - receivedAt, SCREENING_SYNC.frameUncertaintyMs); },
    observeSync(serverTimeMs, sentAt, receivedAt = now()) {
      const rtt = receivedAt - sentAt;
      if (Number.isFinite(serverTimeMs) && rtt >= 0) add(serverTimeMs + rtt / 2 - receivedAt, rtt / 2);
    },
    get ready() { return samples.length > 0; },
    get offset() { return samples.length ? best().offset : 0; },
    serverNow() { return now() + (samples.length ? best().offset : 0); },
  };
}

// local states: idle (nothing showing), loading, ready, playing, buffering, paused, ended,
// blocked (autoplay needs a gesture), error, unsupported (no playable source), disposed.
// failure says why this viewer cannot watch: autoplay (needs a gesture), decode (no encoding
// played), network (the download failed), stalled (no progress for SCREENING_LOAD.stallMs),
// playback (anything else play() refused), unknown (a film this version has no entry for, #499),
// or null.
//
// Each element load (a new film, a fallback encoding, Retry, a stop) starts a new generation;
// a play() promise or a frame callback from an earlier generation changes nothing (#498).
// catalog is SCREENING_MEDIA; only test pages pass their own (preview/e2e/fixtures/ipic-screen.js).
export function createScreeningPlayer({ media: element, clock, onChange = () => {}, now = () => performance.now(), catalog = SCREENING_MEDIA }) {
  let shared = null, mediaId = null, state = 'idle', generation = 0, playing = null, rate = 1, drift = 0, measured = 0, captions = false;
  let attempt = null, failure = null, presented = null, frameRequest = 0, progressAt = now();
  const set = next => { if (state !== next) { state = next; progressAt = now(); onChange(stats()); } };
  const decoded = () => { if (attempt?.current?.result === 'loading') attempt.current.result = 'decoded'; };
  const listeners = {
    playing: () => { decoded(); if (shared?.status === 'playing' && !['blocked', 'error'].includes(state)) set('playing'); },
    waiting: () => { if (shared?.status === 'playing' && state === 'playing') set('buffering'); },
    canplay: () => { decoded(); if (state === 'loading') set('ready'); },
    progress: () => { progressAt = now(); },
    error: () => {
      const code = element.error?.code;
      // Our own reload, switch or stop aborts the old resource: that is not a failure.
      if (code === MEDIA_ERR.ABORTED || !attempt?.current || state === 'idle') return;
      // A failed download is not the codec's fault: report it rather than trying another encoding.
      if (code === MEDIA_ERR.NETWORK || globalThis.navigator?.onLine === false) return fail('network');
      attempt.current.result = 'decode';
      if (!next()) fail('decode');
    },
  };
  for (const [type, fn] of Object.entries(listeners)) element.addEventListener(type, fn);

  // Frames the compositor actually presented, from requestVideoFrameCallback where the browser has
  // it. A callback asked for under an earlier generation belongs to the previous film or source.
  function watchFrames() {
    if (typeof element.requestVideoFrameCallback !== 'function' || state === 'disposed') return;
    const token = generation;
    frameRequest = element.requestVideoFrameCallback((at, meta) => {
      frameRequest = 0;
      if (state === 'disposed') return;
      if (token === generation && meta) presented = { mediaTimeMs: Math.round(meta.mediaTime * 1000), frames: meta.presentedFrames, at, generation };
      watchFrames();
    });
  }
  function fail(reason) {
    playing = null; failure = reason;
    if (attempt?.current?.result === 'loading') attempt.current.result = reason;
    set(reason === 'autoplay' ? 'blocked' : 'error');
  }
  function reset() {
    generation++; playing = null; presented = null; element.pause();
    // Ask for frames again under the new generation; the old request belongs to the previous source.
    if (frameRequest) element.cancelVideoFrameCallback?.(frameRequest);
    frameRequest = 0; watchFrames();
  }
  // The next encoding of this attempt, each at most once; false when none is left.
  function next() {
    const source = attempt.sources[attempt.tried.length];
    if (!source) return false;
    attempt.current = { src: source.src, type: source.type, result: 'loading' }; attempt.tried.push(attempt.current);
    // load() resets the element (readyState 0) and aborts its pending play(); canplay moves it to ready.
    reset(); element.src = source.src; element.load(); set('loading'); progressAt = now();
    return true;
  }
  function load(id) {
    mediaId = id; failure = null;
    attempt = { sources: screeningSources(catalog[id], element), tried: [], current: null };
    if (!next()) { reset(); element.removeAttribute('src'); element.load(); set('unsupported'); }
  }
  // Nothing is showing: release the decoder rather than keep a paused film loaded.
  function unload() {
    mediaId = null; attempt = null; failure = null;
    if (element.src) { reset(); element.removeAttribute('src'); element.load(); }
    set('idle');
  }
  function play() {
    const token = generation;
    // Call play() now, not in a later task, so dispose() can never be followed by a start.
    let started;
    try { started = Promise.resolve(element.play()); } catch (error) { started = Promise.reject(error); }
    playing = started.then(
      () => { if (token === generation) { playing = null; if (shared?.status === 'playing') set('playing'); } },
      error => {
        if (token !== generation) return;
        playing = null;
        // A pause (shared or ours) aborts a pending play; that is not a playback failure. A source
        // that cannot load also refuses play(); its error event decides what happens next.
        if (error?.name === 'AbortError' || error?.name === 'NotSupportedError') return;
        // Autoplay policy needs a gesture on this device: another encoding would be refused too.
        fail(error?.name === 'NotAllowedError' ? 'autoplay' : 'playback');
      },
    );
    return playing;
  }
  const target = () => screeningPositionAt(shared, clock.serverNow());
  watchFrames();

  return {
    // Shared state from a snapshot: a newer epoch resets; a stale revision is ignored.
    apply(view) {
      if (state === 'disposed' || !view) return;
      if (shared && view.epoch === shared.epoch && view.revision < shared.revision) return;
      shared = { ...view };
      if (shared.mediaId && shared.mediaId !== mediaId) {
        if (Object.hasOwn(catalog, shared.mediaId)) load(shared.mediaId);
        // A film added by a newer build: release the previous film rather than play it under the new
        // film's timeline, and say this version cannot show it.
        else { mediaId = shared.mediaId; attempt = null; reset(); element.removeAttribute('src'); element.load(); failure = 'unknown'; set('unsupported'); }
      }
      if (!shared.mediaId && state !== 'idle') unload();
    },
    tick() {
      // A load or buffer without progress for too long is reported, with Retry, not left spinning.
      if (['loading', 'buffering'].includes(state) && now() - progressAt > SCREENING_LOAD.stallMs) fail('stalled');
      if (!shared?.mediaId || ['disposed', 'unsupported', 'error', 'blocked', 'idle'].includes(state) && !(state === 'idle' && shared?.mediaId)) {
        if (shared?.status !== 'playing' && !element.paused) element.pause();
        return;
      }
      const status = screeningStatusAt(shared, clock.serverNow()), at = target();
      // measured is the drift as sampled, before any correction; drift is reset after a seek request.
      measured = drift = element.currentTime * 1000 - at;
      if (status === 'playing') {
        if (Math.abs(drift) > SCREENING_SYNC.seekMs) { element.currentTime = at / 1000; drift = 0; rate = 1; }
        else if (Math.abs(drift) > SCREENING_SYNC.deadBandMs) rate = 1 - Math.sign(drift) * Math.min(SCREENING_SYNC.maxRateChange, Math.abs(drift) * SCREENING_SYNC.rateGainPerMs);
        else rate = 1;
        element.playbackRate = rate;
        if (element.paused && !playing) {
          if (state !== 'playing') element.currentTime = at / 1000;
          void play();
        }
      } else {
        rate = 1; element.playbackRate = 1;
        // Pause also aborts a play() that has not resolved yet.
        if (!element.paused || playing) element.pause();
        if (Math.abs(drift) > 50) { element.currentTime = at / 1000; drift = 0; }
        // Until a frame has decoded this viewer is still loading, whatever the room's status, so a load
        // that never arrives is reported stalled rather than shown as paused forever.
        if (state === 'loading' && !(element.readyState >= 2)) return;
        set(status === 'ended' ? 'ended' : status === 'paused' ? 'paused' : 'ready');
      }
    },
    // A user gesture: try again after autoplay was refused.
    unlock() { if (state !== 'blocked' && state !== 'ready') return Promise.resolve(); failure = null; set('loading'); return play() ?? Promise.resolve(); },
    // A new bounded attempt: every encoding gets one more try, starting with the first.
    retry() { if (!mediaId || state === 'disposed') return; load(mediaId); },
    setMuted(value) { element.muted = Boolean(value); },
    setVolume(value) { element.volume = Math.max(0, Math.min(1, Number(value) || 0)); },
    // The video is never shown (its frames go to the screen texture), so a browser would draw cues
    // nowhere. 'hidden' keeps them tracked for the panel's caption line; off stops tracking.
    setCaptions(on) { captions = Boolean(on); for (const track of element.textTracks ?? []) track.mode = captions ? 'hidden' : 'disabled'; },
    captionText() {
      if (!captions || state === 'disposed') return '';
      const track = [...(element.textTracks ?? [])].find(item => item.mode === 'hidden');
      return [...(track?.activeCues ?? [])].map(cue => cue.text).join('\n');
    },
    stats,
    dispose() {
      if (state === 'disposed') return;
      generation++; playing = null; presented = null;
      for (const [type, fn] of Object.entries(listeners)) element.removeEventListener(type, fn);
      if (frameRequest) element.cancelVideoFrameCallback?.(frameRequest);
      frameRequest = 0;
      element.pause(); element.removeAttribute('src'); element.load();
      shared = null; mediaId = null; attempt = null; set('disposed');
    },
  };
  function stats() {
    return { state, sharedStatus: shared ? screeningStatusAt(shared, clock.serverNow()) : null, revision: shared?.revision ?? null, epoch: shared?.epoch ?? null,
      mediaId, generation, failure, source: attempt?.current ? { src: attempt.current.src, type: attempt.current.type } : null, attempts: attempt?.tried.map(item => ({ ...item })) ?? [],
      driftMs: Math.round(drift), measuredDriftMs: Math.round(measured), presented: presented && { ...presented }, rate, offsetMs: Math.round(clock.offset) };
  }
}
