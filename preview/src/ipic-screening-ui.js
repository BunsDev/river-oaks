// The IPIC screening panel (#367): shared status, this viewer's own sound, captions and
// transcript, and the host's play/pause/start/stop when the server says this viewer may host.
// Local trouble (autoplay refused, a decoder error, an unsupported format) is handled here
// and never changes the shared film. Leaving the venue, disconnecting or disposing releases
// the media element, the screen texture, listeners and timers.
import { SCREENING_MEDIA, SCREENING_VENUES } from './screening-contract.js';
import { createScreeningPlayer, createServerClock, fitVideoToScreen } from './ipic-screening.js';

const CONTROLS = ['play-local', 'retry', 'host-start', 'host-play', 'host-pause', 'host-stop', 'sound', 'volume', 'captions', 'transcript', 'stop-watching'];
const HOST_ACTIONS = { 'host-start': 'start', 'host-play': 'play', 'host-pause': 'pause', 'host-stop': 'stop' };
const MESSAGES = {
  screening_host_required: 'Only the venue host can control the film.', screening_not_in_venue: 'Go into IPIC to host the film.',
  screening_stale: 'The film changed. Try again.', screening_in_progress: 'Stop this film first.', screening_not_paused: 'The film is not paused.',
  screening_not_playing: 'The film is not playing.', screening_not_running: 'Nothing is showing.', rate_limited: 'Please wait a moment and try again.',
};

export function screeningControls({ shared, local, canHost = false, inAuditorium = false, sound = false, captions = true }) {
  const status = shared?.status ?? 'stopped', film = Boolean(shared?.mediaId) && status !== 'stopped';
  const trouble = ['error', 'unsupported'].includes(local);
  const show = {
    'play-local': film && local === 'blocked', retry: film && local === 'error',
    'host-start': canHost && ['stopped', 'ended'].includes(status), 'host-play': canHost && status === 'paused',
    'host-pause': canHost && status === 'playing', 'host-stop': canHost && status !== 'stopped',
    sound: film && !trouble, volume: film && !trouble, captions: film && !trouble, transcript: film, 'stop-watching': film,
  };
  const labels = {
    'play-local': 'Play film', retry: 'Retry', 'host-start': 'Start film', 'host-play': 'Resume film', 'host-pause': 'Pause film', 'host-stop': 'Stop film',
    sound: sound ? 'Sound off' : 'Sound on', volume: 'Volume', captions: captions ? 'Captions off' : 'Captions on', transcript: 'Transcript', 'stop-watching': 'Stop watching',
  };
  return CONTROLS.map(id => ({ id, label: labels[id], hidden: !show[id], disabled: id === 'sound' && !inAuditorium }));
}

export function screeningStatusText({ shared, local }) {
  const status = shared?.status ?? 'stopped', label = SCREENING_MEDIA[shared?.mediaId]?.label ?? 'the film';
  if (status === 'stopped') return 'Waiting for the host to start a film.';
  if (local === 'unsupported') return 'This device can’t play this film. You can stay, talk or leave.';
  if (local === 'error') return 'The film didn’t load on this device. Retry, or stay and talk.';
  if (status === 'paused') return 'Paused by the host.';
  if (status === 'ended') return 'The film has ended.';
  if (local === 'blocked') return 'Playing for everyone · Press Play film to watch here.';
  if (local === 'buffering') return 'Playing for everyone · Buffering on this device…';
  if (local === 'loading' || local === 'ready') return 'Playing for everyone · Loading the film…';
  return `Now showing · ${label}`;
}

export function screeningCommand(view, action, operationId) {
  if (!['start', 'play', 'pause', 'stop'].includes(action) || !view) return null;
  const command = { type: 'screening', action, venueId: view.venueId, epoch: view.epoch, expectedRevision: view.revision, operationId };
  if (action === 'start') command.mediaId = view.mediaId ?? Object.values(SCREENING_MEDIA).find(media => media.venues.includes(view.venueId))?.id;
  return command;
}

const operationId = () => `op-${Array.from(crypto.getRandomValues(new Uint8Array(9)), byte => byte.toString(16).padStart(2, '0')).join('')}`;

// House lights: the auditorium's downlights dim while a film plays in IPIC and come back up when it
// pauses, ends or stops, or the visitor leaves. Eased over about a second, as a cinema's are.
export const HOUSE_LIGHTS_DIMMED = 0.25;
export const houseLightTarget = ({ status, inside } = {}) => (inside && status === 'playing' ? HOUSE_LIGHTS_DIMMED : 1);
export const nextHouseLight = (level, target, seconds) => target + (level - target) * Math.exp(-Math.max(0, seconds) / 0.45);

// getVenue() → { active: inside the IPIC room, auditorium: within the auditorium's walls }.
export function createIpicScreening({ host, THREE, getMultiplayer, getVenue, getScreen, venueId = 'ipic', now = () => performance.now(), doc = document }) {
  let session = null, generation = 0, houseLights = 1, lightsAt = null;
  const media = SCREENING_MEDIA[Object.keys(SCREENING_MEDIA).find(id => SCREENING_MEDIA[id].venues.includes(venueId))];

  function open() {
    const token = ++generation, clock = createServerClock({ now });
    const video = doc.createElement('video');
    Object.assign(video, { muted: true, playsInline: true, preload: 'auto' });
    video.setAttribute('playsinline', ''); video.setAttribute('aria-hidden', 'true'); video.hidden = true;
    if (media?.captions) {
      const track = doc.createElement('track');
      Object.assign(track, { kind: 'captions', src: media.captions.src, srclang: media.captions.srclang, label: media.captions.label, default: true });
      video.append(track);
    }
    const panel = doc.createElement('section'), status = doc.createElement('p'), controls = doc.createElement('div'), transcript = doc.createElement('div');
    // Captions: the active cue, shown here because the film reaches the screen only as texture frames.
    const caption = doc.createElement('p'); caption.className = 'ipic-screening-caption'; caption.hidden = true;
    panel.id = 'ipic-screening'; panel.className = 'ipic-screening'; panel.setAttribute('aria-label', 'IPIC screening');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite'); status.className = 'ipic-screening-status';
    transcript.className = 'ipic-screening-transcript'; transcript.hidden = true;
    for (const line of media?.transcript ?? []) { const p = doc.createElement('p'); p.textContent = line; transcript.append(p); }
    const buttons = new Map();
    for (const id of CONTROLS) {
      const control = id === 'volume' ? doc.createElement('input') : doc.createElement('button');
      if (id === 'volume') Object.assign(control, { type: 'range', min: '0', max: '1', step: '0.05', value: '0.8' }); else control.type = 'button';
      control.dataset.control = id; control.hidden = true; controls.append(control); buttons.set(id, control);
    }
    panel.append(status, caption, controls, transcript, video); host.append(panel);
    const state = { token, clock, video, panel, status, caption, transcript, buttons, view: null, canHost: false, sound: false, captions: true, texture: null, saved: null, lastRender: '', syncAt: -Infinity, message: '', busy: false };
    state.player = createScreeningPlayer({ media: video, clock });
    state.player.setCaptions(true); state.player.setVolume(0.8);
    const listeners = [];
    const on = (target, type, fn) => { target.addEventListener(type, fn); listeners.push(() => target.removeEventListener(type, fn)); };
    on(controls, 'click', event => {
      const id = event.target?.dataset?.control; if (!id || session !== state) return;
      if (HOST_ACTIONS[id]) void hostAction(state, HOST_ACTIONS[id]);
      else if (id === 'play-local') void state.player.unlock();
      else if (id === 'retry') state.player.retry();
      else if (id === 'sound') { state.sound = !state.sound; }
      else if (id === 'captions') { state.captions = !state.captions; state.player.setCaptions(state.captions); showCaption(state); }
      else if (id === 'transcript') { transcript.hidden = !transcript.hidden; }
      else if (id === 'stop-watching') { close(); session = { stopped: true, generation }; }
      render(state, true);
    });
    // Keep the panel's presses out of the world's drag and selection gestures.
    on(panel, 'pointerdown', event => event.stopPropagation());
    on(controls, 'input', event => { if (event.target?.dataset?.control === 'volume') state.player.setVolume(event.target.value); });
    // Foreground recovery: a fresh clock sample as soon as the page is visible again.
    on(doc, 'visibilitychange', () => { if (!doc.hidden && session === state) void sync(state); });
    state.release = () => listeners.forEach(off => off());
    session = state;
    void sync(state);
    return state;
  }

  async function sync(state) {
    const client = getMultiplayer(); if (!client?.connected) return;
    state.syncAt = now();
    const sent = now(), reply = await client.command({ type: 'screening', action: 'sync', venueId }).catch(() => null);
    if (session !== state || state.token !== generation || !reply?.ok) return;
    state.clock.observeSync(reply.serverTimeMs, sent, now());
    state.canHost = Boolean(reply.canHost);
    state.player.apply(reply.screening); state.view = reply.screening;
    render(state, true);
  }

  async function hostAction(state, action) {
    if (state.busy || !state.view) return;
    const command = screeningCommand(state.view, action, operationId()); if (!command) return;
    state.busy = true; state.message = '';
    let reply = await getMultiplayer()?.command(command).catch(() => null);
    // A lost reply may still have applied: retry once with the same operation id.
    if (session === state && !reply) reply = await getMultiplayer()?.command(command).catch(() => null);
    if (session !== state) return;
    state.busy = false;
    if (reply?.ok) { state.player.apply(reply.screening); state.view = reply.screening; if (reply.serverTimeMs) state.clock.observeFrame(reply.serverTimeMs, now()); }
    else { state.message = MESSAGES[reply?.error] ?? reply?.message ?? 'The film could not be changed. Try again.'; if (reply?.error === 'screening_stale') void sync(state); }
    render(state, true);
  }

  // The film goes on the existing screen material; leaving restores it exactly.
  function attach(state) {
    const screen = getScreen?.(), material = screen?.material; if (!material || state.texture || state.video.readyState < 2) return;
    state.saved = { map: material.map, emissiveMap: material.emissiveMap, color: material.color.clone(), emissive: material.emissive.clone(), emissiveIntensity: material.emissiveIntensity, material };
    state.texture = new THREE.VideoTexture(state.video); state.texture.colorSpace = THREE.SRGBColorSpace;
    // Keep the film's aspect on the wide screen; clamped edges show the media's black border.
    const fit = fitVideoToScreen(state.video.videoWidth / state.video.videoHeight, screen.aspect);
    state.texture.wrapS = state.texture.wrapT = THREE.ClampToEdgeWrapping;
    state.texture.repeat.set(...fit.repeat); state.texture.offset.set(...fit.offset);
    Object.assign(material, { map: state.texture, emissiveMap: state.texture, emissiveIntensity: 1 });
    material.color.set('#ffffff'); material.emissive.set('#ffffff'); material.needsUpdate = true;
  }
  function detach(state) {
    if (!state.saved) return;
    const { material, map, emissiveMap, color, emissive, emissiveIntensity } = state.saved;
    Object.assign(material, { map, emissiveMap, emissiveIntensity }); material.color.copy(color); material.emissive.copy(emissive); material.needsUpdate = true;
    state.texture?.dispose(); state.texture = null; state.saved = null;
  }

  // The active cue, refreshed every frame and at once when Captions is toggled.
  function showCaption(state) {
    const text = state.player.captionText();
    if (state.caption.textContent !== text) state.caption.textContent = text;
    state.caption.hidden = !text;
  }
  function render(state, force = false) {
    const venue = getVenue(), stats = state.player.stats();
    state.video.muted = !(state.sound && venue.auditorium);
    const key = JSON.stringify([stats.state, stats.sharedStatus, state.view?.revision, state.canHost, state.sound, state.captions, venue.auditorium, state.message, state.transcript.hidden]);
    if (!force && key === state.lastRender) return;
    state.lastRender = key;
    const shared = state.view ? { ...state.view, status: stats.sharedStatus ?? state.view.status } : null;
    state.status.textContent = state.message || screeningStatusText({ shared, local: stats.state });
    for (const control of screeningControls({ shared, local: stats.state, canHost: state.canHost, inAuditorium: venue.auditorium, sound: state.sound, captions: state.captions })) {
      const element = state.buttons.get(control.id);
      element.hidden = control.hidden; element.disabled = control.disabled || (HOST_ACTIONS[control.id] && state.busy);
      if (control.id !== 'volume') element.textContent = control.label; else element.setAttribute('aria-label', control.label);
      if (control.id === 'sound' || control.id === 'captions' || control.id === 'transcript') element.setAttribute('aria-pressed', String(control.id === 'sound' ? state.sound : control.id === 'captions' ? state.captions : !state.transcript.hidden));
    }
    state.panel.hidden = state.buttons.size && [...state.buttons.values()].every(element => element.hidden) && !state.view?.mediaId && !state.canHost;
    state.panel.dataset.local = stats.state; state.panel.dataset.shared = stats.sharedStatus ?? 'none';
  }

  function close() {
    const state = session; generation++;
    if (!state || state.stopped) { session = null; return; }
    detach(state); state.player.dispose(); state.release(); state.panel.remove(); session = null;
  }

  return {
    onSnapshot(snapshot) {
      const state = session; if (!state || state.stopped || !Array.isArray(snapshot?.screenings)) return;
      state.clock.observeFrame(snapshot.serverTimeMs, now());
      const view = snapshot.screenings.find(item => item.venueId === venueId);
      if (view) { state.player.apply(view); if (!state.view || view.epoch !== state.view.epoch || view.revision >= state.view.revision) state.view = view; }
    },
    update() {
      const venue = getVenue(), connected = getMultiplayer()?.connected, at = now();
      const status = session && !session.stopped ? session.player.stats().sharedStatus : null;
      houseLights = nextHouseLight(houseLights, houseLightTarget({ status, inside: venue.active && connected }), lightsAt === null ? 0 : (at - lightsAt) / 1000); lightsAt = at;
      if (!venue.active || !connected) { if (session) close(); return; }
      if (!session) open();
      const state = session; if (state.stopped) return;
      if (now() - state.syncAt > 15_000) void sync(state);
      state.player.tick(); attach(state); render(state); showCaption(state);
    },
    inspect() {
      const state = session; if (!state || state.stopped) return { active: false, stopped: Boolean(state?.stopped) };
      return { active: true, houseLights, ...state.player.stats(), canHost: state.canHost, currentTime: state.video.currentTime, paused: state.video.paused, muted: state.video.muted, attached: Boolean(state.texture), serverNow: state.clock.serverNow() };
    },
    get houseLights() { return houseLights; },
    dispose() { close(); },
    get venue() { return SCREENING_VENUES[venueId]; },
  };
}
