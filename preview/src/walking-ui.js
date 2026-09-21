import { createWalkingEnvironment, createWalkingState, stepWalking } from './walking.js';
import './walking.css';

export function createWalkingControls({ camera, host, onExit, onTalk, getLocals, reducedMotion }) {
  const $ = (selector) => document.querySelector(selector);
  const hud = document.createElement('section');
  hud.id = 'walking-hud'; hud.className = 'walking-hud'; hud.hidden = true;
  hud.setAttribute('aria-label', 'Walking controls');
  hud.innerHTML = `<div class="walking-title"><span>RIVER OAKS DISTRICT</span><strong>On foot</strong><small>4444 Westheimer Rd · Houston</small></div><button id="walking-exit">Leave walk <kbd>Esc</kbd></button><div class="walking-center" aria-hidden="true">·</div><div class="walking-console"><button id="walking-talk" disabled>Find a local to talk to <kbd>E</kbd></button><p id="walking-place">Explore the public walkways</p><button id="walking-controls-toggle" aria-expanded="true" aria-controls="walking-movement">Hide movement controls</button><div id="walking-movement"><div class="walking-pad" role="group" aria-label="Walk and turn"><button data-walk-key="ArrowLeft" aria-label="Turn left">↶</button><button data-walk-key="KeyA" aria-label="Walk left">←</button><button data-walk-key="KeyW" aria-label="Walk forward">↑</button><button data-walk-key="KeyS" aria-label="Walk backward">↓</button><button data-walk-key="KeyD" aria-label="Walk right">→</button><button data-walk-key="ArrowRight" aria-label="Turn right">↷</button></div><p class="walking-help">WASD to walk · Drag to look · Shift for a brisk walk<br>Arrow keys to turn · E to talk · Escape to leave</p></div></div>`;
  $('#viewport').append(hud);
  const keys = new Set();
  let active = false, environment, stores = [], state, nearest = null, drag = null, lastPaint = 0;
  const clear = () => { keys.clear(); drag = null; document.querySelectorAll('[data-walk-key]').forEach(b => b.classList.remove('held')); if (state) state.velocity = [0, 0]; };
  const dialogueOpen = () => !$('#community-dialogue')?.hidden;
  const place = () => {
    camera.position.fromArray(state.position);
    if (!reducedMotion && state.speed > 0.1) camera.position.y += Math.sin(state.distance * 6.4) * 0.012;
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  };
  const findNearest = () => {
    let result = null, distance = 4.5;
    for (const local of getLocals() ?? []) {
      const d = Math.hypot(local.position[0] - state.position[0], -local.position[1] - state.position[2]);
      if (d < distance) { result = local; distance = d; }
    }
    return result;
  };
  // The HUD is throttled; an arrival followed by E must use the current position.
  const talk = () => { if (!active) return; nearest = findNearest(); if (nearest) { clear(); onTalk(nearest.id); } };
  // The on-screen pad stays wherever the visitor last left it across visits.
  const showMovement = shown => {
    const movement = $('#walking-movement');
    movement.hidden = !shown; clear();
    $('#walking-controls-toggle').setAttribute('aria-expanded', String(shown));
    $('#walking-controls-toggle').textContent = shown ? 'Hide movement controls' : 'Show movement controls';
    try { localStorage.setItem('river-oaks-movement-pad', shown ? 'shown' : 'hidden'); } catch { /* storage may be unavailable */ }
  };
  try { if (localStorage.getItem('river-oaks-movement-pad') === 'hidden') showMovement(false); } catch { /* storage may be unavailable */ }
  $('#walking-controls-toggle').addEventListener('click', () => showMovement($('#walking-movement').hidden));
  $('#walking-exit').addEventListener('click', onExit);
  $('#walking-talk').addEventListener('click', talk);
  host.addEventListener('keydown', event => {
    if (!active || dialogueOpen()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); talk(); }
    if (event.code === 'Escape') onExit();
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  host.addEventListener('blur', clear);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);
  host.addEventListener('pointerdown', event => {
    if (!active || dialogueOpen() || event.button !== 0) return;
    drag = [event.clientX, event.clientY]; host.setPointerCapture(event.pointerId); host.focus({ preventScroll: true });
  });
  host.addEventListener('pointermove', event => {
    if (!active || !drag) return;
    state.yaw -= (event.clientX - drag[0]) * 0.003;
    state.pitch = Math.max(-1.1, Math.min(1.1, state.pitch - (event.clientY - drag[1]) * 0.003));
    drag = [event.clientX, event.clientY];
  });
  host.addEventListener('pointerup', () => { drag = null; });
  host.addEventListener('pointercancel', () => { drag = null; });
  document.querySelectorAll('[data-walk-key]').forEach(button => {
    const release = () => { keys.delete(button.dataset.walkKey); button.classList.remove('held'); };
    button.addEventListener('pointerdown', event => {
      if (!active || dialogueOpen()) return;
      event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.walkKey); button.classList.add('held');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('click', event => { if (event.detail === 0 && active && !dialogueOpen()) { keys.add(button.dataset.walkKey); setTimeout(release, 180); } });
  });
  return {
    get active() { return active; },
    getPosition() { return state ? [state.position[0], -state.position[2], state.position[1]] : null; },
    lookAt(position) {
      if (!state) return;
      state.yaw = Math.atan2(state.position[0]-position[0], state.position[2]+position[1]);
      state.pitch = -0.04;
    },
    enter(world, position = world.walkSpawn, lookAt, pitch = 0) {
      environment = createWalkingEnvironment(world);
      stores = world.stores ?? [];
      state = createWalkingState(environment, position);
      if (lookAt) state.yaw = Math.atan2(state.position[0] - lookAt[0], state.position[2] + lookAt[1]);
      state.pitch = pitch;
      active = true; clear(); hud.hidden = false;
      document.body.classList.add('walking');
      camera.fov = 65; camera.near = 0.06; camera.far = 1800; camera.updateProjectionMatrix();
      host.setAttribute('aria-label', 'Walking. WASD moves, drag looks around, arrows turn, E talks to a nearby local, Escape leaves.');
      place(); host.focus({ preventScroll: true });
    },
    exit() {
      active = false; clear(); hud.hidden = true; nearest = null;
      document.body.classList.remove('walking');
      camera.fov = 42; camera.near = 0.5; camera.far = 30000; camera.updateProjectionMatrix(); camera.rotation.z = 0;
    },
    update(delta, now) {
      if (!active || document.hidden) return;
      const pressed = (...codes) => codes.some(code => keys.has(code));
      if (dialogueOpen()) clear();
      else stepWalking(state, environment, { forward: Number(pressed('KeyW', 'ArrowUp')) - Number(pressed('KeyS', 'ArrowDown')), strafe: Number(pressed('KeyD')) - Number(pressed('KeyA')), turn: Number(pressed('ArrowLeft')) - Number(pressed('ArrowRight')), fast: pressed('ShiftLeft', 'ShiftRight') }, delta);
      place();
      if (now - lastPaint < 150) return;
      lastPaint = now;
      nearest = findNearest();
      $('#walking-talk').disabled = !nearest;
      $('#walking-talk').textContent = nearest ? `Talk to ${nearest.name} · E` : 'Find a local to talk to · E';
      const storefront = stores.reduce((best, store) => { const distance = Math.hypot(store.facade[0] - state.position[0], store.facade[1] + state.position[2]); return distance < (best?.distance ?? 16) ? { store, distance } : best; }, null);
      $('.walking-title strong').textContent = storefront?.store.name ?? 'On foot';
      $('#walking-place').textContent = nearest?.anchorName ?? `${state.distance.toFixed(0)} m walked · public district paths`;
      hud.dataset.distance = state.distance.toFixed(2);
      hud.dataset.position = JSON.stringify(state.position);
    },
  };
}
