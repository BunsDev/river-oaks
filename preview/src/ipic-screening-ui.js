// The IPIC screening panel (#367): shared status, this viewer's own sound, captions and
// transcript, and the host's play/pause/start/stop when the server says this viewer may host.
// Local trouble (autoplay refused, a decoder error, an unsupported format) is handled here
// and never changes the shared film. Leaving the venue, disconnecting or disposing releases
// the media element, the screen texture, listeners and timers.
import { SCREENING_DEFAULT_MEDIA, SCREENING_MEDIA, SCREENING_VENUES, screeningChoices } from './screening-contract.js';
import { createScreeningPlayer, createServerClock } from './ipic-screening.js';
import { createScreenBinding } from './ipic-screening-screen.js';

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

// Why this viewer's film stopped, from the player's failure (#498). Each one offers Retry.
const FAILURES = {
  decode: 'This device couldn’t decode the film. Retry, or stay and talk.',
  network: 'The film couldn’t download. Check the connection and Retry, or stay and talk.',
  stalled: 'The film stopped loading. Retry, or stay and talk.',
  playback: 'The film didn’t start on this device. Retry, or stay and talk.',
};
export function screeningStatusText({ shared, local, failure = null }) {
  const status = shared?.status ?? 'stopped', label = SCREENING_MEDIA[shared?.mediaId]?.label ?? 'the film';
  if (status === 'stopped') return 'Waiting for the host to start a film.';
  if (local === 'unsupported') return failure === 'unknown' ? 'This film needs a newer version of River Oaks. Reload the page to watch it.' : 'This device can’t play this film. You can stay, talk or leave.';
  if (local === 'error') return FAILURES[failure] ?? FAILURES.decode;
  if (status === 'paused') return 'Paused by the host.';
  if (status === 'ended') return 'The film has ended.';
  if (local === 'blocked') return 'Playing for everyone · Press Play film to watch here.';
  if (local === 'buffering') return 'Playing for everyone · Buffering on this device…';
  if (local === 'loading' || local === 'ready') return 'Playing for everyone · Loading the film…';
  return `Now showing · ${label}`;
}

// One command per host intent. Start names the host's chosen film, or the venue's named default; never
// the film that just ended, and never an id the allowlist does not give this venue (#499).
export function screeningCommand(view, action, operationId, { mediaId } = {}) {
  if (!['start', 'play', 'pause', 'stop'].includes(action) || !view) return null;
  const command = { type: 'screening', action, venueId: view.venueId, epoch: view.epoch, expectedRevision: view.revision, operationId };
  if (action === 'start') {
    const id = mediaId ?? SCREENING_DEFAULT_MEDIA[view.venueId];
    if (!Object.hasOwn(SCREENING_MEDIA, id) || !SCREENING_MEDIA[id].venues.includes(view.venueId)) return null;
    command.mediaId = id;
  }
  return command;
}

// What the chooser says about a film: its length, its sound and its captions, as the catalog records them.
const SOUND = { silent: 'Silent', 'test tone': 'Test tone', dialogue: 'Dialogue', music: 'Music', 'dialogue and music': 'Dialogue and music' };
export function screeningFilmDetails(film) {
  const seconds = Math.round(film.durationMs / 1000);
  return [`${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`, SOUND[film.audio] ?? 'Sound unknown', film.captions ? 'English captions' : 'No captions'].join(' · ');
}

const operationId = () => `op-${Array.from(crypto.getRandomValues(new Uint8Array(9)), byte => byte.toString(16).padStart(2, '0')).join('')}`;

// House lights: the auditorium's downlights dim while a film plays in IPIC and come back up when it
// pauses, ends or stops, or the visitor leaves. Eased over about a second, as a cinema's are.
export const HOUSE_LIGHTS_DIMMED = 0.25;
export const houseLightTarget = ({ status, inside } = {}) => (inside && status === 'playing' ? HOUSE_LIGHTS_DIMMED : 1);
export const nextHouseLight = (level, target, seconds) => target + (level - target) * Math.exp(-Math.max(0, seconds) / 0.45);

// The walking card (Stand up, More) sits below the panel; its height changes with the voice row and
// notices, and each breakpoint moves it. The panel's bottom edge stays this far up the viewport, so
// Stand up is never under it. null when the card is not on screen: the stylesheet's offset applies.
export function panelClearance(card, viewportHeight, gap = 8) {
  if (!card || !(card.width > 0) || !(card.height > 0)) return null;
  return Math.max(0, Math.ceil(viewportHeight - card.top + gap));
}

// getVenue() → { active: inside the IPIC room, auditorium: within the auditorium's walls }.
export function createIpicScreening({ host, THREE, getMultiplayer, getVenue, getScreen, venueId = 'ipic', now = () => performance.now(), doc = document }) {
  let session = null, generation = 0, houseLights = 1, lightsAt = null;
  const media = SCREENING_MEDIA[SCREENING_DEFAULT_MEDIA[venueId]];
  // Fixtures join the chooser only on a development build that asks for them (test journeys).
  const fixtures = Boolean(import.meta.env?.DEV) && new URLSearchParams(doc.defaultView?.location?.search ?? '').has('screening-fixtures');

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
    // The host's film choice (#499): shown only while nothing plays; Start film starts the chosen film.
    const chooser = doc.createElement('div'), label = doc.createElement('label'), select = doc.createElement('select'), poster = doc.createElement('div'), image = doc.createElement('img'), details = doc.createElement('p');
    chooser.className = 'ipic-screening-chooser'; chooser.hidden = true;
    select.id = `ipic-screening-film-${token}`; select.dataset.control = 'film'; label.htmlFor = select.id; label.textContent = 'Film';
    poster.className = 'ipic-screening-poster'; image.alt = ''; image.decoding = 'async'; image.hidden = true; poster.append(image);
    details.className = 'ipic-screening-film-details';
    const choices = screeningChoices(venueId, { fixtures });
    for (const film of choices) { const option = doc.createElement('option'); option.value = film.id; option.textContent = film.fixture ? `${film.label} (test)` : film.label; select.append(option); }
    chooser.append(poster, label, select, details);
    panel.append(status, caption, chooser, controls, transcript, video); host.append(panel);
    const state = { token, clock, video, panel, status, caption, transcript, buttons, view: null, canHost: false, sound: false, captions: true, screen: createScreenBinding({ THREE }), lastRender: '', syncAt: -Infinity, message: '', busy: false, textFor: media?.id ?? null,
      chooser, select, image, details, choices, choice: media?.id ?? choices[0]?.id ?? null };
    select.value = state.choice ?? '';
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
    // Choosing is local: nothing loads and nobody else sees it until Start succeeds.
    on(select, 'change', () => { if (state.choices.some(film => film.id === select.value)) state.choice = select.value; render(state, true); });
    on(image, 'error', () => { image.hidden = true; });
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
    const command = screeningCommand(state.view, action, operationId(), action === 'start' ? { mediaId: state.choice } : {}); if (!command) return;
    state.busy = true; state.message = '';
    let reply = await getMultiplayer()?.command(command).catch(() => null);
    // A lost reply may still have applied: retry once with the same operation id.
    if (session === state && !reply) reply = await getMultiplayer()?.command(command).catch(() => null);
    if (session !== state) return;
    state.busy = false;
    if (reply?.ok) { state.player.apply(reply.screening); state.view = reply.screening; if (reply.serverTimeMs) state.clock.observeFrame(reply.serverTimeMs, now()); }
    // A refusal shows the room as it is: a stale view, or a host grant or venue that changed, syncs again.
    else { state.message = MESSAGES[reply?.error] ?? reply?.message ?? 'The film could not be changed. Try again.'; if (['screening_stale', 'screening_host_required', 'screening_not_in_venue'].includes(reply?.error)) void sync(state); }
    render(state, true);
  }

  // The film goes on the existing screen material, one texture per loaded source and decoded size,
  // and only once that source has a decoded frame: while a replacement loads, or after a stop or a
  // failure, the screen is its idle self rather than a frame of an earlier film (#498).
  const SHOWN = ['ready', 'playing', 'buffering', 'paused', 'ended', 'blocked'];
  function bindScreen(state) {
    const stats = state.player.stats(), { video } = state;
    state.screen.sync({ screen: getScreen?.(), video, key: `${stats.generation}:${video.videoWidth}x${video.videoHeight}`, show: SHOWN.includes(stats.state) && video.readyState >= 2 });
    // What this update put on the screen, beside the player's state at that moment. The software acceptance
    // profile draws (and updates this) once a second, so journeys read it rather than the live state.
    state.drawn = { state: stats.state, shared: stats.sharedStatus, mediaId: stats.mediaId, attached: Boolean(state.screen.inspect().key) };
  }

  // Captions and transcript belong to the film actually playing: the venue's default until the
  // shared film is another allowlisted one, which brings its own (#365 review). A film this version
  // does not know brings none, rather than another film's (#499).
  function filmText(state, mediaId) {
    const film = mediaId == null ? media : SCREENING_MEDIA[mediaId] ?? null, id = film?.id ?? mediaId;
    if (state.textFor === id) return;
    state.textFor = id;
    for (const track of state.video.querySelectorAll('track')) track.remove();
    if (film?.captions) {
      const track = doc.createElement('track');
      Object.assign(track, { kind: 'captions', src: film.captions.src, srclang: film.captions.srclang, label: film.captions.label, default: true });
      state.video.append(track);
    }
    const lines = film?.transcript ?? ['No transcript for this film in this version.'];
    state.transcript.replaceChildren(...lines.map(line => { const p = doc.createElement('p'); p.textContent = line; return p; }));
    state.player.setCaptions(state.captions);
  }
  // The chooser, while the host can start a film: the chosen film's poster (or a neutral frame) and details.
  function renderChooser(state, shared) {
    const choosing = state.canHost && ['stopped', 'ended'].includes(shared?.status ?? 'stopped') && state.choices.length > 0;
    state.chooser.hidden = !choosing; state.select.disabled = state.busy;
    const film = SCREENING_MEDIA[state.choice];
    if (!choosing || !film) return;
    if (state.select.value !== film.id) state.select.value = film.id;
    state.details.textContent = screeningFilmDetails(film);
    if (!film.poster) state.image.hidden = true;
    else if (state.image.getAttribute('src') !== film.poster) { state.image.hidden = false; state.image.src = film.poster; }
  }
  // The active cue, refreshed every frame and at once when Captions is toggled.
  function showCaption(state) {
    const text = state.player.captionText();
    if (state.caption.textContent !== text) state.caption.textContent = text;
    state.caption.hidden = !text;
  }
  function clearWalkingCard(state) {
    const card = doc.querySelector?.('#walking-hud .walking-console'), view = doc.defaultView;
    const shown = card && view && view.getComputedStyle(card).visibility !== 'hidden';
    const px = shown ? panelClearance(card.getBoundingClientRect(), view.innerHeight) : null, value = px === null ? '' : `${px}px`;
    if (state.clearance === value) return;
    state.clearance = value;
    if (value) state.panel.style.setProperty('--ipic-clear', value); else state.panel.style.removeProperty('--ipic-clear');
  }

  function render(state, force = false) {
    const venue = getVenue(), stats = state.player.stats();
    filmText(state, stats.mediaId);
    state.video.muted = !(state.sound && venue.auditorium);
    const key = JSON.stringify([stats.state, stats.failure, stats.sharedStatus, state.view?.revision, state.canHost, state.sound, state.captions, venue.auditorium, state.message, state.transcript.hidden, state.choice, state.busy]);
    if (!force && key === state.lastRender) return;
    state.lastRender = key;
    const shared = state.view ? { ...state.view, status: stats.sharedStatus ?? state.view.status } : null;
    state.status.textContent = state.message || screeningStatusText({ shared, local: stats.state, failure: stats.failure });
    renderChooser(state, shared);
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
    state.screen.release(); state.player.dispose(); state.release(); state.panel.remove(); session = null;
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
      state.player.tick(); bindScreen(state); render(state); showCaption(state);
      if (!(at - state.clearedAt < 250)) { state.clearedAt = at; clearWalkingCard(state); }
    },
    inspect() {
      const state = session; if (!state || state.stopped) return { active: false, stopped: Boolean(state?.stopped) };
      const screen = state.screen.inspect();
      return { active: true, houseLights, ...state.player.stats(), canHost: state.canHost, currentTime: state.video.currentTime, paused: state.video.paused, muted: state.video.muted,
        attached: Boolean(screen.key), screen, drawn: state.drawn ?? null, decoded: [state.video.videoWidth, state.video.videoHeight], serverNow: state.clock.serverNow() };
    },
    get houseLights() { return houseLights; },
    dispose() { close(); },
    get venue() { return SCREENING_VENUES[venueId]; },
  };
}
