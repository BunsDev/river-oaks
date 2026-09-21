import { createFlightVehicle } from './flight-vehicles.js';
import * as THREE from 'three';
import { loadResidentAvatar } from './avatars.js';
import { turnToward } from './gait.js';
import { VISITOR_FORMS, createVisitorReactions } from './visitor-persona.js';
import './player-avatar.css';

const isSkin = name => /^(young|middleage|old)_/.test(name);
const isHair = name => /^(bob|short|ponytail|long|afro|curly)/.test(name);

function costume(avatar, form) {
  const { model, materials } = avatar.rig;
  const attachments = [], owned = new Set();
  const material = (color, extra = {}) => { const value = new THREE.MeshPhysicalMaterial({ color, roughness: 0.65, ...extra });owned.add(value);return value; };
  const skin = material('#789a89', { roughness: 0.48, emissive: '#244c3f', emissiveIntensity: 0.22 });
  const black = material('#080c12', { roughness: 0.15 });
  const purple = material('#23152e');
  const silver = material('#bdb7d3', { metalness: 0.7, roughness: 0.26 });
  const hair = material(form === 'jevica' ? '#e4c481' : '#8c5c35', { roughness: 0.58 });
  const glow = material(form === 'alien' ? '#94ffba' : '#c390e8', { emissive: form === 'alien' ? '#5bff9a' : '#aa54e0', emissiveIntensity: 1.3 });
  model.updateMatrixWorld(true);
  const attach = name => {
    const bone = model.getObjectByName(name), group = new THREE.Group();
    const rest = bone.getWorldQuaternion(new THREE.Quaternion()).invert();
    avatar.object.add(group);attachments.push({ bone, group, rest });return group;
  };
  const mesh = (group, geometry, surface, position, scale = [1, 1, 1]) => {
    owned.add(geometry);const item = new THREE.Mesh(geometry, surface);item.position.fromArray(position);item.scale.fromArray(scale);item.castShadow = item.receiveShadow = true;group.add(item);return item;
  };
  const sphere = (group, surface, position, scale) => mesh(group, new THREE.SphereGeometry(1, 24, 16), surface, position, scale);
  if (form !== 'visitor') {
    for (const [original, surface] of materials) {
      const name = original.name;
      if (isSkin(name)) {
        surface.color.set(form === 'alien' ? '#83a698' : form === 'witch' ? '#b5c794' : '#f0c8ad');
        if (form === 'alien') {surface.map = null;surface.roughness = 0.52;}
      } else if (isHair(name)) surface.color.set(form === 'witch' ? '#201a28' : '#8e633e');
      else if (!/^brown/.test(name)) {surface.map = null;surface.color.set(form === 'witch' ? '#24182e' : form === 'alien' ? '#162c30' : '#f4afcd');surface.roughness = 0.6;}
      surface.needsUpdate = true;
    }
  }
  if (form === 'alien') {
    model.traverse(item => { if (item.isMesh && isHair(item.material?.name ?? '')) item.visible = false; });
    model.getObjectByName('head').scale.set(1.38, 1.28, 1.25);
    const head = attach('head');
    sphere(head, skin, [0, 0.09, 0], [0.18, 0.23, 0.15]);
    for (const side of [-1, 1]) {
      const eye = sphere(head, black, [side * 0.086, 0.09, 0.128], [0.072, 0.092, 0.032]);eye.rotation.z = -side * 0.3;
      sphere(head, glow, [side * 0.085, 0.11, 0.158], [0.009, 0.025, 0.006]);
      const horn = mesh(head, new THREE.ConeGeometry(0.035, 0.22, 16), skin, [side * 0.15, 0.26, -0.04]);horn.rotation.z = -side * 0.4;
    }
    const chest = attach('spine_03');
    for (let i = 0; i < 3; i++) sphere(chest, glow, [0, -i * 0.065, 0.17], [0.045 - i * 0.008, 0.012, 0.015]);
  }
  if (form === 'witch') {
    const head = attach('head');
    mesh(head, new THREE.CylinderGeometry(0.42, 0.43, 0.035, 40), purple, [0, 0.19, 0]);
    const crown = mesh(head, new THREE.ConeGeometry(0.24, 0.71, 40), purple, [0.06, 0.53, 0]);crown.rotation.z = -0.18;
    mesh(head, new THREE.CylinderGeometry(0.23, 0.25, 0.075, 32), black, [0.015, 0.235, 0]);
    mesh(head, new THREE.TorusGeometry(0.045, 0.008, 8, 20), silver, [0, 0.24, 0.235]);
    const waist = attach('spine_01');
    mesh(waist, new THREE.CylinderGeometry(0.18, 0.37, 0.82, 40, 1, true), purple, [0, -0.35, 0]);
    const hand = attach('hand_l');
    mesh(hand, new THREE.CylinderGeometry(0.013, 0.021, 1.25, 12), hair, [0, -0.18, 0]);
    for(let i=0;i<24;i++){const angle=i*2.39996;const bristle=mesh(hand,new THREE.CylinderGeometry(0.004,0.007,0.36,5),hair,[Math.cos(angle)*0.055,-0.83,Math.sin(angle)*0.055]);bristle.rotation.z=Math.sin(angle)*0.13;}
    hand.userData.heldBroom=true;
  }
  if (form === 'jevica') {
    // Original Glinda-inspired costume: rose-petal gown, curls, crystal crown
    // and a star wand on the existing animated rig.
    model.traverse(item => { if (item.isMesh && isHair(item.material?.name ?? '')) item.visible = false; });
    const pink = material('#f5afc9', { roughness: 0.46, sheen: 1, sheenColor: new THREE.Color('#fff0f7'), sheenRoughness: 0.5, clearcoat: 0.2 });
    const palePink = material('#ffd3e5', { roughness: 0.5, sheen: 1, sheenColor: new THREE.Color('#fff6fc') });
    const crystal = material('#e6ddf6', { metalness: 0.3, roughness: 0.13, clearcoat: 1 });
    const head = attach('head');
    sphere(head, hair, [0, 0.14, -0.025], [0.125, 0.145, 0.105]);
    for (let lock = 0; lock < 10; lock++) {
      const angle = Math.PI * (0.18 + lock / 9 * 1.64);
      const points = Array.from({length:20}, (_, index) => {
        const t = index / 19, curl = t * Math.PI * 5 + lock;
        return new THREE.Vector3(Math.cos(angle) * 0.12 + Math.sin(curl) * 0.023, 0.17 - t * (0.43 + lock % 3 * 0.03), -0.065 - Math.sin(angle) * 0.07 + Math.cos(curl) * 0.024);
      });
      mesh(head, new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points), 28, 0.024, 8, false), hair, [0,0,0]);
    }
    const band = mesh(head, new THREE.TorusGeometry(0.125, 0.007, 8, 40), silver, [0,0.255,0]);band.rotation.x = Math.PI / 2;
    for (let i = 0; i < 11; i++) {
      const angle = i / 11 * Math.PI * 2, height = 0.12 + (i % 3 === 0 ? 0.14 : 0.04);
      mesh(head, new THREE.ConeGeometry(0.023, height, 5), crystal, [Math.cos(angle)*0.125,0.25+height/2,Math.sin(angle)*0.125]);
      mesh(head, new THREE.OctahedronGeometry(0.025), crystal, [Math.cos(angle)*0.125,0.26+height,Math.sin(angle)*0.125]);
    }
    for (const side of [-1,1]) mesh(head,new THREE.OctahedronGeometry(0.021),crystal,[side*0.125,-0.01,0.01]);
    const waist = attach('spine_01');
    const shape = [new THREE.Vector2(0.69,-0.94),new THREE.Vector2(0.67,-0.8),new THREE.Vector2(0.59,-0.59),new THREE.Vector2(0.46,-0.36),new THREE.Vector2(0.29,-0.08),new THREE.Vector2(0.17,0.1)];
    const skirt = new THREE.LatheGeometry(shape,64), vertices=skirt.attributes.position;
    for(let i=0;i<vertices.count;i++) {
      const x=vertices.getX(i),z=vertices.getZ(i),y=vertices.getY(i),angle=Math.atan2(z,x),fold=1+Math.sin(angle*14+y*3)*0.035;
      vertices.setXYZ(i,x*fold,y,z*fold);
    }
    skirt.computeVertexNormals();mesh(waist,skirt,pink,[0,0,0]);
    // Petal-shaped flounces keep the dress a soft, layered silhouette.
    for(let tier=0;tier<3;tier++) {
      const radius=0.31+tier*0.145, y=-0.17-tier*0.245;
      for(let petal=0;petal<12;petal++) {
        const angle=petal/12*Math.PI*2+tier*0.23;
        const flounce=sphere(waist,tier%2?palePink:pink,[Math.cos(angle)*radius,y,Math.sin(angle)*radius],[0.17,0.15,0.037]);
        flounce.rotation.y=-angle+Math.PI/2;flounce.rotation.z=0.16;
      }
    }
    const chest=attach('spine_03');
    for(let row=0;row<5;row++)for(let column=-2;column<=2;column++) sphere(chest,crystal,[column*0.042,-row*0.038,0.139],[0.008,0.009,0.006]);
    const hand=attach('hand_r');
    mesh(hand,new THREE.CylinderGeometry(0.006,0.007,0.65,12),silver,[0,0.23,0.035]);
    const star=new THREE.Shape();
    for(let i=0;i<10;i++){const angle=Math.PI/2+i*Math.PI/5,radius=i%2?0.042:0.108;const x=Math.cos(angle)*radius,y=Math.sin(angle)*radius;if(i)star.lineTo(x,y);else star.moveTo(x,y);}star.closePath();
    mesh(hand,new THREE.ExtrudeGeometry(star,{depth:0.015,bevelEnabled:true,bevelThickness:0.005,bevelSize:0.004,bevelSegments:2,steps:1}),crystal,[0,0.62,0.03]);
  }
  const position = new THREE.Vector3(), orientation = new THREE.Quaternion(), inverse = new THREE.Quaternion();
  return {
    update(flying = false) {
      attachments.forEach(({group})=>{if(group.userData.heldBroom)group.visible=!flying;});
      avatar.object.updateWorldMatrix(true, true);inverse.copy(avatar.object.getWorldQuaternion(orientation)).invert();
      for (const item of attachments) {
        item.bone.getWorldPosition(position);item.group.position.copy(avatar.object.worldToLocal(position));
        item.bone.getWorldQuaternion(orientation);item.group.quaternion.copy(inverse).multiply(orientation).multiply(item.rest);
      }
    },
    dispose() { attachments.forEach(({ group }) => group.removeFromParent());owned.forEach(item => item.dispose()); },
  };
}

export function createPlayerAvatar({ scene, host, walking, getLocals, reducedMotion }) {
  const holder = new THREE.Group();holder.name = 'Player character';scene.add(holder);
  const panel = document.createElement('section');panel.className = 'player-controls';panel.setAttribute('aria-label', 'Your character');
  panel.innerHTML = `<div class="player-controls-title">Your character</div><button id="player-camera" type="button" aria-pressed="true">Third person · V</button><label for="player-form">Become</label><select id="player-form">${VISITOR_FORMS.map(form => `<option value="${form.id}">${form.label}</option>`).join('')}</select><button id="player-flight" type="button" aria-pressed="false">Take flight · B</button><div class="player-flight-pad" hidden><button type="button" data-flight-key="Space" aria-label="Ascend">↑ Rise</button><button type="button" data-flight-key="KeyC" aria-label="Descend">↓ Lower</button></div><p id="player-description"></p><p id="player-status" role="status" aria-live="polite"></p>`;
  document.querySelector('#viewport').append(panel);
  const bubbles = document.createElement('div');bubbles.className = 'visitor-reactions';bubbles.setAttribute('aria-hidden', 'true');document.querySelector('#viewport').append(bubbles);
  const captions = Array.from({ length: 3 }, () => {const element = document.createElement('div');element.className = 'visitor-reaction';element.hidden = true;bubbles.append(element);return element;});
  const selector = panel.querySelector('#player-form'), cameraButton = panel.querySelector('#player-camera'), status = panel.querySelector('#player-status');
  let avatar = null, outfit = null, vehicle = null, form = 'jevica', version = 0, previous = null, reactionPeople = [], lastNotice = '', disposed = false;
  const reactions = createVisitorReactions(), point = new THREE.Vector3();
  const flightButton=panel.querySelector('#player-flight');
  flightButton.addEventListener('click',()=>{if(!walking.toggleFlight())status.textContent='Step outside to take flight.';});
  host.addEventListener('keydown',event=>{if(event.code==='KeyB'&&!event.repeat){event.preventDefault();if(!walking.toggleFlight())status.textContent='Step outside to take flight.';}});
  for(const button of panel.querySelectorAll('[data-flight-key]')) {
    const release=()=>host.dispatchEvent(new KeyboardEvent('keyup',{code:button.dataset.flightKey,bubbles:true}));
    button.addEventListener('pointerdown',event=>{event.preventDefault();button.setPointerCapture(event.pointerId);host.focus();host.dispatchEvent(new KeyboardEvent('keydown',{code:button.dataset.flightKey,bubbles:true}));});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(type,release);
  }
  const toggleCamera = enabled => { walking.setThirdPerson(enabled);cameraButton.textContent = enabled ? 'Third person · V' : 'First person · V';cameraButton.setAttribute('aria-pressed', String(enabled)); };
  cameraButton.addEventListener('click', () => toggleCamera(!walking.thirdPerson));
  host.addEventListener('keydown', event => {if (event.code === 'KeyV' && !event.repeat) {event.preventDefault();toggleCamera(!walking.thirdPerson);} });
  const change = async value => {
    const generation = ++version;
    selector.value = value;panel.setAttribute('aria-busy', 'true');status.textContent = 'Changing character…';
    try {
      const next = await loadResidentAvatar(value === 'alien' ? 1 : value === 'jevica' ? 4 : 2, 'player');
      if (disposed || generation !== version) {next.dispose();return;}
      const nextOutfit = costume(next, value);
      outfit?.dispose();vehicle?.dispose();avatar?.dispose();holder.clear();avatar = next;outfit = nextOutfit;holder.add(avatar.object);vehicle=createFlightVehicle(value);holder.add(vehicle.object);
      form = value;reactions.reset();toggleCamera(true);
      panel.querySelector('#player-description').textContent = VISITOR_FORMS.find(item => item.id === form).description;
      status.textContent = value === 'visitor' ? 'Ready to explore.' : `${VISITOR_FORMS.find(item => item.id === form).label} transformation ready.`;
      host.dataset.playerForm = value;host.dataset.playerReady = 'true';
    } catch { if (generation === version) {selector.value = form;status.textContent = 'Character could not load. Try another transformation.';} }
    finally {if (generation === version) panel.setAttribute('aria-busy', 'false');}
  };
  selector.addEventListener('change', () => change(selector.value));
  change('jevica');
  return {
    get form() {return form;},
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
        avatar.update(now, 'continue', false, {speed:pose.flying?0:pose.speed,distance:pose.distance,flying:pose.flying,vehicle:form}, pose.groundAt);outfit.update(pose.flying);
      }
      previous = pose ? now : null;
      flightButton.textContent=pose?.flying?(pose.landing?'Cancel landing · B':'Land · B'):'Take flight · B';flightButton.setAttribute('aria-pressed',String(Boolean(pose?.flying)));
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
