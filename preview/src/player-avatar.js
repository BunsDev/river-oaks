import { createPlayerAttention } from './player-attention.js';
import { createPlayerCostume } from './player-costume.js';
import { createFlightVehicle } from './flight-vehicles.js';
import { createParkedCarriage } from './parked-carriage.js';
import { createCarriageEncounter } from './carriage-encounter.js';
import * as THREE from 'three';
import { AVATAR_PROFILES, loadResidentAvatar } from './avatars.js';
import { turnToward } from './gait.js';
import { VISITOR_FORMS, createVisitorReactions } from './visitor-persona.js';
import { APPEARANCE_COOLDOWN_MS, CHARACTERS, JEVICA_OWNER_USER_ID, appearanceFor, canUseAppearance, defaultAppearanceFor, permittedAppearance, sharedAppearance, sharedCharacter } from './shared-appearances.js';
import './player-avatar.css';

export function createPlayerAvatar({ scene, host, walking, userId, getLocals, getWorld, getConversation=()=>null, requestAppearance=()=>Promise.resolve({ok:false}), requestMovement=()=>Promise.resolve({ok:false}), getPortrait=null, reducedMotion }) {
  const holder = new THREE.Group();holder.name = 'Player character';scene.add(holder);
  const owner=userId===JEVICA_OWNER_USER_ID;
  let sharedMode=false,crewLocal=null;
  const crewLocals=()=>{
    const locals=getLocals()??[];
    const current=locals.find(local=>local.id==='carriage-driver');
    if(current)crewLocal=current;
    if(sharedMode&&owner&&!crewLocal)crewLocal=createCarriageEncounter(getWorld())[0]??null;
    return sharedMode&&owner&&crewLocal&&!current?[...locals,crewLocal]:locals;
  };
  const carriage=createParkedCarriage({scene,walking,getWorld,getLocals:crewLocals,getConversation,reducedMotion});
  const panel = document.createElement('section');panel.className = 'player-controls';panel.setAttribute('aria-label', 'Your character');
  panel.innerHTML = `<header class="player-identity">
    <div class="player-portrait"><img src="/assets/characters/jevica-portrait.png" alt="" width="72" height="88" ${owner?'':'hidden'}><span class="player-monogram" ${owner?'hidden':''} aria-hidden="true">${owner?'J':'S'}</span></div>
    <div><div class="player-controls-title">Your character</div><h2 id="player-name">${owner?'Jevica':'Sable'}</h2><span id="player-role">${owner?'Rose enchantress':'Fox charmer'}</span></div>
    <span id="player-mode" class="player-mode">On foot</span>
  </header>
  <fieldset class="character-picker">
    <legend>Character</legend>
    <div class="character-roster">${CHARACTERS.map(character=>`<label class="character-chip" ${character.id==='jevica'&&!owner?'hidden':''} style="--character-accent:${character.accent}" title="${character.name} · ${character.title}"><input type="radio" name="player-character" value="${character.id}"><span class="character-chip-mark" aria-hidden="true">${character.name[0]}</span><span class="character-chip-name">${character.name}</span></label>`).join('')}</div>
    <fieldset class="character-option" data-option="variant" hidden><legend>Style</legend><div class="character-segments" data-variants></div></fieldset>
    <fieldset class="character-option" data-option="form"><legend>Form</legend><div class="character-segments">
      <label><input type="radio" name="player-form" value="human"><span>Humanoid</span></label>
      <label><input type="radio" name="player-form" value="beast"><span>Beast<small data-species></small></span></label>
    </div></fieldset>
  </fieldset>
  <p id="player-description"></p><a id="player-reference" class="player-reference" target="_blank" rel="noopener" hidden>View full character reference</a>
  <div class="player-actions player-quick-actions"><button id="player-flight" type="button" aria-pressed="false"><span data-flight-label>Take flight</span><kbd>B</kbd></button><button id="player-companion" type="button" aria-pressed="false"><span data-companion-label>Walk with Jev</span><kbd>J</kbd></button><button id="player-beast-movement" type="button" aria-pressed="false" hidden><span data-beast-label>Beast movement</span><kbd>P</kbd></button></div>
  <div class="player-flight-pad" hidden><button type="button" data-flight-key="Space" aria-label="Ascend">↑ Rise</button><button type="button" data-flight-key="KeyC" aria-label="Descend">↓ Lower</button></div>
  <p id="player-companion-status" class="player-companion-status" role="status" aria-live="polite"></p>
  <details class="player-settings"><summary>Rides & camera<svg viewBox="0 0 20 20" aria-hidden="true"><path d="m6 8 4 4 4-4"/></svg></summary>
    <div class="player-actions"><button id="player-camera" type="button" aria-pressed="true"><span data-camera-label>Third person</span><kbd>V</kbd></button></div>
    <section class="vehicle-garage" aria-label="Jev chauffeur">
      <div class="vehicle-garage-title"><span>Your chauffeur</span><span aria-hidden="true">✧</span></div>
      <label for="player-vehicle">Your ride</label><select id="player-vehicle"><option value="rolls">Pink Rolls-Royce</option><option value="motorcycle">Rose motorcycle</option></select>
      <div class="player-actions"><button id="player-carriage" type="button">Call vehicle</button><button id="player-ride" type="button">Ride with Jev</button></div>
      <button id="player-chauffeur" type="button" aria-pressed="false">Jev smart drive</button><p id="player-drive-status" role="status" aria-live="polite">Jev is ready</p>
    </section>
  </details><p id="player-status" role="status" aria-live="polite"></p>`;
  document.querySelector('#viewport').append(panel);
  const cameraButton = panel.querySelector('#player-camera'), status = panel.querySelector('#player-status');
  panel.addEventListener('click',event=>{
    if(event.detail>0&&event.target.closest('.player-actions button'))host.focus({preventScroll:true});
  });
  const carriageButton=panel.querySelector('#player-carriage');
  carriageButton.addEventListener('click',()=>{
    const summoned=carriage.summon();status.textContent=summoned?`${carriage.label} is waiting nearby.`:'Find a clear stretch of road to call your ride.';
    walking.notify?.(status.textContent);
    if(carriage.placement)walking.lookAt([carriage.placement.position[0],-carriage.placement.position[2],carriage.placement.position[1]]);
  });
  const vehicleSelect=panel.querySelector('#player-vehicle'),driveButton=panel.querySelector('#player-chauffeur'),driveStatus=panel.querySelector('#player-drive-status');
  vehicleSelect.addEventListener('change',()=>{if(!carriage.select(vehicleSelect.value)){vehicleSelect.value=carriage.kind;status.textContent='Step out and find clear road space before changing vehicles.';}else status.textContent=`${carriage.label} is ready.`;});
  driveButton.addEventListener('click',()=>{if(carriage.chauffeur.active)carriage.stopTour();else if(!carriage.tour())status.textContent='Board your vehicle on a clear road to start a scenic drive.';});
  const rideButton=panel.querySelector('#player-ride');
  rideButton.addEventListener('click',()=>{
    if(carriage.riding)status.textContent=carriage.leave()?'You stepped out of the vehicle.':'There is no clear place to step out here.';
    else status.textContent=carriage.board()?'Ride with Jev, or give directions with W/S and A/D.':'Walk closer to your vehicle before boarding.';
  });
  // Keep the detailed decision source in diagnostics; the player sees what Jev
  // is doing and whether he is following locally while the connection recovers.
  const companionButton=panel.querySelector('#player-companion'),companionStatus=panel.querySelector('#player-companion-status');
  const toggleCompanion=()=>{
    const next=!carriage.prince.companion.enabled;
    if(next&&!carriage.placement){status.textContent='Call your ride first; Prince Jev comes with it.';return;}
    if(!carriage.prince.setCompanion(next))status.textContent='Walk closer to Jev, with a clear space beside the vehicle.';
  };
  companionButton.addEventListener('click',toggleCompanion);
  host.addEventListener('keydown',event=>{if(event.code==='KeyJ'&&!event.repeat&&(!sharedMode||owner)){event.preventDefault();toggleCompanion();}});
  carriage.prince.onCompanion(value=>{
    companionButton.setAttribute('aria-pressed',String(value.enabled));
    companionButton.querySelector('[data-companion-label]').textContent=value.enabled?'Send Jev to your ride':'Walk with Jev';
    const unavailable=value.source==='local'&&value.enabled&&(['offline','timeout','not_configured','unavailable','transport_error','invalid_answer','low_confidence','busy'].includes(value.reason)||/^provider_\d{3}$/.test(value.reason??''));
    companionStatus.textContent=value.mode==='seat'&&!value.enabled?'':`${value.label}${value.carrying?' · Carrying your shopping bag':''}${unavailable?' · Smart guidance unavailable; Jev stays with you':''}`;
    host.dataset.companion=JSON.stringify(value);
  });
  const identity = VISITOR_FORMS[0], form = identity.id;
  let avatar = null, outfit = null, vehicle = null, version = 0, previous = null, disposed = false, castUntil = 0, forceTarget = null;
  // Solo choices stay on this device; in the shared town the account owns both
  // the appearance and whether a beast form moves like its animal.
  let soloAppearance=defaultAppearanceFor(userId),soloMovement=false;
  try{
    soloAppearance=permittedAppearance(userId,localStorage.getItem('river-oaks-character'));
    soloMovement=localStorage.getItem('river-oaks-beast-movement')==='beast';
  }catch{}
  let appearance=soloAppearance,sharedName=null,sharedMovement='upright',movement='upright',loadedAppearance=null,portraitWanted=null;
  // Shared play: a choice the town has not confirmed yet, shown in the picker meanwhile.
  let wanted=null,sending=false,flushTimer=0,confirmedAt=-Infinity;
  const picker=panel.querySelector('.character-picker'),variantOption=picker.querySelector('[data-option=variant]'),variantList=picker.querySelector('[data-variants]');
  const beastButton=panel.querySelector('#player-beast-movement');
  const movementFor=id=>sharedAppearance(id)?.form==='beast'&&(sharedMode?sharedMovement==='beast':soloMovement)?'beast':'upright';
  // The picker always shows the current appearance as character, style and form.
  const syncPicker=()=>{
    const current=sharedAppearance(wanted??appearance),person=sharedCharacter(current.character),worn=sharedAppearance(appearance);
    for(const input of picker.querySelectorAll('[name=player-character]'))input.checked=input.value===person.id;
    for(const input of picker.querySelectorAll('[name=player-form]'))input.checked=input.value===current.form;
    picker.querySelector('[data-species]').textContent=person.species;
    variantOption.hidden=person.variants.length<2;
    if(variantList.dataset.character!==person.id){
      variantList.dataset.character=person.id;
      variantList.replaceChildren(...person.variants.map(variant=>{
        const label=document.createElement('label'),input=document.createElement('input'),text=document.createElement('span');
        input.type='radio';input.name='player-variant';input.value=variant.id;text.textContent=variant.short??variant.label;label.title=variant.label;
        label.append(input,text);return label;
      }));
    }
    for(const input of variantList.querySelectorAll('input'))input.checked=input.value===current.variant;
    movement=movementFor(appearance);
    beastButton.hidden=worn.form!=='beast';beastButton.setAttribute('aria-pressed',String(movement==='beast'));
    picker.dataset.form=current.form;host.dataset.playerMovement=movement;
  };
  const applySharedPlayer=player=>{
    sharedMovement=player.movement==='beast'?'beast':'upright';
    const confirmed=permittedAppearance(userId,player.appearance);
    if(confirmed!==appearance){appearance=confirmed;syncPicker();load();return true;}
    syncPicker();return false;
  };
  // The town takes one appearance change every two seconds. Picking a person
  // and then a form is two quick choices, so keep only the latest and send it
  // as soon as the town will accept it rather than surfacing a cooldown.
  // A little over the town's cooldown, so a paced change never arrives early.
  const APPEARANCE_PACE=APPEARANCE_COOLDOWN_MS+100;
  const flushAppearance=async()=>{
    clearTimeout(flushTimer);
    if(sending||!wanted||!sharedMode)return;
    if(wanted===appearance){
      wanted=null;picker.removeAttribute('aria-busy');
      if(status.textContent==='Saving character…')status.textContent='';
      syncPicker();return;
    }
    const wait=confirmedAt+APPEARANCE_PACE-performance.now();
    if(wait>0){flushTimer=setTimeout(flushAppearance,wait);return;}
    const next=wanted;sending=true;
    try{
      const result=await requestAppearance(next);
      if(result?.ok){confirmedAt=performance.now();if(result.player)applySharedPlayer(result.player);}
      else if(result?.error==='appearance_cooldown')confirmedAt=performance.now();
      else{if(wanted===next)wanted=null;status.textContent=result?.message??'Character could not be saved.';}
    }
    catch(error){if(wanted===next)wanted=null;status.textContent=error.message;}
    finally{
      sending=false;
      if(wanted)flushAppearance();else{picker.removeAttribute('aria-busy');syncPicker();}
    }
  };
  const choose=id=>{
    const next=sharedAppearance(id)?.id;
    if(!next||!canUseAppearance(userId,next)){syncPicker();return;}
    if(!sharedMode){
      if(next!==appearance){appearance=soloAppearance=next;try{localStorage.setItem('river-oaks-character',next);}catch{}load();}
      syncPicker();return;
    }
    wanted=next;picker.setAttribute('aria-busy','true');status.textContent='Saving character…';syncPicker();
    // A short pause lets person, style and form clicks arrive as one change.
    clearTimeout(flushTimer);flushTimer=setTimeout(flushAppearance,250);
  };
  // Changing person keeps the chosen form (and style, where it exists).
  picker.addEventListener('change',event=>{
    const current=sharedAppearance(wanted??appearance),input=event.target;
    if(input.name==='player-character')choose(appearanceFor(input.value,{variant:current.variant,form:current.form})?.id);
    else if(input.name==='player-variant')choose(appearanceFor(current.character,{variant:input.value,form:current.form})?.id);
    else if(input.name==='player-form')choose(appearanceFor(current.character,{variant:current.variant,form:input.value})?.id);
  });
  const toggleBeastMovement=async()=>{
    const current=sharedAppearance(appearance),person=sharedCharacter(current.character);
    if(current.form!=='beast'){const message='Beast movement belongs to beast forms. Choose Beast under Form first.';status.textContent=message;walking.notify?.(message);return;}
    const next=movement==='beast'?'upright':'beast';
    const message=next==='beast'?`Beast movement on: ${person.name} prowls and lopes like a ${person.species.toLowerCase()}.`:'Beast movement off.';
    if(!sharedMode){
      soloMovement=next==='beast';try{localStorage.setItem('river-oaks-beast-movement',next);}catch{}
      syncPicker();status.textContent=message;return;
    }
    beastButton.disabled=true;
    try{
      const result=await requestMovement(next);
      if(result?.ok){sharedMovement=result.player?.movement??next;status.textContent=message;}
      // A town server from before beast movement does not know the command.
      else status.textContent=result?.error==='invalid_command'?'This town does not support beast movement yet.':result?.message??'Movement could not be saved.';
    }
    catch(error){status.textContent=error.message;}
    finally{beastButton.disabled=false;syncPicker();}
  };
  beastButton.addEventListener('click',toggleBeastMovement);
  // P for prowl; Force mode already uses X to lower what it holds.
  host.addEventListener('keydown',event=>{if(event.code==='KeyP'&&!event.repeat){event.preventDefault();toggleBeastMovement();}});
  syncPicker();
  const listeners = new Set();
  const reactions = createVisitorReactions(),attention=createPlayerAttention();
  const flightButton=panel.querySelector('#player-flight');
  // A refused take-off says so where the player is looking, not only in the dock.
  const refuseFlight=()=>{
    const hud=document.querySelector('#walking-hud')?.dataset??{};
    const message=hud.inside?'You’re indoors: step outside to take flight.':walking.getPose?.()?.riding?'Step out of your ride to take flight.':'No room to take off here: step out from under the arcade or trees.';
    status.textContent=message;walking.notify?.(message);
  };
  flightButton.addEventListener('click',()=>{if(!walking.toggleFlight())refuseFlight();});
  host.addEventListener('keydown',event=>{if(event.code==='KeyB'&&!event.repeat){event.preventDefault();if(!walking.toggleFlight())refuseFlight();}});
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
    panel.setAttribute('aria-busy', 'true');status.textContent = 'Loading appearance…';
    host.dataset.playerReady = 'false';
    let next, nextOutfit, nextVehicle;
    try {
      const chosenProfile=appearance,character=sharedAppearance(chosenProfile),rigProfile=character.rig??chosenProfile;
      const portrait = new Image();
      let portraitReady=Promise.resolve(false);
      if(character.portrait||character.reference){
        portrait.src=character.portrait??character.reference;
        portraitReady=portrait.decode().then(()=>true,()=>false);
      }
      const avatarIndex=rigProfile==='jevica'?identity.avatar:AVATAR_PROFILES.indexOf(rigProfile);
      next = await loadResidentAvatar(avatarIndex, 'player', rigProfile,{folk:false,appearanceId:chosenProfile});
      const hasPortrait = await portraitReady;
      if (disposed || generation !== version) {next.dispose();return;}
      const outfitAvatar=next;
      nextOutfit = character.costume==='jevica'?createPlayerCostume(next, form):{
        update(){},updateOptics(){},
        getWandTip(target){return outfitAvatar.rig.model.getObjectByName('hand_r')?.getWorldPosition(target)??null;},
        dispose(){},
      };
      nextVehicle = createFlightVehicle(form);
      const firstLoad=!avatar;
      outfit?.dispose();vehicle?.dispose();avatar?.dispose();holder.clear();avatar = next;outfit = nextOutfit;vehicle = nextVehicle;holder.add(avatar.object,vehicle.object);
      loadedAppearance=chosenProfile;
      next = nextOutfit = nextVehicle = null;
      reactions.reset();if(firstLoad)toggleCamera(true);
      panel.dataset.form = form;
      panel.querySelector('#player-name').textContent = sharedMode?(sharedName??character.name):character.name;
      panel.querySelector('#player-role').textContent = character.role;
      const portraitImage=panel.querySelector('.player-portrait img');
      if(hasPortrait)portraitImage.src=portrait.src;
      portraitImage.classList.toggle('turnaround',Boolean(hasPortrait&&character.reference&&!character.portrait));
      portraitImage.classList.toggle('tall-reference',Boolean(hasPortrait&&character.portraitStyle==='tall'));
      portraitImage.classList.toggle('collage-reference',Boolean(hasPortrait&&character.portraitStyle==='collage'));
      portraitImage.style.setProperty('--portrait-left',character.portraitLeft??'0px');
      portraitImage.hidden=!hasPortrait;portraitImage.classList.remove('live-portrait');
      // Without authored art, a studio portrait of the 3D form replaces the
      // monogram once it has been posed for a frame.
      portraitWanted=hasPortrait?null:chosenProfile;
      const monogram=panel.querySelector('.player-monogram');monogram.hidden=hasPortrait;monogram.textContent=character.name[0];
      monogram.parentElement.style.setProperty('--character-accent',character.accent);
      panel.querySelector('#player-description').textContent = character.description;
      const referenceLink=panel.querySelector('#player-reference');referenceLink.hidden=!character.reference;referenceLink.href=character.reference??'#';
      status.textContent = '';
      host.dataset.playerForm = form;host.dataset.playerAppearance=chosenProfile;host.dataset.playerAppearanceForm=character.form;host.dataset.playerReady = 'true';
      listeners.forEach(listener => listener(form));
    } catch {
      nextOutfit?.dispose();nextVehicle?.dispose();next?.dispose();
      if (generation === version) {host.dataset.playerReady=String(Boolean(avatar));status.textContent = 'Appearance could not load. Try another choice.';}
    }
    finally {if (generation === version) panel.setAttribute('aria-busy', 'false');}
  };
  load();
  return {
    get carriage(){return carriage;},
    get object(){return holder;},
    get form() {return form;},
    setSharedMode(value){
      if(sharedMode===value)return;
      if(value&&owner)crewLocals();
      sharedMode=value;const crewAllowed=!value||owner;
      carriage.setEnabled(crewAllowed);panel.querySelector('.vehicle-garage').hidden=!crewAllowed;companionButton.hidden=!crewAllowed;companionStatus.hidden=!crewAllowed;
      clearTimeout(flushTimer);wanted=null;picker.removeAttribute('aria-busy');
      appearance=value?defaultAppearanceFor(userId):soloAppearance;sharedName=null;sharedMovement='upright';syncPicker();load();
    },
    setSharedIdentity(player){
      if(!player)return;
      sharedName=player.name;panel.querySelector('#player-name').textContent=sharedName;
      if(!applySharedPlayer(player))panel.querySelector('#player-description').textContent=sharedAppearance(appearance).description;
    },
    get appearance(){return appearance;},
    get movement(){return movement;},
    // The loaded avatar, for a studio portrait of the given appearance only.
    portraitSubject(id){return avatar&&loadedAppearance===id&&id===appearance?avatar.object:null;},
    get rig() {return avatar?.rig;},
    get feet() {return avatar?.feet??[];},
    get attention() {return attention.pose;},
    cast(now) { castUntil = now + 520; },
    setForceTarget(target) {forceTarget=target;},
    getWandTip(target) {return outfit?.getWandTip(target)??null;},
    onChange(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    react(now) {
      const pose = walking.getPose();
      const visitorForm=sharedMode?null:form;
      const reactionPeople = reactions.update(getLocals() ?? [], pose, visitorForm, now, position => walking.canSee(position));
      host.dataset.visitorReactions = JSON.stringify(reactionPeople.map(local => ({id:local.id,form:visitorForm,action:local.visitorReaction.action})));
    },
    update(now,camera,viewportHeight) {
      const pose = walking.getPose();panel.hidden = !pose;holder.visible = Boolean(pose?.showBody && avatar);
      carriage.update(now);carriage.updateOptics(camera,viewportHeight);
      const prince=carriage.prince.companion,away=prince.mode!=='seat';
      carriageButton.disabled=sharedMode&&!owner||!pose||Boolean(pose.roomId)||pose.flying||carriage.riding||away;
      companionButton.disabled=sharedMode&&!owner||!pose||!carriage.placement||carriage.riding||(!prince.enabled&&away)||(!away&&(pose.flying||Boolean(pose.roomId)));
      rideButton.disabled=sharedMode&&!owner||!pose||Boolean(pose.roomId)||pose.flying||!carriage.placement||away;
      rideButton.textContent=carriage.riding?'Step out':'Ride with Jev';
      vehicleSelect.disabled=sharedMode&&!owner||carriage.riding||away;driveButton.disabled=sharedMode&&!owner||!carriage.riding||away;
      driveButton.textContent=carriage.chauffeur.active?'Stop the ride':'Jev smart drive';driveButton.setAttribute('aria-pressed',String(carriage.chauffeur.active));
      if(driveStatus.textContent!==carriage.chauffeur.label)driveStatus.textContent=carriage.chauffeur.label;
      host.dataset.vehicle=carriage.kind;host.dataset.chauffeur=JSON.stringify(carriage.chauffeur);
      host.dataset.riding=String(carriage.riding);flightButton.disabled=carriage.riding;
      carriageButton.title=pose?.roomId?'Step outside to call your ride':pose?.flying?'Land to call your ride':'';
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
        avatar.update(now, forceTarget&&!pose.riding?'force':now < castUntil ? 'amazed' : 'continue', false, {speed:pose.flying||pose.riding?0:pose.speed,flightSpeed:pose.flying?pose.speed:0,distance:pose.distance,heading:forceTarget?travelHeading:undefined,flying:pose.flying,riding:Boolean(pose.riding),ridingKind:pose.riding?.kind,seatToFloor:pose.riding?.seatToFloor,vehicle:form,beast:movement==='beast'}, pose.groundAt, focus.target, {conversing:focus.mode==='conversation'});outfit.update(pose.flying,now,Boolean(pose.riding));
        outfit.updateOptics(camera,viewportHeight);
        host.dataset.beastMotion=(avatar.beastMotion??0).toFixed(2);
        if(portraitWanted&&getPortrait){
          const id=portraitWanted;portraitWanted=null;
          getPortrait(`player-look:${id}`).then(url=>{
            if(!url||disposed||loadedAppearance!==id)return;
            const image=panel.querySelector('.player-portrait img');
            image.classList.remove('turnaround','tall-reference','collage-reference');image.classList.add('live-portrait');
            image.src=url;image.hidden=false;panel.querySelector('.player-monogram').hidden=true;
          },()=>{});
        }
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
