import { createFlightState, stepFlight } from './flight.js';
import { thirdPersonPose } from './third-person.js';
import { nearbyPeople } from './nearby-people.js';
import { createWalkingEnvironment, createWalkingState, stepWalking, steerWalkingToward } from './walking.js';
import { ENCOUNTER_FAR, clearEncounterLine, encounterPosition } from './encounter.js';
import './walking.css';

export function createWalkingControls({ camera, host, onMeetNearby, onTalk, getLocals, reducedMotion, onEnter, onLeave, onManual = () => {} }) {
  const $ = (selector) => document.querySelector(selector);
  const hud = document.createElement('section');
  hud.id = 'walking-hud'; hud.className = 'walking-hud'; hud.hidden = true;
  hud.setAttribute('aria-label', 'Walking controls');
  hud.innerHTML = `<div class="walking-title"><span>RIVER OAKS DISTRICT</span><strong>On foot</strong><small>4444 Westheimer Rd · Houston</small></div><div class="walking-center" aria-hidden="true">·</div><div class="walking-console"><button id="walking-meet-nearby">Meet someone nearby</button><button id="walking-talk" disabled>Find a local to talk to <kbd>E</kbd></button><button id="walking-enter" hidden>Step inside <kbd>F</kbd></button><p id="walking-place">Explore the public walkways</p><button id="walking-controls-toggle" aria-expanded="false" aria-controls="walking-movement">Show movement controls</button><div id="walking-movement" hidden><div class="walking-pad" role="group" aria-label="Walk and turn"><button data-walk-key="ArrowLeft" aria-label="Turn left"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5 3.5 8.5 7 12"/><path d="M3.5 8.5H12a4 4 0 0 1 0 8H9"/></svg></button><button data-walk-key="KeyA" aria-label="Walk left">←</button><button data-walk-key="KeyW" aria-label="Walk forward">↑</button><button data-walk-key="KeyS" aria-label="Walk backward">↓</button><button data-walk-key="KeyD" aria-label="Walk right">→</button><button data-walk-key="ArrowRight" aria-label="Turn right"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13 5 3.5 3.5L13 12"/><path d="M16.5 8.5H8a4 4 0 0 0 0 8h3"/></svg></button></div><p class="walking-help">WASD to walk · Drag to look · Shift for a brisk walk<br>Arrow keys to turn · E to talk · F steps inside · Escape closes conversations</p></div></div>`;
  $('#viewport').append(hud);
  const keys = new Set();
  let autoInput = null;
  let flight = createFlightState();
  let thirdPerson = true, bodyVisible = true;
  let active = false, environment, stores = [], state, nearest = null, drag = null, lastPaint = 0;
  const clear = () => { keys.clear(); drag = null; document.querySelectorAll('[data-walk-key]').forEach(b => b.classList.remove('held')); if (state) state.velocity = [0, 0]; };
  const dialogueOpen = () => !$('#community-dialogue')?.hidden;
  const place = () => {
    if (thirdPerson) {
      const pose = thirdPersonPose(state, environment);
      camera.position.fromArray(pose.position);camera.lookAt(...pose.target);bodyVisible = pose.showBody;
      return;
    }
    bodyVisible = false;
    camera.position.fromArray(state.position);
    if (!reducedMotion && state.speed > 0.1) camera.position.y += Math.sin(state.distance * 6.4) * 0.012;
    camera.rotation.set(state.pitch, state.yaw, 0, 'YXZ');
  };
  // The HUD only promises what focusing will accept, so E and the meet button never dead-end:
  // street residents need a personal-space placement, people at work only a clear line across the room.
  const visitorPosition = () => [state.position[0], -state.position[2], state.position[1]];
  const canMeet = local => local.indoor
    ? clearEncounterLine(environment, visitorPosition(), local.position)
    : encounterPosition(environment, local, visitorPosition(), getLocals() ?? []) !== null;
  const findNearest = () => {
    let result = null, distance = ENCOUNTER_FAR;
    const room = currentRoom();
    for (const local of getLocals() ?? []) {
      if ((local.storeId ?? null) !== (room?.storeId ?? null)) continue;
      if (Math.abs(local.position[2] - environment.groundAt(state.position[0], state.position[2])) > 4) continue;
      const d = Math.hypot(local.position[0] - state.position[0], -local.position[1] - state.position[2]);
      if (d < distance && Math.abs(local.position[2] - state.position[1]) < 4 && canMeet(local)) { result = local; distance = d; }
    }
    return result;
  };
  // The HUD is throttled; an arrival followed by E must use the current position.
  const talk = () => { if (!active) return; nearest = findNearest(); if (nearest) { clear(); onTalk(nearest.id); } };
  // Boutique thresholds: inside a room F steps back to the pavement, at a door F walks in.
  const currentRoom = () => environment?.roomAt?.(state.position[0], state.position[2]) ?? null;
  const doorway = () => {
    let result = null, distance = 6;
    for (const store of stores) {
      const d = Math.hypot(store.facade[0] - state.position[0], store.facade[1] + state.position[2]);
      if (d < distance) { result = store; distance = d; }
    }
    return result;
  };
  const stepThrough = () => {
    if (!active) return;
    onManual();
    const room = currentRoom();
    if (room) { const store = stores.find(item => item.id === room.storeId); if (store) { clear(); onLeave?.(store); } return; }
    const store = doorway();
    if (store) { clear(); onEnter?.(store); }
  };
  $('#walking-enter').addEventListener('click', stepThrough);
  // The on-screen pad stays wherever the visitor last left it across visits.
  const showMovement = (shown, persist = true) => {
    const movement = $('#walking-movement');
    movement.hidden = !shown; clear();
    $('#walking-controls-toggle').setAttribute('aria-expanded', String(shown));
    $('#walking-controls-toggle').textContent = shown ? 'Hide movement controls' : 'Show movement controls';
    if (persist) try { localStorage.setItem('river-oaks-movement-pad', shown ? 'shown' : 'hidden'); } catch { /* storage may be unavailable */ }
  };
  // Touch devices start with the pad open, pointer devices with it collapsed; a stored choice wins either way.
  let storedMovement = null;
  try { storedMovement = localStorage.getItem('river-oaks-movement-pad'); } catch { /* storage may be unavailable */ }
  showMovement(storedMovement ? storedMovement === 'shown' : window.matchMedia('(pointer: coarse)').matches, false);
  $('#walking-controls-toggle').addEventListener('click', () => showMovement($('#walking-movement').hidden));
  $('#walking-meet-nearby').addEventListener('click', () => { clear(); onMeetNearby(); });
  $('#walking-talk').addEventListener('click', talk);
  host.addEventListener('keydown', event => {
    if (!active || dialogueOpen()) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyF', 'Escape'].includes(event.code)) onManual();
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyC'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); talk(); }
    if (event.code === 'KeyF' && !event.repeat) { event.preventDefault(); stepThrough(); }
    if (event.code === 'Escape') { clear(); host.blur(); }
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  host.addEventListener('blur', clear);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);
  host.addEventListener('pointerdown', event => {
    if (!active || dialogueOpen() || event.button !== 0) return;
    onManual();
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
      onManual();
      event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.walkKey); button.classList.add('held');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('click', event => { if (event.detail === 0 && active && !dialogueOpen()) { onManual(); keys.add(button.dataset.walkKey); setTimeout(release, 180); } });
  });
  return {
    get active() { return active; },
    get thirdPerson() { return thirdPerson; },
    toggleFlight() {
      if (!active || currentRoom()) return false;
      onManual();autoInput=null;clear();
      if (!flight.active) Object.assign(flight,{active:true,target:3.5,landing:false});
      else {flight.landing=!flight.landing;flight.target=flight.landing?0:Math.max(3.5,flight.altitude);}
      return true;
    },
    setThirdPerson(enabled) { thirdPerson = Boolean(enabled);if (active) place(); },
    getPose() { return active && state ? { position: [...state.position], ground: environment.groundAt(state.position[0], state.position[2]), altitude:flight.altitude, flying:flight.active, landing:flight.landing, yaw: state.yaw, speed: state.speed, velocity: [...state.velocity], distance: state.distance, roomId: currentRoom()?.storeId ?? null, showBody: thirdPerson && bodyVisible, groundAt: environment.groundAt } : null; },
    canSee(point) {
      if (!state) return false;
      const distance = Math.hypot(point[0] - state.position[0], -point[1] - state.position[2]);
      for (let t = 0.5; t < distance; t += 0.5) { const f = t / distance; if (!environment.isFree(state.position[0] + (point[0] - state.position[0]) * f, state.position[2] + (-point[1] - state.position[2]) * f)) return false; }
      return true;
    },
    getPosition() { return state ? [state.position[0], -state.position[2], state.position[1]] : null; },
    get roomId() { return active && state ? currentRoom()?.storeId ?? null : null; },
    focusPerson(local) {
      if (!state) return false;
      const visitor = this.getPosition();
      const position = encounterPosition(environment, local, visitor, getLocals() ?? []);
      if (!position) return false;
      clear();
      // Already within talking range: turn toward them and stay put.
      if (position === visitor) { this.lookAt(local.position); place(); return true; }
      const walked = state.distance;
      state = createWalkingState(environment, position, state.yaw);
      state.distance = walked;
      this.lookAt(local.position);
      // Leave room for the conversation at the left on wide screens.
      if (host.clientWidth > 900) state.yaw += 0.24;
      state.pitch = host.clientWidth <= 650 ? -0.28 : -0.16;
      place();
      return true;
    },
    haltAuto() { autoInput = null; if (state) { state.velocity = [0, 0]; state.speed = 0; } },
    steerTo(point, delta) {
      if (!state || !active) return;
      autoInput = steerWalkingToward(state, point, delta);
    },
    lookAt(position) {
      if (!state) return;
      state.yaw = Math.atan2(state.position[0]-position[0], state.position[2]+position[1]);
      state.pitch = -0.04;
    },
    enter(world, position = world.walkSpawn, lookAt, pitch = 0) {
      onManual(); autoInput = null;
      environment = createWalkingEnvironment(world);
      stores = world.stores ?? [];
      flight = createFlightState();
      state = createWalkingState(environment, position);
      if (lookAt) state.yaw = Math.atan2(state.position[0] - lookAt[0], state.position[2] + lookAt[1]);
      state.pitch = pitch;
      active = true; clear(); hud.hidden = false;
      document.body.classList.add('walking');
      camera.fov = 65; camera.near = 0.06; camera.updateProjectionMatrix();
      host.setAttribute('aria-label', 'Walking. WASD moves, drag looks around, arrows turn, E talks to a nearby local, Escape releases movement focus.');
      place(); host.focus({ preventScroll: true });
    },
    exit() {
      onManual(); autoInput = null;
      active = false; clear(); hud.hidden = true; nearest = null;
      document.body.classList.remove('walking', 'inside-store'); hud.dataset.inside = '';
      camera.fov = 42; camera.near = 0.5; camera.updateProjectionMatrix(); camera.rotation.z = 0;
    },
    update(delta, now) {
      if (!active || document.hidden) return;
      const pressed = (...codes) => codes.some(code => keys.has(code));
      $('.walking-console').inert = dialogueOpen();
      if (dialogueOpen()) clear();
      else {
        const input=autoInput ?? {forward:Number(pressed('KeyW','ArrowUp'))-Number(pressed('KeyS','ArrowDown')),strafe:Number(pressed('KeyD'))-Number(pressed('KeyA')),turn:Number(pressed('ArrowLeft'))-Number(pressed('ArrowRight')),fast:pressed('ShiftLeft','ShiftRight'),lift:Number(pressed('Space'))-Number(pressed('KeyC'))};
        if(flight.active) stepFlight(state,environment,flight,input,delta);else stepWalking(state,environment,input,delta);
      }
      place();
      if (now - lastPaint < 150) return;
      lastPaint = now;
      nearest = findNearest();
      const nearby = nearbyPeople(getLocals() ?? [], this.getPosition()).filter(item => canMeet(item.local));
      $('#walking-meet-nearby').disabled = !nearby.length;
      $('#walking-talk').disabled = !nearest;
      $('#walking-talk').hidden = !nearest;
      $('#walking-meet-nearby').classList.toggle('walking-secondary', Boolean(nearest));
      $('#walking-talk').textContent = nearest ? `Talk to ${nearest.name} · E` : 'Find a local to talk to · E';
      const storefront = stores.reduce((best, store) => { const distance = Math.hypot(store.facade[0] - state.position[0], store.facade[1] + state.position[2]); return distance < (best?.distance ?? 16) ? { store, distance } : best; }, null);
      const room = currentRoom(), door = room ? null : doorway();
      $('.walking-title strong').textContent = room?.name ?? storefront?.store.name ?? 'On foot';
      const enter = $('#walking-enter');
      enter.hidden = !room && !door;
      enter.textContent = room ? 'Step outside · F' : door ? `Step inside ${door.name} · F` : '';
      hud.dataset.inside = room?.storeId ?? '';
      document.body.classList.toggle('inside-store', Boolean(room));
      $('#walking-place').textContent = room ? `Inside ${room.name} · ${room.summary.label} · ${room.summary.staff} staff, ${room.summary.guests} guests` : nearest ? `${nearest.anchorName} · nearby` : `${state.distance.toFixed(0)} m walked · public district paths`;
      hud.dataset.eyeHeight = (state.position[1] - environment.groundAt(state.position[0], state.position[2])).toFixed(2);
      hud.dataset.distance = state.distance.toFixed(2);
      hud.dataset.yaw = state.yaw.toFixed(3);
      hud.dataset.flying=String(flight.active);hud.dataset.altitude=flight.altitude.toFixed(2);
      hud.dataset.position = JSON.stringify(state.position);
    },
  };
}
