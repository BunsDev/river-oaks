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
// A seek decodes from the nearest keyframe, which a slow or busy decoder can take longer than the
// threshold to do. So a pending seek is never re-issued (until seekTimeoutMs), and each seek aims
// ahead by the fastest of the last seekHistory seeks (capped at maxSeekLeadMs); otherwise every seek
// lands behind by its own duration and the next tick seeks again, freezing the film. The fastest,
// not the latest: seek times swing with load, and a lead from a slow seek lands the next one ahead.
export const SCREENING_SYNC = Object.freeze({ deadBandMs: 40, seekMs: 400, maxRateChange: 0.08, rateGainPerMs: 0.0004, frameUncertaintyMs: 250, samples: 16, seekTimeoutMs: 3000, maxSeekLeadMs: 1500, seekHistory: 3 });

// Texture mapping that keeps the film's aspect on the screen: a narrower film is
// pillarboxed and a wider one letterboxed (with clamped edges; the media carries a black border).
export function fitVideoToScreen(videoAspect, screenAspect) {
  if (!(videoAspect > 0) || !(screenAspect > 0)) return { repeat: [1, 1], offset: [0, 0] };
  const x = Math.max(1, screenAspect / videoAspect), y = Math.max(1, videoAspect / screenAspect);
  return { repeat: [x, y], offset: [(1 - x) / 2, (1 - y) / 2] };
}

export function pickScreeningSource(media, element) {
  return media?.sources?.find(source => ['probably', 'maybe'].includes(element.canPlayType(source.type))) ?? null;
}

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
export function createScreeningPlayer({ media: element, clock, onChange = () => {}, now = () => performance.now() }) {
  let shared = null, mediaId = null, state = 'idle', generation = 0, playing = null, rate = 1, drift = 0, captions = false;
  let seekStartedAt = null;
  const seekTimes = [];
  const seekLead = () => (seekTimes.length ? Math.min(SCREENING_SYNC.maxSeekLeadMs, ...seekTimes) : 0);
  const set = next => { if (state !== next) { state = next; onChange(stats()); } };
  const listeners = {
    playing: () => { if (shared?.status === 'playing' && !['blocked', 'error'].includes(state)) set('playing'); },
    waiting: () => { if (shared?.status === 'playing' && state === 'playing') set('buffering'); },
    canplay: () => { if (state === 'loading') set('ready'); },
    error: () => { playing = null; set('error'); },
    // How long the decoder took to land our seek; the last few are kept.
    seeked: () => {
      if (seekStartedAt === null) return;
      seekTimes.push(Math.max(0, now() - seekStartedAt)); seekStartedAt = null;
      if (seekTimes.length > SCREENING_SYNC.seekHistory) seekTimes.shift();
    },
  };
  const seekTo = (ms, lead = 0) => {
    element.currentTime = Math.max(0, Math.min(shared?.durationMs ?? Infinity, ms + lead)) / 1000;
    seekStartedAt = now();
  };
  // A seek is still being decoded; one that has not landed within seekTimeoutMs is given up on.
  const seekPending = () => Boolean(element.seeking) && seekStartedAt !== null && now() - seekStartedAt < SCREENING_SYNC.seekTimeoutMs;
  for (const [type, fn] of Object.entries(listeners)) element.addEventListener(type, fn);

  function load(id) {
    mediaId = id; playing = null;
    const media = SCREENING_MEDIA[id], source = pickScreeningSource(media, element);
    if (!source) { element.removeAttribute('src'); set('unsupported'); return; }
    // load() resets the element (readyState 0); canplay moves it to ready.
    element.src = source.src; element.load(); set('loading');
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
        // A pause (shared or ours) aborts a pending play; that is not a playback failure.
        if (error?.name === 'AbortError') return;
        set(error?.name === 'NotAllowedError' ? 'blocked' : 'error');
      },
    );
    return playing;
  }
  const target = () => screeningPositionAt(shared, clock.serverNow());

  return {
    // Shared state from a snapshot: a newer epoch resets; a stale revision is ignored.
    apply(view) {
      if (state === 'disposed' || !view) return;
      if (shared && view.epoch === shared.epoch && view.revision < shared.revision) return;
      shared = { ...view };
      if (shared.mediaId && shared.mediaId !== mediaId && Object.hasOwn(SCREENING_MEDIA, shared.mediaId)) load(shared.mediaId);
      if (!shared.mediaId) { mediaId = null; set('idle'); }
    },
    tick() {
      if (!shared?.mediaId || ['disposed', 'unsupported', 'error', 'blocked', 'idle'].includes(state) && !(state === 'idle' && shared?.mediaId)) {
        if (shared?.status !== 'playing' && !element.paused) element.pause();
        return;
      }
      const status = screeningStatusAt(shared, clock.serverNow()), at = target();
      drift = element.currentTime * 1000 - at;
      if (status === 'playing') {
        if (seekPending()) rate = 1; // the frame is frozen until the seek lands; correcting now would abandon it
        else if (Math.abs(drift) > SCREENING_SYNC.seekMs) { seekTo(at, seekLead()); drift = 0; rate = 1; }
        else if (Math.abs(drift) > SCREENING_SYNC.deadBandMs) rate = 1 - Math.sign(drift) * Math.min(SCREENING_SYNC.maxRateChange, Math.abs(drift) * SCREENING_SYNC.rateGainPerMs);
        else rate = 1;
        element.playbackRate = rate;
        if (element.paused && !playing) {
          if (state !== 'playing' && !seekPending()) seekTo(at);
          void play();
        }
      } else {
        rate = 1; element.playbackRate = 1;
        // Pause also aborts a play() that has not resolved yet.
        if (!element.paused || playing) element.pause();
        if (Math.abs(drift) > 50 && !seekPending()) { seekTo(at); drift = 0; }
        set(status === 'ended' ? 'ended' : status === 'paused' ? 'paused' : 'ready');
      }
    },
    // A user gesture: try again after autoplay was refused.
    unlock() { if (state !== 'blocked' && state !== 'ready') return Promise.resolve(); set('loading'); return play() ?? Promise.resolve(); },
    retry() { if (!mediaId || state === 'disposed') return; generation++; load(mediaId); },
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
      generation++; playing = null;
      for (const [type, fn] of Object.entries(listeners)) element.removeEventListener(type, fn);
      element.pause(); element.removeAttribute('src'); element.load();
      shared = null; mediaId = null; set('disposed');
    },
  };
  function stats() {
    return { state, sharedStatus: shared ? screeningStatusAt(shared, clock.serverNow()) : null, revision: shared?.revision ?? null, epoch: shared?.epoch ?? null,
      mediaId, driftMs: Math.round(drift), rate, offsetMs: Math.round(clock.offset) };
  }
}
