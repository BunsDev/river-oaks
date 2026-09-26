import { createPlayerAttention } from './player-attention.js';
import { createPlayerCostume } from './player-costume.js';
import { createFlightVehicle } from './flight-vehicles.js';
import { createParkedCarriage } from './parked-carriage.js';
import * as THREE from 'three';
import { loadResidentAvatar } from './avatars.js';
import { turnToward } from './gait.js';
import { VISITOR_FORMS, createVisitorReactions } from './visitor-persona.js';
import './player-avatar.css';

export function createPlayerAvatar({ scene, host, walking, getLocals, getWorld, getConversation=()=>null, reducedMotion }) {
  const holder = new THREE.Group();holder.name = 'Player character';scene.add(holder);
  const carriage=createParkedCarriage({scene,walking,getWorld,getLocals,getConversation,reducedMotion});
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
    <div class="player-actions"><button id="player-carriage" type="button">Call carriage</button><button id="player-ride" type="button">Ride carriage</button></div>
  </details><p id="player-status" role="status" aria-live="polite"></p>`;
  document.querySelector('#viewport').append(panel);
  panel.querySelector('.player-settings').open = !window.matchMedia('(max-width: 700px)').matches;
  const cameraButton = panel.querySelector('#player-camera'), status = panel.querySelector('#player-status');
  panel.addEventListener('click',event=>{
    if(event.detail>0&&event.target.closest('.player-actions button'))host.focus({preventScroll:true});
  });
  const carriageButton=panel.querySelector('#player-carriage');
  carriageButton.addEventListener('click',()=>{
    status.textContent=carriage.summon()?'Your carriage is waiting nearby.':'Find a clear stretch of road for your carriage.';
    if(carriage.placement)walking.lookAt([carriage.placement.position[0],-carriage.placement.position[2],carriage.placement.position[1]]);
  });
  const rideButton=panel.querySelector('#player-ride');
  rideButton.addEventListener('click',()=>{
    if(carriage.riding)status.textContent=carriage.leave()?'You stepped out of the carriage.':'There is no clear place to step out here.';
    else status.textContent=carriage.board()?'W/S to ride or reverse. A/D or arrows to steer.':'Walk closer to your carriage before boarding.';
  });
  const identity = VISITOR_FORMS[0], form = identity.id;
  let avatar = null, outfit = null, vehicle = null, version = 0, previous = null, disposed = false, castUntil = 0, forceTarget = null;
  const listeners = new Set();
  const reactions = createVisitorReactions(),attention=createPlayerAttention();
  const flightButton=panel.querySelector('#player-flight');
  flightButton.addEventListener('click',()=>{if(!walking.toggleFlight())status.textContent='Move into clear outdoor space to take flight.';});
  host.addEventListener('keydown',event=>{if(event.code==='KeyB'&&!event.repeat){event.preventDefault();if(!walking.toggleFlight())status.textContent='Move into clear outdoor space to take flight.';}});
  for(const button of panel.querySelectorAll('[data-flight-key]')) {
    const release=()=>host.dispatchEvent(new KeyboardEvent('keyup',{code:button.dataset.flightKey,bubbles:true}));
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);host.focus();host.dispatchEvent(new KeyboardEvent('keydown',{code:button.dataset.flightKey,bubbles:true}));});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
  }
  const toggleCamera = enabled => { walking.setThirdPerson(enabled);cameraButton.querySelector('[data-camera-label]').textContent = enabled ? 'Third person' : 'First person';cameraButton.setAttribute('aria-pressed', String(enabled)); };
  cameraButton.addEventListener('click', () => toggleCamera(!walking.thirdPerson));
  host.addEventListener('keydown', event => {if (event.code === 'KeyV' && !event.repeat) {event.preventDefault();toggleCamera(!walking.thirdPerson);} });
  const load = async () => {
    const generation = ++version;
    panel.setAttribute('aria-busy', 'true');status.textContent = 'Loading Jevica…';
    host.dataset.playerReady = 'false';
    let next, nextOutfit, nextVehicle;
    try {
      const chosen = identity;
      const portrait = new Image();portrait.src = `/assets/characters/${chosen.id}-portrait.png`;
      const portraitReady = portrait.decode().then(() => true, () => false);
      next = await loadResidentAvatar(chosen.avatar, 'player', chosen.profile);
      const hasPortrait = await portraitReady;
      if (disposed || generation !== version) {next.dispose();return;}
      nextOutfit = createPlayerCostume(next, form);nextVehicle = createFlightVehicle(form);
      outfit?.dispose();vehicle?.dispose();avatar?.dispose();holder.clear();avatar = next;outfit = nextOutfit;vehicle = nextVehicle;holder.add(avatar.object,vehicle.object);
      next = nextOutfit = nextVehicle = null;
      reactions.reset();toggleCamera(true);
      panel.dataset.form = form;
      panel.querySelector('#player-name').textContent = identity.label;
      panel.querySelector('#player-role').textContent = identity.role;
      const portraitImage=panel.querySelector('.player-portrait img');
      portraitImage.src=portrait.src;portraitImage.hidden=!hasPortrait;
      panel.querySelector('#player-description').textContent = identity.description;
      status.textContent = 'Jevica is ready.';
      host.dataset.playerForm = form;host.dataset.playerReady = 'true';
      listeners.forEach(listener => listener(form));
    } catch {
      nextOutfit?.dispose();nextVehicle?.dispose();next?.dispose();
      if (generation === version) {host.dataset.playerReady=String(Boolean(avatar));status.textContent = 'Jevica could not load. Reload to try again.';}
    }
    finally {if (generation === version) panel.setAttribute('aria-busy', 'false');}
  };
  load();
  return {
    get carriage(){return carriage;},
    get object(){return holder;},
    get form() {return form;},
    get rig() {return avatar?.rig;},
    get feet() {return avatar?.feet??[];},
    get attention() {return attention.pose;},
    cast(now) { castUntil = now + 520; },
    setForceTarget(target) {forceTarget=target;},
    getWandTip(target) {return outfit?.getWandTip(target)??null;},
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    react(now) {
      const pose = walking.getPose();
      const reactionPeople = reactions.update(getLocals() ?? [], pose, form, now, position => walking.canSee(position));
      host.dataset.visitorReactions = JSON.stringify(reactionPeople.map(local => ({id:local.id,form,action:local.visitorReaction.action})));
    },
    update(now,camera,viewportHeight) {
      const pose = walking.getPose();panel.hidden = !pose;holder.visible = Boolean(pose?.showBody && avatar);
      carriage.update(now);
      carriageButton.disabled=!pose||Boolean(pose.roomId)||pose.flying||carriage.riding;
      rideButton.disabled=!pose||Boolean(pose.roomId)||pose.flying||!carriage.placement;
      rideButton.textContent=carriage.riding?'Leave carriage':'Ride carriage';
      host.dataset.riding=String(carriage.riding);flightButton.disabled=carriage.riding;
      carriageButton.title=pose?.roomId?'Step outside to call your carriage':pose?.flying?'Land to call your carriage':'';
      host.dataset.carriageReady=String(Boolean(carriage.placement));
      host.dataset.cameraMode = walking.thirdPerson ? 'third' : 'first';host.dataset.playerVisible = String(holder.visible);
      if (pose && avatar) {
        holder.position.set(pose.position[0], pose.ground + pose.altitude, pose.position[2]);
        if(pose.riding) {
          holder.position.fromArray(pose.riding.seat);holder.quaternion.fromArray(pose.riding.quaternion);
          holder.position.addScaledVector(new THREE.Vector3(0,1,0).applyQuaternion(holder.quaternion),-avatar.rig.hipHeight+.025);
        }
        if(!pose.riding){holder.rotation.x=0;holder.rotation.z=0;}
        vehicle.object.visible=pose.flying;
        const dt = previous === null ? 0 : Math.min(0.08, (now - previous) / 1000);
        const focus=attention.update(previous===null?0:(now-previous)/1000,{position:holder.position.toArray(),heading:holder.rotation.y,speed:pose.speed,riding:Boolean(pose.riding),flying:pose.flying,conversation:getConversation(),spell:forceTarget});
        const travelHeading=pose.speed>.05?Math.atan2(pose.velocity[0],pose.velocity[1]):undefined;
        if(!pose.riding&&(forceTarget||previous===null||pose.speed>.05)) {
          const facing=forceTarget?Math.atan2(forceTarget[0]-holder.position.x,forceTarget[2]-holder.position.z):travelHeading??pose.yaw+Math.PI;
          holder.rotation.y=turnToward(holder.rotation.y,facing,previous===null?1:dt);
        }
        if(focus.facing!==null)holder.rotation.y=focus.facing;
        avatar.update(now, forceTarget&&!pose.riding?'force':now < castUntil ? 'amazed' : 'continue', false, {speed:pose.flying||pose.riding?0:pose.speed,distance:pose.distance,heading:forceTarget?travelHeading:undefined,flying:pose.flying,riding:Boolean(pose.riding),seatToFloor:pose.riding?.seatToFloor,vehicle:form}, pose.groundAt, focus.target, {conversing:focus.mode==='conversation'});outfit.update(pose.flying,now,Boolean(pose.riding));
        outfit.updateOptics(camera,viewportHeight);
      }
      previous = pose ? now : null;
      flightButton.querySelector('[data-flight-label]').textContent=pose?.flying?(pose.landing?'Cancel landing':'Land'):'Take flight';
      panel.querySelector('#player-mode').textContent=pose?.riding?'Riding':pose?.flying?(pose.landing?'Landing':'In flight'):'On foot';flightButton.setAttribute('aria-pressed',String(Boolean(pose?.flying)));
      panel.querySelector('.player-flight-pad').hidden=!pose?.flying;host.dataset.flightVehicle=pose?.flying?form:'';
      // No flashing or camera shake: character motion respects reduced motion.
      holder.userData.reducedMotion = reducedMotion;
    },
    dispose() {disposed = true;version++;carriage.dispose();outfit?.dispose();vehicle?.dispose();avatar?.dispose();holder.removeFromParent();panel.remove();},
  };
}
