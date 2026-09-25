import { createInvaders } from './invaders.js';
import { createWalkingEnvironment } from './walking.js';
import { canCast, castSpell, createInvasion, releaseResidents, stepInvasion, RESIDENTS_LOST_LIMIT, SPELL_RANGE } from './invasion.js';
import { VISITOR_FORMS } from './visitor-persona.js';
import './invasion.css';

// The invasion card: start the scenario, cast with Q, and read the outcome.
export function createInvasionControls({ scene, host, walking, getWorld, getLocals, getForm, onCast = () => {} }) {
  const panel = document.createElement('section'); panel.className = 'invasion-controls'; panel.setAttribute('aria-label', 'Alien invasion');
  panel.innerHTML = `<div class="invasion-title"><span>Scenario</span><strong>Alien invasion</strong></div>
    <p id="invasion-brief">Saucers land at the edge of the district and their crew beam neighbors aboard. Only magic sends them home.</p>
    <div class="invasion-counts" hidden><span><b id="invasion-aliens">0</b> aliens</span><span><b id="invasion-safe">0</b> beamed up</span></div>
    <button id="invasion-toggle" type="button" aria-pressed="false">Begin invasion</button>
    <button id="invasion-cast" type="button" hidden>Cast <kbd>Q</kbd></button>
    <p id="invasion-status" role="status" aria-live="polite"></p>`;
  const $ = selector => panel.querySelector(selector);
  const toggle = $('#invasion-toggle'), cast = $('#invasion-cast'), status = $('#invasion-status'), counts = $('.invasion-counts');
  let state = null, invaders = null, environment = null, world = null, lastCast = 0;
  const magical = () => canCast(getForm());
  const formLabel = () => VISITOR_FORMS.find(form => form.id === getForm())?.label ?? 'this visitor';
  const compass = bearing => ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(((bearing % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / (Math.PI / 4)) % 8];
  const nearestAlien = () => {
    const pose = walking.getPose(); if (!state || !pose) return null;
    const here = [pose.position[0], -pose.position[2]];
    const active = state.aliens.filter(alien => !['banished', 'gone'].includes(alien.status));
    const alien = active.sort((a, b) => Math.hypot(a.position[0] - here[0], a.position[1] - here[1]) - Math.hypot(b.position[0] - here[0], b.position[1] - here[1]))[0];
    if (!alien) return null;
    const bearing = Math.atan2(alien.position[0] - here[0], alien.position[1] - here[1]);
    return { id: alien.id, status: alien.status, distance: Math.hypot(alien.position[0] - here[0], alien.position[1] - here[1]), bearing, direction: compass(bearing) };
  };
  const publish = () => {
    const remaining = state ? state.aliens.filter(alien => !['banished', 'gone'].includes(alien.status)).length : 0;
    panel.dataset.state = JSON.stringify({ phase: state?.phase ?? 'idle', remaining, banished: state?.banished ?? 0, abducted: state?.abducted.length ?? 0, canCast: magical(), landed: state ? state.aliens.filter(alien => alien.status !== 'landing').length : 0, crew: invaders?.crew ?? [], aliens: state ? state.aliens.map(alien => ({ id: alien.id, status: alien.status, position: alien.position.slice(0, 2) })) : [], nearest: nearestAlien() });
    host.dataset.invasion = state?.phase ?? 'idle';
  };
  const say = message => { status.textContent = message; };
  const refreshGate = () => {
    if (state?.phase === 'active') return;
    toggle.disabled = !magical();
    if (!magical()) say(`Jevica is getting ready to cast.`);
    else if (!state) say(`${formLabel()} is ready. Begin, then get within ${SPELL_RANGE} m of an alien and cast.`);
  };
  const begin = () => {
    world = getWorld(); if (!world || !magical()) return refreshGate();
    environment = createWalkingEnvironment(world);
    const groundAt = (e, n) => environment.groundAt(e, -n);
    state = createInvasion(world, { count: 5, isFree: (e, n) => environment.isFree(e, -n), groundAt });
    invaders?.dispose(); invaders = createInvaders({ scene, world, groundAt }); invaders.begin(state);
    toggle.textContent = 'Call off the invasion'; toggle.setAttribute('aria-pressed', 'true'); cast.hidden = false; counts.hidden = false;
    say('Saucers are landing at the edge of the district. Find them before they reach anyone.'); publish();
  };
  const finish = (message) => {
    if (state) releaseResidents(state, getLocals() ?? []);
    invaders?.clear();
    toggle.textContent = 'Begin invasion'; toggle.setAttribute('aria-pressed', 'false'); cast.hidden = true;
    $('#invasion-brief').textContent = 'Saucers land at the edge of the district and their crew beam neighbors aboard. Only magic sends them home.';
    if (message) say(message); publish();
  };
  const reset = () => {
    if (state) releaseResidents(state, getLocals() ?? []);
    invaders?.dispose(); invaders = null;
    state = null; environment = null; world = null; lastCast = 0;
    counts.hidden = true;
    $('#invasion-aliens').textContent = '0'; $('#invasion-safe').textContent = '0';
    finish(); refreshGate();
  };
  const tryCast = () => {
    if (!state || state.phase !== 'active') return;
    const pose = walking.getPose(); if (!pose) return;
    const player = { form: getForm(), position: [pose.position[0], -pose.position[2], pose.ground + (pose.altitude ?? 0)] };
    const hit = castSpell(state, player, { canSee: point => walking.canSee(point) });
    if (hit) { onCast(); lastCast = performance.now(); say(`${formLabel()} casts at ${hit.replace('alien-', 'the crew member #')}.`); }
    else if (!magical()) say(`Jevica is getting ready to cast.`);
    else if (state.cooldown <= 0) say(`No alien within ${SPELL_RANGE} m and in sight. Move closer.`);
    publish();
  };
  toggle.addEventListener('click', () => { if (state?.phase === 'active') { state.phase = 'called-off'; finish('Invasion called off. Everyone is back on the pavement.'); } else begin(); });
  cast.addEventListener('click', () => { tryCast(); host.focus({ preventScroll: true }); });
  host.addEventListener('keydown', event => { if (event.code === 'KeyQ' && !event.repeat) { event.preventDefault(); tryCast(); } });
  refreshGate(); publish();
  return {
    panel,
    get state() { return state; },
    update(delta, now) {
      if (!state) return;
      if (state.phase === 'active') {
        const pose = walking.getPose();
        stepInvasion(state, delta, { isFree: (e, n) => environment.isFree(e, -n), groundAt: (e, n) => environment.groundAt(e, -n), residents: getLocals() ?? [], player: pose ? { position: [pose.position[0], -pose.position[2], pose.ground], form: getForm() } : null });
        for (const event of state.events) {
          if (event.type === 'abducted') say(`${(getLocals() ?? []).find(local => local.id === event.id)?.name ?? 'A neighbor'} was beamed aboard! ${RESIDENTS_LOST_LIMIT - state.abducted.length} more and the district falls.`);
          if (event.type === 'landed' && !state.landingAnnounced) { state.landingAnnounced = true; say('The crew are on the ground. Get within range and press Q.'); }
          if (event.type === 'banished') say(`Banished! ${state.aliens.filter(alien => !['banished', 'gone'].includes(alien.status)).length} to go.`);
        }
        const nearest = nearestAlien();
        $('#invasion-brief').textContent = nearest ? `Nearest ${nearest.status === 'abducting' ? 'beam' : nearest.status === 'menacing' ? 'alien, closing in' : 'saucer'}: ${nearest.distance.toFixed(0)} m ${nearest.direction}${nearest.distance <= SPELL_RANGE ? ' · in range' : ''}` : 'Saucers are landing at the edge of the district.';
        $('#invasion-aliens').textContent = String(state.aliens.filter(alien => !['banished', 'gone'].includes(alien.status)).length);
        $('#invasion-safe').textContent = String(state.abducted.length);
        if (state.phase === 'won') finish(`Every saucer has fled. ${formLabel()} saved the district${state.abducted.length ? ` and the ${state.abducted.length} neighbors beamed aboard are home` : ''}.`);
        if (state.phase === 'lost') finish(`${RESIDENTS_LOST_LIMIT} neighbors were beamed aboard before the saucers left. They are home now; try again.`);
      }
      if (state.phase !== 'active' && invaders && (now - lastCast) > 0) { /* nothing animates once finished */ }
      invaders?.sync(state, now, delta);
      if (state.phase === 'active') publish();
    },
    refreshGate,
    reset,
    dispose() { reset(); panel.remove(); },
  };
}
