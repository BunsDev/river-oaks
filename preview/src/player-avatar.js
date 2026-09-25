import { createPlayerCostume } from './player-costume.js';
import { createFlightVehicle } from './flight-vehicles.js';
import * as THREE from 'three';
import { loadResidentAvatar } from './avatars.js';
import { turnToward } from './gait.js';
import { VISITOR_FORMS, createVisitorReactions } from './visitor-persona.js';
import './player-avatar.css';

export function createPlayerAvatar({ scene, host, walking, getLocals, reducedMotion }) {
  const holder = new THREE.Group();holder.name = 'Player character';scene.add(holder);
  const panel = document.createElement('section');panel.className = 'player-controls';panel.setAttribute('aria-label', 'Your character');
  panel.innerHTML = `<header class="player-identity">
    <div class="player-portrait"><img src="/assets/characters/jevica-portrait.png" alt="" width="72" height="88"></div>
    <div><div class="player-controls-title">Your character</div><h2 id="player-name">Jevica</h2><span id="player-role">The rose enchantress</span></div>
    <span id="player-mode" class="player-mode">On foot</span>
  </header>
  <details class="player-settings" open><summary>Character controls<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></summary>
    <p id="player-description"></p>
    <div class="player-actions"><button id="player-camera" type="button" aria-pressed="true"><span data-camera-label>Third person</span><kbd>V</kbd></button><button id="player-flight" type="button" aria-pressed="false"><span data-flight-label>Take flight</span><kbd>B</kbd></button></div>
    <div class="player-flight-pad" hidden><button type="button" data-flight-key="Space" aria-label="Ascend">↑ Rise</button><button type="button" data-flight-key="KeyC" aria-label="Descend">↓ Lower</button></div>
  </details><p id="player-status" role="status" aria-live="polite"></p>`;
  document.querySelector('#viewport').append(panel);
  panel.querySelector('.player-settings').open = !window.matchMedia('(max-width: 700px)').matches;
  const bubbles = document.createElement('div');bubbles.className = 'visitor-reactions';bubbles.setAttribute('aria-hidden', 'true');document.querySelector('#viewport').append(bubbles);
  const captions = Array.from({ length: 3 }, () => {const element = document.createElement('div');element.className = 'visitor-reaction';element.hidden = true;bubbles.append(element);return element;});
  const cameraButton = panel.querySelector('#player-camera'), status = panel.querySelector('#player-status');
  let avatar = null, outfit = null, vehicle = null, form = 'jevica', version = 0, previous = null, reactionPeople = [], lastNotice = '', disposed = false, castUntil = 0;
  const listeners = new Set();
  const reactions = createVisitorReactions(), point = new THREE.Vector3();
  const flightButton=panel.querySelector('#player-flight');
  flightButton.addEventListener('click',()=>{if(!walking.toggleFlight())status.textContent='Step outside to take flight.';});
  host.addEventListener('keydown',event=>{if(event.code==='KeyB'&&!event.repeat){event.preventDefault();if(!walking.toggleFlight())status.textContent='Step outside to take flight.';}});
  for(const button of panel.querySelectorAll('[data-flight-key]')) {
    const release=()=>host.dispatchEvent(new KeyboardEvent('keyup',{code:button.dataset.flightKey,bubbles:true}));
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);host.focus();host.dispatchEvent(new KeyboardEvent('keydown',{code:button.dataset.flightKey,bubbles:true}));});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
  }
  const toggleCamera = enabled => { walking.setThirdPerson(enabled);cameraButton.querySelector('[data-camera-label]').textContent = enabled ? 'Third person' : 'First person';cameraButton.setAttribute('aria-pressed', String(enabled)); };
  cameraButton.addEventListener('click', () => toggleCamera(!walking.thirdPerson));
  host.addEventListener('keydown', event => {if (event.code === 'KeyV' && !event.repeat) {event.preventDefault();toggleCamera(!walking.thirdPerson);} });
  const change = async value => {
    const generation = ++version;
    value = 'jevica';
    panel.setAttribute('aria-busy', 'true');status.textContent = 'Preparing Jevica…';
    host.dataset.playerReady = 'false';
    let next, nextOutfit, nextVehicle;
    try {
      const chosen = VISITOR_FORMS.find(item => item.id === value) ?? VISITOR_FORMS.at(-1);
      const portrait = new Image();portrait.src = `/assets/characters/${chosen.id}-portrait.png`;
      const portraitReady = portrait.decode().then(() => true, () => false);
      next = await loadResidentAvatar(chosen.avatar, 'player', chosen.profile);
      const hasPortrait = await portraitReady;
      if (disposed || generation !== version) {next.dispose();return;}
      nextOutfit = createPlayerCostume(next, value);nextVehicle = createFlightVehicle(value);
      outfit?.dispose();vehicle?.dispose();avatar?.dispose();holder.clear();avatar = next;outfit = nextOutfit;vehicle = nextVehicle;holder.add(avatar.object,vehicle.object);
      next = nextOutfit = nextVehicle = null;
      form = value;reactions.reset();toggleCamera(true);
      const identity = VISITOR_FORMS.find(item => item.id === form);
      panel.dataset.form = form;
      panel.querySelector('#player-name').textContent = identity.label;
      panel.querySelector('#player-role').textContent = identity.role;
      const portraitImage=panel.querySelector('.player-portrait img');
      portraitImage.src=portrait.src;portraitImage.hidden=!hasPortrait;
      panel.querySelector('#player-description').textContent = VISITOR_FORMS.find(item => item.id === form).description;
<<<<<<< Updated upstream
      status.textContent = `${VISITOR_FORMS.find(item => item.id === form).label} transformation ready.`;
=======
      status.textContent = `${VISITOR_FORMS.find(item => item.id === form).label} is ready. Meet a neighbor to grant a wish.`;
>>>>>>> Stashed changes
      host.dataset.playerForm = value;host.dataset.playerReady = 'true';
      listeners.forEach(listener => listener(form));
    } catch {
      nextOutfit?.dispose();nextVehicle?.dispose();next?.dispose();
      if (generation === version) {host.dataset.playerReady=String(Boolean(avatar));status.textContent = 'Jevica could not load. Reload to try again.';}
    }
    finally {if (generation === version) panel.setAttribute('aria-busy', 'false');}
  };
  change('jevica');
  return {
    get form() {return form;},
    // The shared town plays as one character; single player keeps the choice.
    lockForm(value, reason) {
      selector.disabled = true; selector.title = reason ?? '';
      if (form !== value) return change(value);
    },
    cast(now) { castUntil = now + 520; },
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    react(now) {
      const pose = walking.getPose();
      reactionPeople = reactions.update(getLocals() ?? [], pose, form, now, position => walking.canSee(position));
      host.dataset.visitorReactions = JSON.stringify(reactionPeople.map(local => ({id:local.id,form,action:local.visitorReaction.action})));
    },
    update(now, camera) {
      const pose = walking.getPose();panel.hidden = !pose;holder.visible = Boolean(pose?.showBody && avatar);
      host.dataset.cameraMode = walking.thirdPerson ? 'third' : 'first';host.dataset.playerVisible = String(holder.visible);
      if (pose && avatar) {
        holder.position.set(pose.position[0], pose.ground + pose.altitude, pose.position[2]);
        vehicle.object.visible=pose.flying;
        const dt = previous === null ? 0 : Math.min(0.08, (now - previous) / 1000);
        if (previous === null || pose.speed > 0.05) holder.rotation.y = turnToward(holder.rotation.y, pose.speed > 0.05 ? Math.atan2(pose.velocity[0], pose.velocity[1]) : pose.yaw + Math.PI, previous === null ? 1 : dt);
        avatar.update(now, now < castUntil ? 'amazed' : 'continue', false, {speed:pose.flying?0:pose.speed,distance:pose.distance,flying:pose.flying,vehicle:form}, pose.groundAt);outfit.update(pose.flying);
      }
      previous = pose ? now : null;
      flightButton.querySelector('[data-flight-label]').textContent=pose?.flying?(pose.landing?'Cancel landing':'Land'):'Take flight';
      panel.querySelector('#player-mode').textContent=pose?.flying?(pose.landing?'Landing':'In flight'):'On foot';flightButton.setAttribute('aria-pressed',String(Boolean(pose?.flying)));
      panel.querySelector('.player-flight-pad').hidden=!pose?.flying;host.dataset.flightVehicle=pose?.flying?form:'';
      const visible = reactionPeople.filter(local => local.visitorReaction && (!local.indoor || document.querySelector('[data-layer="interiors"]').checked));
      const width = host.clientWidth, height = host.clientHeight;
      captions.forEach((caption, index) => {
        const local = visible[index];caption.hidden = true;if (!pose || !local) return;
        point.set(local.position[0], local.position[2] + 2.15, -local.position[1]).project(camera);
        if (point.z < -1 || point.z > 1 || Math.abs(point.x) > 0.93 || Math.abs(point.y) > 0.85) return;
        caption.hidden = false;caption.style.transform = `translate(${(point.x + 1) * width / 2}px,${(1 - point.y) * height / 2}px) translate(-50%,-100%)`;
        const message = `${local.name}: ${local.visitorReaction.text}`;if (caption.textContent !== message) caption.textContent = message;
      });
      const first = visible[0], notice = first ? `${first.name}: ${first.visitorReaction.text}` : '';
      if (notice && notice !== lastNotice) {status.textContent = notice;lastNotice = notice;}
      if (!notice) lastNotice = '';
      // No flashing or camera shake: transformations also respect reduced motion.
      holder.userData.reducedMotion = reducedMotion;
    },
    dispose() {disposed = true;version++;outfit?.dispose();vehicle?.dispose();avatar?.dispose();holder.removeFromParent();panel.remove();bubbles.remove();},
  };
}
