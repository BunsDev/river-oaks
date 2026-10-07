import { personPosition, personEyeHeight, personDistance } from './person-position.js';
import { createFlightState, beginFlight, stepFlight } from './flight.js';
import { thirdPersonPose, createCameraBoom } from './third-person.js';
import { createPointerGesture } from './pointer-gesture.js';
import { withinTalkingReach } from './people-picking.js';
import { nearbyPeople } from './nearby-people.js';
import { createWalkingEnvironment, createWalkingState, stepWalking } from './walking.js';
import { beastTraversal } from './beast-traversal.js';
import { ENCOUNTER_FAR, clearConversationLine, encounterPosition, indoorEncounterPosition } from './encounter.js';
import { sharedRoomSummary } from './shared-population.js';
import { isGameplayKey } from './keyboard-input.js';
import './walking.css';

export function createWalkingControls({ camera, host, onMeetNearby, onTalk, getLocals, reducedMotion, onEnter, onLeave, canEnterStore = () => true, getInteraction = () => null }) {
  const $ = (selector) => document.querySelector(selector);
  const hud = document.createElement('section');
  hud.id = 'walking-hud'; hud.className = 'walking-hud'; hud.hidden = true;
  hud.setAttribute('aria-label', 'Walking controls');
  hud.innerHTML = `<div class="walking-title"><span>RIVER OAKS · GARDEN CITY</span><strong>On foot</strong><small>4444 Westheimer Rd · Houston</small></div><div class="walking-center" aria-hidden="true">·</div><div class="walking-console"><p class="walking-notice" id="walking-notice" role="status" aria-live="polite" hidden></p><button id="walking-meet-nearby">Meet someone nearby</button><button id="walking-talk" disabled>Find a local to talk to <kbd>E</kbd></button><button id="walking-enter" hidden>Step inside <kbd>F</kbd></button><button id="walking-interact" hidden>Sit down <kbd>Z</kbd></button><p id="walking-place">Explore the public walkways</p><button id="walking-controls-toggle" aria-expanded="false" aria-controls="walking-movement">Show movement controls</button><div id="walking-movement" hidden><div class="walking-pad" role="group" aria-label="Walk and turn"><button data-walk-key="ArrowLeft" aria-label="Turn left"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 5 3.5 8.5 7 12"/><path d="M3.5 8.5H12a4 4 0 0 1 0 8H9"/></svg></button><button data-walk-key="KeyA" aria-label="Walk left">←</button><button data-walk-key="KeyW" aria-label="Walk forward">↑</button><button data-walk-key="KeyS" aria-label="Walk backward">↓</button><button data-walk-key="KeyD" aria-label="Walk right">→</button><button data-walk-key="ArrowRight" aria-label="Turn right"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m13 5 3.5 3.5L13 12"/><path d="M16.5 8.5H8a4 4 0 0 0 0 8h3"/></svg></button></div><p class="walking-help">WASD to walk · Drag to look · Shift for a brisk walk<br>Arrow keys to turn · E to talk · F steps inside · Z to sit or water<br>B to fly · Space to rise · C to lower · Escape closes conversations</p></div></div>`;
  const sprintButton=document.createElement('button');
  sprintButton.id='walking-sprint';sprintButton.dataset.walkKey='ShiftLeft';
  sprintButton.setAttribute('aria-label','Hold to sprint');sprintButton.textContent='Hold to sprint';sprintButton.hidden=true;
  hud.querySelector('#walking-movement').append(sprintButton);
  $('#viewport').append(hud);
  const keys = new Set();
  const placedObjects = [];
  let transport = null, sitting = null, seatedGround = 0;
  let flight = createFlightState();
  let flightAllowed=false,beastKind=null;
  let thirdPerson = true, bodyVisible = true;
  let active = false, environment, stores = [], state, nearest = null, lastPaint = 0, pathLabel = 'public district paths';
  const drag = createPointerGesture();
  const cameraBoom=createCameraBoom();
  const clear = () => { keys.clear(); drag.cancel(); document.querySelectorAll('[data-walk-key]').forEach(b => b.classList.remove('held')); if (state) state.velocity = [0, 0]; };
  const dialogueOpen = () => !$('#community-dialogue')?.hidden;
  const place = (delta=0) => {
    if (thirdPerson) {
      const pose = thirdPersonPose({...state,position:transport?.pose.cameraTarget??state.position,cameraDistance:transport?10.4:4.2}, environment);
      const clearDistance=Math.hypot(...pose.position.map((v,i)=>v-pose.target[i]));
      if(clearDistance<.05){
        // A wall or tree can fully collapse the boom. Looking at the camera's
        // own position loses the requested heading, so use the visitor's view.
        cameraBoom.update(0,0);camera.position.fromArray(state.position);
        camera.rotation.set(state.pitch,state.yaw,0,'YXZ');bodyVisible=false;return;
      }
      const distance=cameraBoom.update(clearDistance,reducedMotion?0:delta);
      if(clearDistance>1e-6)pose.position=pose.position.map((v,i)=>pose.target[i]+(v-pose.target[i])*distance/clearDistance);
      camera.position.fromArray(pose.position);camera.lookAt(...pose.target);
      bodyVisible=pose.showBody&&distance>(transport?10.4:4.2)*.18;
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
  const canTalk = local => withinTalkingReach(local,{position:state.position,roomId:currentRoom()?.storeId??null},
    (point,eyeHeight)=>clearConversationLine(environment,visitorPosition(),point,eyeHeight));
  const canMeet = local => canTalk(local) || !sitting && !transport && !flight.active
    && (local.storeId??null)===(currentRoom()?.storeId??null)
    && (local.indoor||local.stationary?indoorEncounterPosition:encounterPosition)(environment,local,visitorPosition(),getLocals()??[])!==null;
  const findNearest = () => {
    let result = null, distance = ENCOUNTER_FAR;
    const room = currentRoom();
    for (const local of getLocals() ?? []) {
      if ((local.storeId ?? null) !== (room?.storeId ?? null)) continue;
      const d = personDistance(local,visitorPosition());
      if (d < distance && canTalk(local)) { result = local; distance = d; }
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
    if (!active || transport) return;
    if(sitting)return;

    const room = currentRoom();
    if (room) { const store = stores.find(item => item.id === room.storeId); if (store) { clear(); onLeave?.(store); } return; }
    const store = doorway();
    if (store && canEnterStore(store)) { clear(); onEnter?.(store); }
  };
  $('#walking-enter').addEventListener('click', stepThrough);
  // Z sits on a nearby seat, stands up, or waters a nearby planter; the
  // provider decides which and whether the town agrees.
  const interact = () => {
    if (!active) return;
    const interaction = getInteraction();
    if (interaction && !interaction.disabled) {  clear(); interaction.run(); }
  };
  $('#walking-interact').addEventListener('click', interact);
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
    if (!active || dialogueOpen() || !isGameplayKey(event)) return;
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE', 'KeyF', 'KeyZ', 'Escape'].includes(event.code)) {

      // Cancel the chauffeur even when a quick tap ends before the next frame.
      // Repeated keydown events must not brake an ongoing manual drive.
      if (!event.repeat) transport?.takeOver?.();
    }
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight', 'Space', 'KeyC'].includes(event.code)) { event.preventDefault(); keys.add(event.code); }
    if (event.code === 'KeyE' && !event.repeat) { event.preventDefault(); talk(); }
    if (event.code === 'KeyF' && !event.repeat) { event.preventDefault(); stepThrough(); }
    if (event.code === 'KeyZ' && !event.repeat) { event.preventDefault(); interact(); }
    if (event.code === 'Escape') { clear(); host.blur(); }
  });
  document.addEventListener('keyup', event => keys.delete(event.code));
  host.addEventListener('blur', clear);
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);
  host.addEventListener('pointerdown', event => {
    if (!active || dialogueOpen() || !drag.begin(event,{captureTarget:host})) return;

    host.setPointerCapture(event.pointerId); host.focus({ preventScroll: true });
  });
  host.addEventListener('pointermove', event => {
    if (!active || dialogueOpen()) return;
    const delta = drag.move(event); if (!delta) return;
    state.yaw -= delta[0] * 0.003;
    state.pitch = Math.max(-1.1, Math.min(1.1, state.pitch - delta[1] * 0.003));
  });
  host.addEventListener('pointerup', event => drag.end(event));
  for (const type of ['pointercancel', 'lostpointercapture']) host.addEventListener(type, event => drag.cancel(event));
  document.querySelectorAll('[data-walk-key]').forEach(button => {
    const release = () => { keys.delete(button.dataset.walkKey); button.classList.remove('held'); };
    button.addEventListener('pointerdown', event => {
      if (!active || dialogueOpen()) return;
      transport?.takeOver?.();
      event.preventDefault(); button.setPointerCapture(event.pointerId); keys.add(button.dataset.walkKey); button.classList.add('held');
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
    button.addEventListener('click', event => { if (event.detail === 0 && active && !dialogueOpen()) {  transport?.takeOver?.(); keys.add(button.dataset.walkKey); setTimeout(release, 180); } });
  });
  return {
    setTraversal({canFly=false,kind=null}={}) {
      flightAllowed=Boolean(canFly);beastKind=beastTraversal(kind)?kind:null;
      sprintButton.hidden=!beastKind;
      hud.querySelector('.walking-help').innerHTML=`WASD to move · Drag to look · Shift to ${beastKind?'sprint':'walk briskly'}<br>Arrow keys to turn · E to talk · F steps inside · Z to sit or water<br>${flightAllowed?'B to fly · Space to rise · C to lower · ':''}Escape closes conversations`;
    },
    addObstacle(object) { placedObjects.push(object); return () => { const i=placedObjects.indexOf(object);if(i>=0)placedObjects.splice(i,1); }; },
    get active() { return active; },
    get riding() { return Boolean(transport); },
    mount(controller) {
      if(!active||flight.active||currentRoom()||transport||sitting)return false;
      clear();transport=controller;
      thirdPerson=true;state.yaw=controller.pose.yaw+Math.PI+.38;state.pitch=-.25;
      state.position=[controller.pose.seat[0],controller.pose.seat[1]+.62,controller.pose.seat[2]];
      place();host.focus({preventScroll:true});return true;
    },
    dismount(position) {
      if(!transport)return;
      const seat=transport.pose.seat;
      transport.stop();transport=null;clear();
      state.yaw=Math.atan2(position[0]-seat[0],position[2]-seat[2]);state.pitch=-.15;
      state.position=[position[0],environment.groundAt(position[0],position[2])+1.68,position[2]];
      state.speed=0;place();host.focus({preventScroll:true});
    },
    get thirdPerson() { return thirdPerson; },
    halt() { clear(); if (state) { state.velocity = [0, 0]; state.speed = 0; } },
    applyServerPose(player) {
      transport?.stop();transport=null;
      if (!active || !state || !player) return;
      clear();
      sitting=player.sitting??null;seatedGround=player.position[2];
      state.position = [player.position[0], player.position[2] + (sitting?sitting.height+.65:1.68) + player.altitude, -player.position[1]];
      state.yaw = player.yaw; state.speed = 0;
      flight = createFlightState();
      if (player.altitude > 0) Object.assign(flight, { active: true, altitude: player.altitude, target: player.altitude });
      place();
    },
    syncSeating(player) {
      if(!player)return;
      if((player.sitting?.buildId??null)!==(sitting?.buildId??null) || player.sitting?.slot!==sitting?.slot)this.applyServerPose(player);
    },
    toggleFlight() {
      if (!flightAllowed || !active || currentRoom() || transport || sitting) return false;
      clear();
      if (!flight.active) return beginFlight(state,environment,flight);
      else {flight.landing=!flight.landing;flight.target=flight.landing?0:Math.max(3.5,flight.altitude);}
      return true;
    },
    // The live walking model, including placed objects, for the debug overlays.
    // A short message where the player is looking, for an action that could not happen.
    notify(text, ms = 3200) {
      const notice = $('#walking-notice'); if (!notice) return;
      clearTimeout(notice._timer); notice.textContent = text; notice.hidden = false;
      notice._timer = setTimeout(() => { notice.hidden = true; }, ms);
    },
    get environment() { return environment ?? null; },
    setThirdPerson(enabled) { thirdPerson = Boolean(enabled);if (active) place(); },
    getPose() { return active && state ? { position: [...state.position], riding:transport?.pose??null, sitting, ground: sitting?seatedGround:environment.groundAt(state.position[0], state.position[2]), altitude:flight.altitude, flying:flight.active, landing:flight.landing, yaw: state.yaw, speed: state.speed, velocity: [...state.velocity], distance: state.distance, roomId: currentRoom()?.storeId ?? null, showBody: thirdPerson && bodyVisible, groundAt: environment.groundAt } : null; },
    canSee(point,eyeHeight) {
      if (!state) return false;
      const local=(getLocals()??[]).find(local=>local.position===point);
      return clearConversationLine(environment,visitorPosition(),point,eyeHeight??(local?personEyeHeight(local):undefined));
    },
    getPosition() { return state ? [state.position[0], -state.position[2], state.position[1]] : null; },
    getYaw() { return state ? state.yaw : 0; },
    setYaw(yaw) { if (state && Number.isFinite(yaw)) { state.yaw = yaw; place(); } },
    get roomId() { return active && state ? currentRoom()?.storeId ?? null : null; },
    lookAt(position,eyeHeight=1.5) {
      if (!state) return;
      state.yaw = Math.atan2(state.position[0]-position[0], state.position[2]+position[1]);
      const distance=Math.hypot(state.position[0]-position[0],state.position[2]+position[1]);
      state.pitch=Math.max(-1.1,Math.min(1.1,Math.atan2(position[2]+eyeHeight-state.position[1],distance)));
    },
    enter(world, position = world.walkSpawn, lookAt, pitch = 0) {
       sitting=null;transport?.stop();transport=null;
      const creatorRegion = world.provenance?.kind === 'creator';
      $('.walking-title span').textContent = creatorRegion ? world.title : 'RIVER OAKS · GARDEN CITY';
      $('.walking-title small').textContent = creatorRegion ? 'Creator-authored region' : '4444 Westheimer Rd · Houston';
      pathLabel = creatorRegion ? 'creator region paths' : 'public district paths';
      environment = createWalkingEnvironment(world, placedObjects);
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

      transport?.stop();transport=null;sitting=null;active = false; clear(); hud.hidden = true; nearest = null;
      document.body.classList.remove('walking', 'inside-store'); hud.dataset.inside = '';
      camera.fov = 42; camera.near = 0.5; camera.updateProjectionMatrix(); camera.rotation.z = 0;
    },
    update(delta, now) {
      if (!active || document.hidden) return;
      const pressed = (...codes) => codes.some(code => keys.has(code));
      $('.walking-console').inert = dialogueOpen();
      if (dialogueOpen()) clear();
      else {
        const input={forward:Number(pressed('KeyW','ArrowUp'))-Number(pressed('KeyS','ArrowDown')),strafe:Number(pressed('KeyD'))-Number(pressed('KeyA')),turn:Number(pressed('ArrowLeft'))-Number(pressed('ArrowRight')),fast:pressed('ShiftLeft','ShiftRight'),lift:Number(pressed('Space'))-Number(pressed('KeyC'))};
        if(sitting) {
          state.yaw+=input.turn*1.8*delta;state.speed=0;state.velocity=[0,0];
        } else if(transport) {
          const yaw=transport.pose.yaw;
          transport.step(input,delta);
          const ride=transport.pose;state.yaw+=ride.yaw-yaw;
          state.position=[ride.seat[0],ride.seat[1]+.62,ride.seat[2]];
          state.speed=0;state.velocity=[0,0];
        } else if(flight.active) stepFlight(state,environment,flight,input,delta);else stepWalking(state,environment,{...input,beastKind},delta);
      }
      place(delta);
      if (now - lastPaint < 150) return;
      lastPaint = now;
      nearest = findNearest();
      const nearby = nearbyPeople(getLocals() ?? [], this.getPosition(), 40, 1, canMeet);
      $('#walking-meet-nearby').disabled = !nearby.length;
      $('#walking-talk').disabled = !nearest;
      $('#walking-talk').hidden = !nearest;
      $('#walking-meet-nearby').classList.toggle('walking-secondary', Boolean(nearest));
      $('#walking-talk').textContent = nearest ? `Talk to ${nearest.name} · E` : 'Find a local to talk to · E';
      const interaction = getInteraction(), interactButton = $('#walking-interact');
      interactButton.hidden = !interaction || interaction.button === false;
      if (interaction) { interactButton.textContent = `${interaction.label} · Z`; interactButton.disabled = Boolean(interaction.disabled); }
      hud.dataset.interaction = interaction?.kind ?? '';
      const storefront = stores.reduce((best, store) => { const distance = Math.hypot(store.facade[0] - state.position[0], store.facade[1] + state.position[2]); return distance < (best?.distance ?? 16) ? { store, distance } : best; }, null);
      const room = currentRoom(), door = room ? null : doorway();
      $('.walking-title strong').textContent = sitting ? 'Seated' : transport ? 'Riding with Jev' : flight.active ? (flight.landing ? 'Landing' : 'In flight') : room?.name ?? storefront?.store.name ?? 'On foot';
      const enter = $('#walking-enter');
      enter.hidden = Boolean(sitting||transport)||(!room && !door);
      enter.disabled = Boolean(door && !canEnterStore(door));
      enter.textContent = room ? 'Step outside · F' : door ? canEnterStore(door) ? `Step inside ${door.name} · F` : `${door.name} · Invitation required` : '';
      hud.dataset.inside = room?.storeId ?? '';
      document.body.classList.toggle('inside-store', Boolean(room));
      const roomSummary=room && sharedRoomSummary(room);
      $('#walking-place').textContent = sitting ? 'Drag to look around · Z stands up' : transport ? 'W/S to ride or reverse · A/D or arrows to steer · Step out to leave your vehicle' : flight.active ? `${flight.altitude.toFixed(1)} m above ground · Space to rise · C to lower` : room ? room.theme === 'home'
        ? `Inside ${room.name} · ${roomSummary.label} · ${roomSummary.guests} resident${roomSummary.guests === 1 ? '' : 's'}`
        : `Inside ${room.name} · ${roomSummary.label} · ${roomSummary.staff} staff, ${roomSummary.guests} guests`
        : nearest ? `${nearest.anchorName} · nearby` : `${state.distance.toFixed(0)} m walked · ${pathLabel}`;
      hud.dataset.eyeHeight = (state.position[1] - environment.groundAt(state.position[0], state.position[2])).toFixed(2);
      hud.dataset.distance = state.distance.toFixed(2);
      hud.dataset.speed = state.speed.toFixed(2);
      hud.dataset.yaw = state.yaw.toFixed(3);
      hud.dataset.flying=String(flight.active);hud.dataset.altitude=flight.altitude.toFixed(2);
      hud.dataset.position = JSON.stringify(state.position);
    },
  };
}
