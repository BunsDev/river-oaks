// The IPIC screening panel (#367): shared status, this viewer's own sound, captions and
// transcript, and the host's play/pause/start/stop when the server says this viewer may host.
// Local trouble (autoplay refused, a decoder error, an unsupported format) is handled here
// and never changes the shared film. Leaving the venue, disconnecting or disposing releases
// the media element, the screen texture, listeners and timers.
import { SCREENING_DEFAULT_MEDIA, SCREENING_MEDIA, SCREENING_VENUES, screeningChoices } from './screening-contract.js';
import { createScreeningPlayer, createServerClock } from './ipic-screening.js';
import { createScreenBinding } from './ipic-screening-screen.js';
import { FOCUS_VIEW, filmCorners, screenFocusPose } from './ipic-screening-view.js';

const CONTROLS = ['play-local', 'retry', 'host-start', 'host-play', 'host-pause', 'host-stop', 'sound', 'volume', 'captions', 'transcript', 'focus', 'stop-watching'];
const HOST_ACTIONS = { 'host-start': 'start', 'host-play': 'play', 'host-pause': 'pause', 'host-stop': 'stop' };
const MESSAGES = {
  screening_host_required: 'Only the venue host can control the film.', screening_not_in_venue: 'Go into IPIC to host the film.',
  screening_stale: 'The film changed. Try again.', screening_in_progress: 'Stop this film first.', screening_not_paused: 'The film is not paused.',
  screening_not_playing: 'The film is not playing.', screening_not_running: 'Nothing is showing.', rate_limited: 'Please wait a moment and try again.',
};

// seated: in a recliner that faces the screen; focused: the local screen-focused camera is on (#500).
// volumeSupported: setting the element's volume changes it on this device (iOS Safari ignores it).
export function screeningControls({ shared, local, canHost = false, inAuditorium = false, sound = false, captions = true, seated = false, focused = false, volumeSupported = true }) {
  const status = shared?.status ?? 'stopped', film = Boolean(shared?.mediaId) && status !== 'stopped';
  const trouble = ['error', 'unsupported'].includes(local);
  const show = {
    'play-local': film && local === 'blocked', retry: film && local === 'error',
    'host-start': canHost && ['stopped', 'ended'].includes(status), 'host-play': canHost && status === 'paused',
    'host-pause': canHost && status === 'playing', 'host-stop': canHost && status !== 'stopped',
    sound: film && !trouble, volume: film && !trouble && volumeSupported, captions: film && !trouble, transcript: film, focus: film && seated && !trouble, 'stop-watching': film,
  };
  const labels = {
    'play-local': 'Play film', retry: 'Retry', 'host-start': 'Start film', 'host-play': 'Resume film', 'host-pause': 'Pause film', 'host-stop': 'Stop film',
    sound: sound ? 'Sound off' : 'Sound on', volume: 'Volume', captions: captions ? 'Captions off' : 'Captions on', transcript: 'Transcript', focus: focused ? 'Look around' : 'Focus on screen', 'stop-watching': 'Stop watching',
  };
  return CONTROLS.map(id => ({ id, label: labels[id], hidden: !show[id], disabled: id === 'sound' && !inAuditorium, ...(id === 'focus' ? { pressed: focused } : {}) }));
}

// Why this viewer's film stopped, from the player's failure (#498). Each one offers Retry.
const FAILURES = {
  decode: 'This device couldn’t decode the film. Retry, or stay and talk.',
  network: 'The film couldn’t download. Check the connection and Retry, or stay and talk.',
  stalled: 'The film stopped loading. Retry, or stay and talk.',
  playback: 'The film didn’t start on this device. Retry, or stay and talk.',
};
export function screeningStatusText({ shared, local, failure = null, sound = false }) {
  const status = shared?.status ?? 'stopped', label = SCREENING_MEDIA[shared?.mediaId]?.label ?? 'the film';
  if (status === 'stopped') return 'Waiting for the host to start a film.';
  if (local === 'unsupported') return failure === 'unknown' ? 'This film needs a newer version of River Oaks. Reload the page to watch it.' : 'This device can’t play this film. You can stay, talk or leave.';
  if (local === 'error') return FAILURES[failure] ?? FAILURES.decode;
  if (status === 'paused') return 'Paused by the host.';
  if (status === 'ended') return 'The film has ended.';
  // Sound on is a wish until the browser plays: a refused start is said so, never shown as sound (#500).
  if (local === 'blocked') return sound ? 'Playing for everyone · Sound is on, but this browser needs a tap first: press Play film.' : 'Playing for everyone · Press Play film to watch here.';
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
// getSeat() → { eye: [x, y, z] } while seated in a screen-facing recliner, else null (#500).
// input: the element the walking camera's drag and arrow keys act on; looking around there ends focus.
export function createIpicScreening({ host, THREE, getMultiplayer, getVenue, getScreen, getSeat = () => null, input = null, reducedMotion = false, venueId = 'ipic', now = () => performance.now(), doc = document }) {
  let session = null, generation = 0, houseLights = 1, lightsAt = null;
  // The screen-focused camera (#500), laid over the walking camera each frame and eased in and out.
  const view = { blend: 0, at: null, restoreFov: null, pose: null, fits: true };
  const looked = event => { if (session?.focused && (event.type === 'pointerdown' || /^Arrow/.test(event.code ?? ''))) { session.focused = false; render(session, true); } };
  input?.addEventListener('pointerdown', looked); input?.addEventListener('keydown', looked);
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
    // Whether this device lets a page set the film's volume (iOS Safari keeps it at 1): offer the slider only then.
    const volumeSupported = (() => { try { video.volume = 0.5; const works = Math.abs(video.volume - 0.5) < 0.01; video.volume = 1; return works; } catch { return false; } })();
    const deviceVolume = doc.createElement('p'); deviceVolume.className = 'ipic-screening-device-volume'; deviceVolume.textContent = 'Use your device’s volume buttons.'; deviceVolume.hidden = true;
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
    controls.append(deviceVolume);
    panel.append(status, caption, chooser, controls, transcript, video); host.append(panel);
    const state = { token, clock, video, panel, status, caption, transcript, buttons, view: null, canHost: false, sound: false, captions: true, screen: createScreenBinding({ THREE }), lastRender: '', syncAt: -Infinity, message: '', busy: false, textFor: media?.id ?? null,
      chooser, select, image, details, choices, choice: media?.id ?? choices[0]?.id ?? null, focused: false, volumeSupported, deviceVolume };
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
      else if (id === 'focus') { state.focused = !state.focused; }
      else if (id === 'stop-watching') { close(); session = stoppedPanel(); return; }
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
    const key = JSON.stringify([stats.state, stats.failure, stats.sharedStatus, state.view?.revision, state.canHost, state.sound, state.captions, venue.auditorium, state.message, state.transcript.hidden, state.choice, state.busy, state.focused, Boolean(getSeat())]);
    if (!force && key === state.lastRender) return;
    state.lastRender = key;
    const shared = state.view ? { ...state.view, status: stats.sharedStatus ?? state.view.status } : null;
    state.status.textContent = state.message || screeningStatusText({ shared, local: stats.state, failure: stats.failure, sound: state.sound });
    renderChooser(state, shared);
    const seated = Boolean(getSeat());
    for (const control of screeningControls({ shared, local: stats.state, canHost: state.canHost, inAuditorium: venue.auditorium, sound: state.sound, captions: state.captions, seated, focused: state.focused, volumeSupported: state.volumeSupported })) {
      const element = state.buttons.get(control.id);
      element.hidden = control.hidden; element.disabled = control.disabled || (HOST_ACTIONS[control.id] && state.busy);
      if (control.id !== 'volume') element.textContent = control.label; else element.setAttribute('aria-label', control.label);
      if (control.id === 'sound' || control.id === 'captions' || control.id === 'transcript') element.setAttribute('aria-pressed', String(control.id === 'sound' ? state.sound : control.id === 'captions' ? state.captions : !state.transcript.hidden));
      if (control.id === 'focus') element.setAttribute('aria-pressed', String(control.pressed));
    }
    state.deviceVolume.hidden = state.volumeSupported || state.buttons.get('sound').hidden;
    state.panel.hidden = state.buttons.size && [...state.buttons.values()].every(element => element.hidden) && !state.view?.mediaId && !state.canHost;
    state.panel.dataset.local = stats.state; state.panel.dataset.shared = stats.sharedStatus ?? 'none';
  }

  // Stop watching is local and reversible (#500): the film and its decoder are released, and a small
  // panel offers Join screening, which opens a fresh player on the room's current timeline. It sends no command.
  function stoppedPanel() {
    const panel = doc.createElement('section'), note = doc.createElement('p'), join = doc.createElement('button');
    panel.id = 'ipic-screening'; panel.className = 'ipic-screening ipic-screening-stopped'; panel.setAttribute('aria-label', 'IPIC screening');
    note.className = 'ipic-screening-status'; note.setAttribute('role', 'status'); note.textContent = 'You stopped watching. The film goes on for everyone else.';
    join.type = 'button'; join.dataset.control = 'join'; join.textContent = 'Join screening';
    panel.append(note, join); host.append(panel);
    const stopped = { stopped: true, generation, panel };
    const rejoin = () => { if (session !== stopped) return; panel.remove(); session = null; };
    join.addEventListener('click', rejoin); panel.addEventListener('pointerdown', event => event.stopPropagation());
    return stopped;
  }
  function close() {
    const state = session; generation++;
    // Leaving, disconnecting or disposing ends focus at once: the walking camera owns the view again.
    if (state?.focused) state.focused = false;
    view.blend = 0;
    if (!state || state.stopped) { state?.panel?.remove(); session = null; return; }
    state.screen.release(); state.player.dispose(); state.release(); state.panel.remove(); session = null;
  }
  // The film in world terms, at its current fit (the whole screen until a film is bound).
  function filmFrame(state) {
    const screen = getScreen?.(), frame = screen?.frame, object = screen?.object;
    if (!frame || !object || !THREE) return null;
    object.updateWorldMatrix?.(true, false);
    const fit = state.screen.inspect().fit ?? { repeat: [1, 1] };
    return { center: new THREE.Vector3(...frame.center).applyMatrix4(object.matrixWorld).toArray(), right: new THREE.Vector3(...frame.right).transformDirection(object.matrixWorld).toArray(),
      up: new THREE.Vector3(...frame.up).transformDirection(object.matrixWorld).toArray(), width: frame.width / fit.repeat[0], height: frame.height / fit.repeat[1] };
  }
  // Called after the walking camera has placed itself this frame. Focus never moves the avatar; when it ends
  // (Look around, a drag or arrow key, standing, leaving) the walking camera's own view returns.
  function applyCamera(camera) {
    const state = session, at = now(), dt = view.at === null ? 0 : Math.max(0, at - view.at) / 1000; view.at = at;
    const seat = state && !state.stopped ? getSeat() : null;
    if (state?.focused && !seat) { state.focused = false; render(state, true); }
    const on = Boolean(state?.focused), step = (typeof reducedMotion === 'function' ? reducedMotion() : reducedMotion) ? 1 : dt / FOCUS_VIEW.easeSeconds;
    view.blend = on ? Math.min(1, view.blend + step) : Math.max(0, view.blend - step);
    if (on && view.restoreFov === null) view.restoreFov = camera.fov;
    const film = on || view.blend > 0 ? state && !state.stopped && filmFrame(state) : null;
    if (on && seat && film) { view.pose = screenFocusPose({ eye: seat.eye, film, aspect: camera.aspect }); view.fits = view.pose.fits; }
    if (view.blend === 0 || !view.pose || (!film && !on)) {
      if (view.restoreFov !== null && view.blend === 0) { camera.fov = view.restoreFov; camera.updateProjectionMatrix(); view.restoreFov = null; view.pose = null; }
      return;
    }
    const b = view.blend * view.blend * (3 - 2 * view.blend), { position, target, fov } = view.pose;
    const look = new THREE.Matrix4().lookAt(new THREE.Vector3(...position), new THREE.Vector3(...target), new THREE.Vector3(0, 1, 0));
    camera.position.lerp(new THREE.Vector3(...position), b);
    camera.quaternion.slerp(new THREE.Quaternion().setFromRotationMatrix(look), b);
    camera.fov = view.restoreFov + (fov - view.restoreFov) * b; camera.updateProjectionMatrix(); camera.updateMatrixWorld();
    // Where the film's corners land in view (normalised device coordinates), for checks of what it frames.
    view.ndc = film ? filmCorners(film).map(corner => new THREE.Vector3(...corner).project(camera)).map(v => [v.x, v.y]) : null;
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
        attached: Boolean(screen.key), screen, decoded: [state.video.videoWidth, state.video.videoHeight], serverNow: state.clock.serverNow(),
        focus: { on: state.focused, blend: view.blend, fits: view.fits, fov: view.pose?.fov ?? null, position: view.pose?.position ?? null, ndc: view.blend > 0 ? view.ndc ?? null : null }, volumeSupported: state.volumeSupported };
    },
    get houseLights() { return houseLights; },
    applyCamera,
    // A world rebuild disposes the session and reuses this object, so the input listeners stay.
    dispose() { close(); },
    get venue() { return SCREENING_VENUES[venueId]; },
  };
}
