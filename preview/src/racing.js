import * as THREE from 'three';
import {createRoadVehicle} from './road-vehicles.js';
import {VEHICLES} from './vehicle-config.js';
import {bicycleCrankAngle} from './bicycle-crank.js';
import {stepCarriage,fitCarriageToGround,stepHoverLift} from './carriage-motion.js';
import {RACING_COURSES,createCourse,onTrack,rampHeightAt} from './racing-courses.js';
import {createRace,advanceRace} from './racing-rules.js';
import {createRaceState,stepRace,raceDriven} from './racing-physics.js';
import {createRacingDriver} from './racing-driver.js';
import './racing.css';

// A Space press shorter than this is a hop; held longer it is the handbrake.
const HOP_TAP_MS=150;
const ROAD_HELP='W/S drive · A/D steer · Shift boost · Space tap to hop, hold to drift · In the air: W/S flip, A/D barrel roll, Q/E spin · R restart · P pause. Pass each mint gate; land on the wheels to bank a trick.';
const AIR_HELP='W/S thrust · A/D yaw · Space rise · C lower · X brake · R restart · P pause. Fly through each mint gate.';

export function startRacing(host,{driver=createRacingDriver()}={}) {
 host.innerHTML=`<div class="race-shell">
 <canvas class="race-view" tabindex="0" aria-label="Three dimensional racing course"></canvas>
 <header class="race-top"><div class="race-title"><small>River Oaks · Driving club</small><h1>Garden Circuit</h1></div>
 <div class="race-stats"><div><span>Time</span><strong id="race-time">0.00</strong></div><div><span>Gate</span><strong id="race-gate">0 / 12</strong></div><div><span>km/h</span><strong id="race-speed">0</strong></div><div id="race-tricks-stat"><span>Tricks</span><strong id="race-tricks">0</strong></div><div id="race-altitude-stat" hidden><span>Altitude</span><strong id="race-altitude">8 m</strong></div></div></header>
 <div class="race-status" id="race-announcement" role="status" aria-live="polite">Choose a course, then start your lap.</div>
 <section class="race-panel" aria-label="Race setup"><label for="race-course">Course</label><select id="race-course">${RACING_COURSES.map(c=>`<option value="${c.id}">${c.name}</option>`).join('')}</select>
 <p id="race-description"></p><label for="race-vehicle">Vehicle</label><select id="race-vehicle"><option value="hover">Ribbonwing</option><option value="motorcycle" selected>Rose motorcycle</option><option value="rolls">Pink Rolls-Royce</option><option value="bicycle">Plaza bicycle</option></select>
 <p id="race-best">Best: no lap yet</p><div class="race-actions"><button id="race-start">Start lap</button><button id="race-pause" disabled>Pause</button></div></section>
 <aside class="race-help"><canvas class="race-map" width="300" height="220" aria-label="Course map and current location"></canvas><p id="race-help-text">${ROAD_HELP}</p><div class="race-touch" aria-label="Touch driving controls"><button data-control="left" aria-label="Steer left">←</button><button data-control="right" aria-label="Steer right">→</button><button data-control="forward" aria-label="Accelerate">↑</button><button data-control="back" aria-label="Reverse">↓</button><button data-control="brake" hidden>Brake</button><button data-control="hop" data-road>Hop</button><button data-control="drift" data-road>Drift</button><button data-control="boost" data-road>Boost</button><button data-control="spin-left" data-road aria-label="Spin left">↶</button><button data-control="spin-right" data-road aria-label="Spin right">↷</button><button data-control="rise" hidden>Rise</button><button data-control="lower" hidden>Lower</button></div><p>Local practice · <a href="/play">Return to world</a></p></aside></div>`;
 const $=selector=>host.querySelector(selector),canvas=$('.race-view');
 let renderer;
 try{renderer=new THREE.WebGLRenderer({canvas,antialias:true});}catch{host.innerHTML='<p role="status">WebGL is unavailable. Enable graphics acceleration and reload.</p><a href="/play">Return to the world</a>';return;}
 renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.3;
 const scene=new THREE.Scene();scene.background=new THREE.Color('#afcfc2');scene.fog=new THREE.Fog('#afcfc2',110,260);
 scene.add(new THREE.HemisphereLight('#f4f6df','#30473e',2.5));
 const sun=new THREE.DirectionalLight('#fff0db',3);sun.position.set(-25,65,30);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-140,right:140,top:140,bottom:-140,far:180});sun.shadow.bias=-.0003;scene.add(sun);
 const camera=new THREE.PerspectiveCamera(48,1,.1,500),target=new THREE.Vector3(),desired=new THREE.Vector3();
 const reduced=matchMedia('(prefers-reduced-motion: reduce)');
 let track=null,model=null,course,state,race,mode='ready',countdown=3,last=0,frame=0,disposed=false,environment=null;
 const keys=new Set(),touch=new Set(),abort=new AbortController(),options={signal:abort.signal};
 // Air tricks come only from keys or buttons pressed after takeoff, so a throttle or steer
 // held over a kicker never flips or rolls the vehicle by itself.
 let spaceDownAt=0,hop=false,takeoffAt=Infinity;const pressedAt=new Map();
 const announce=text=>{$('#race-announcement').textContent=text;};
 const disposeGroup=group=>{if(!group)return;const geometries=new Set(),materials=new Set();group.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)for(const m of Array.isArray(o.material)?o.material:[o.material])materials.add(m);});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());group.removeFromParent();};
 const bestKey=()=>`river-oaks:practice:v1:${course.id}:${state.vehicle}`;
 const readBest=()=>{try{const value=Number(localStorage.getItem(bestKey()));return Number.isFinite(value)&&value>0?value:null;}catch{return null;}};
 const showBest=()=>{const best=readBest();$('#race-best').textContent=best?`Personal best: ${best.toFixed(2)} s`:'Personal best: no lap yet';};
 const gateMeshes=[];
 // Jev takes the wheel as soon as his avatar has loaded; the page drives meanwhile.
 driver.ready.then(seated=>{if(seated&&!disposed){canvas.dataset.driverReady='true';if(model)driver.board(model);}}).catch(()=>{canvas.dataset.driverReady='failed';});
 function buildTrack(){
  disposeGroup(track);track=new THREE.Group();scene.add(track);gateMeshes.length=0;
  const mat=(color)=>new THREE.MeshStandardMaterial({color,roughness:.85});
  const grass=mat('#5f8e77'),road=mat('#3b5050'),edge=mat('#ebd8b5'),kicker=mat('#f2b7ca');
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(600,600),grass);ground.rotation.x=-Math.PI/2;ground.position.y=-.035;ground.receiveShadow=true;track.add(ground);
  const positions=[],indices=[];
  course.points.forEach((p,i)=>{const before=course.points[(i+course.points.length-2)%(course.points.length-1)],after=course.points[(i+1)%(course.points.length-1)],d=after.clone().sub(before).normalize();for(const side of [-1,1])positions.push(p.x-d.z*course.width/2*side,.005,p.z+d.x*course.width/2*side);if(i<course.points.length-1){const j=i*2;indices.push(j,j+2,j+1,j+1,j+2,j+3);}});
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setIndex(indices);geo.computeVertexNormals();road.side=THREE.DoubleSide;
  const surface=new THREE.Mesh(geo,road);surface.receiveShadow=true;track.add(surface);
  course.points.forEach((p,i)=>{if(i%4)return;const next=course.points[(i+1)%240],d=next.clone().sub(p).normalize();for(const side of [-1,1]){const marker=new THREE.Mesh(new THREE.BoxGeometry(.5,.13,1),edge);marker.position.set(p.x-d.z*(course.width/2-.2)*side,.07,p.z+d.x*(course.width/2-.2)*side);marker.rotation.y=-Math.atan2(d.z,d.x);track.add(marker);}});
  for(const ramp of course.ramps??[]) {
   // A wedge: its slope rises along local +X from the base to the lip, with a vertical drop behind.
   const l=ramp.length/2,h=ramp.height,w=ramp.halfWidth,v=[[-l,0,-w],[-l,0,w],[l,h,-w],[l,h,w],[l,0,-w],[l,0,w]];
   const faces=[[0,1,3],[0,3,2],[4,2,3],[4,3,5],[0,2,4],[1,5,3]];
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(faces.flat().flatMap(i=>v[i]),3));g.computeVertexNormals();
   const wedge=new THREE.Mesh(g,kicker);wedge.castShadow=wedge.receiveShadow=true;wedge.position.set(ramp.x,0,ramp.z);wedge.rotation.y=-Math.atan2(ramp.dz,ramp.dx);track.add(wedge);
  }
  course.gates.forEach((g,i)=>{const group=new THREE.Group();group.position.set(g.x,course.airborne?g.altitude+1.4:0,g.z);group.rotation.y=-Math.atan2(g.dz,g.dx);const material=mat(i===1?'#81ead1':'#e9a2b9');for(const side of [-1,1]){const pole=new THREE.Mesh(new THREE.CylinderGeometry(.08,.12,course.airborne?7:3.6,8),material);pole.position.set(0,course.airborne?0:1.8,side*(g.halfWidth-.25));group.add(pole);}const beam=new THREE.Mesh(new THREE.BoxGeometry(.15,.15,g.halfWidth*2),material);beam.position.y=3.55;group.add(beam);if(course.airborne){const bottom=beam.clone();bottom.position.y=-3.55;group.add(bottom);}track.add(group);gateMeshes.push({group,material});});
 }
 function reset(start=false){
  keys.clear();touch.clear();hop=false;const kind=$('#race-vehicle').value,road=raceDriven(kind);course=createCourse($('#race-course').value,{airborne:!road});
  const g=course.gates[0],yaw=Math.atan2(g.dz,-g.dx);
  model?.dispose();model=createRoadVehicle(kind,{pedalling:kind==='bicycle'});scene.add(model.object);
  if(driver.avatar)driver.board(model);
  const groundAt=(x,z)=>rampHeightAt(course,x,z);
  if(road){state=createRaceState(kind,{position:[g.x,0,g.z],yaw});environment={groundAt,onTrack:(x,z)=>onTrack(course,x,z),bounds:280,wheelTreads:model.wheelTreads};}
  else{state={vehicle:kind,position:[g.x,0,g.z],yaw,speed:0,distance:0,steering:0,lean:0,altitude:8,liftTarget:8,verticalSpeed:0};environment=null;}
  fitCarriageToGround(state,groundAt,model.wheelTreads);race=createRace(course.gates);buildTrack();countdown=3;mode=start?'countdown':'ready';
  $('#race-description').textContent=course.description+(road?' Three pink kickers wait between the gates: hop, flip and land clean for trick points.':' Aerial gates rise from 8 to 13 m. Match the next gate altitude.');
  $('#race-altitude-stat').hidden=road;$('#race-tricks-stat').hidden=!road;$('#race-tricks').textContent='0';
  for(const button of host.querySelectorAll('[data-control=rise],[data-control=lower],[data-control=brake]'))button.hidden=road;
  for(const button of host.querySelectorAll('[data-road]'))button.hidden=!road;
  $('#race-help-text').textContent=road?ROAD_HELP:AIR_HELP;$('#race-start').textContent=start?'Restart lap':'Start lap';$('#race-pause').disabled=!start;$('#race-pause').textContent='Pause';
  canvas.dataset.airborne='false';
  if(start)canvas.focus();
  showBest();announce(start?'3':'Choose a course, then start your lap.');updateVehicle(0);updateCamera(1,true);
 }
 function updateVehicle(now){
  model.object.position.fromArray(state.position);model.object.position.y+=state.altitude??0;model.object.rotation.set(state.pitch,state.yaw,state.roll,'YXZ');
  const up=new THREE.Vector3(0,1,0).applyQuaternion(model.object.quaternion.clone().invert());
  if(!model.spec.flies)model.wheels.forEach((wheel,i)=>{wheel.position.fromArray(model.spec.wheels[i]).addScaledVector(up,state.wheelOffsets[i]);wheel.rotation.set(0,i<model.spec.steeredWheels?state.steering:0,state.distance/model.spec.wheels[i][1],'YXZ');});
  model.setFlightState?.({phase:Math.abs(state.speed)>1?'cruise':'hover',altitude:state.altitude,maxSpeed:model.spec.maxSpeed,occupied:true,boarding:false,turn:state.steering/model.spec.steeringLimit});
  model.updateSteering(state.steering);model.setCrank(bicycleCrankAngle(state.distance));model.animate(now,state.speed,reduced.matches);
  model.object.updateMatrixWorld(true);
  driver.update(now,state,{camera,viewportHeight:canvas.clientHeight});
 }
 function updateCamera(dt,snap=false){
  const lift=state.position[1]+(state.altitude??0);
  target.set(state.position[0],1+lift,state.position[2]);
  if(reduced.matches)desired.set(state.position[0]+14,22+lift,state.position[2]+16);
  else {const framing=model.spec.flies?Math.max(1.4,1.2/camera.aspect):1;desired.set(state.position[0]+Math.cos(state.yaw)*10*framing,7*framing+lift,state.position[2]-Math.sin(state.yaw)*10*framing);}
  if(snap)camera.position.copy(desired);else camera.position.lerp(desired,1-Math.exp(-5*dt));camera.lookAt(target);
 }
 function pause(){if(mode==='running'||mode==='countdown'){mode='paused';keys.clear();touch.clear();hop=false;$('#race-pause').textContent='Resume';announce('Paused · Resume when ready');}else if(mode==='paused'){mode=countdown>0?'countdown':'running';$('#race-pause').textContent='Pause';canvas.focus();announce(countdown>0?String(Math.ceil(countdown)):`Next gate: ${race.next||'finish'}`);}}
 $('#race-start').addEventListener('click',()=>reset(true),options);$('#race-pause').addEventListener('click',pause,options);
 for(const selector of ['#race-course','#race-vehicle'])$(selector).addEventListener('change',()=>reset(),options);
 const relevant=new Set(['KeyW','KeyS','KeyA','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','ShiftLeft','ShiftRight','KeyR','KeyP','KeyC','KeyX','KeyQ','KeyE']);
 window.addEventListener('keydown',e=>{if(e.ctrlKey||e.metaKey||e.altKey||!relevant.has(e.code)||/INPUT|SELECT|TEXTAREA|BUTTON/.test(e.target.tagName))return;e.preventDefault();if(!e.repeat&&e.code==='KeyR')reset(true);else if(!e.repeat&&e.code==='KeyP')pause();else{if(!keys.has(e.code))pressedAt.set(e.code,performance.now());if(e.code==='Space'&&!keys.has('Space'))spaceDownAt=performance.now();keys.add(e.code);}},options);
 window.addEventListener('keyup',e=>{if(e.code==='Space'&&keys.has('Space')&&performance.now()-spaceDownAt<HOP_TAP_MS)hop=true;keys.delete(e.code);},options);
 window.addEventListener('blur',()=>{if(mode==='running'||mode==='countdown')pause();keys.clear();touch.clear();hop=false;},options);
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&(mode==='running'||mode==='countdown'))pause();last=0;},options);
 for(const button of host.querySelectorAll('[data-control]')){const name=button.dataset.control;button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);if(name==='hop')hop=true;else{pressedAt.set(name,performance.now());touch.add(name);}},options);for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>touch.delete(name),options);}
 const resize=()=>{const {width,height}=canvas.getBoundingClientRect();renderer.setSize(width,height,false);camera.aspect=width/height;camera.updateProjectionMatrix();};
 const observer=new ResizeObserver(resize);observer.observe(canvas);
 function drawMap(){const map=$('.race-map'),ctx=map.getContext('2d'),xs=course.points.map(p=>p.x),zs=course.points.map(p=>p.z),minX=Math.min(...xs)-8,minZ=Math.min(...zs)-8,scale=Math.min(300/(Math.max(...xs)-minX+8),220/(Math.max(...zs)-minZ+8));ctx.clearRect(0,0,300,220);ctx.strokeStyle='#a7c4b9';ctx.lineWidth=5;ctx.beginPath();course.points.forEach((p,i)=>{const x=(p.x-minX)*scale,z=(p.z-minZ)*scale;i?ctx.lineTo(x,z):ctx.moveTo(x,z);});ctx.stroke();const g=course.gates[race.next];for(const [x,z,color,r]of[[g.x,g.z,'#81ead1',7],[state.position[0],state.position[2],'#ffb8d1',6]]){ctx.fillStyle=color;ctx.beginPath();ctx.arc((x-minX)*scale,(z-minZ)*scale,r,0,Math.PI*2);ctx.fill();}}
 function tick(now){
  if(disposed)return;const elapsed=last?Math.max(0,(now-last)/1000):0,dt=Math.min(.08,elapsed);last=now;
  if(mode==='countdown'){const before=Math.ceil(countdown);countdown=Math.max(0,countdown-elapsed);if(countdown===0){mode='running';announce('Go · Follow the mint gates');}else if(Math.ceil(countdown)!==before)announce(String(Math.ceil(countdown)));}
  else if(mode==='running'){
   const held=(name,...codes)=>touch.has(name)||codes.some(code=>keys.has(code));
   const forward=Number(held('forward','KeyW','ArrowUp'))-Number(held('back','KeyS','ArrowDown')),turn=Number(held('left','KeyA','ArrowLeft'))-Number(held('right','KeyD','ArrowRight'));
   const before=[state.position[0],state.position[2],state.altitude??0],previous=race.next;
   if(environment){
    const handbrake=held('drift')||(keys.has('Space')&&now-spaceDownAt>=HOP_TAP_MS);
    const fresh=(name,...codes)=>held(name,...codes)&&[name,...codes].some(key=>(pressedAt.get(key)??-Infinity)>takeoffAt);
    const flip=Number(fresh('forward','KeyW','ArrowUp'))-Number(fresh('back','KeyS','ArrowDown')),barrel=Number(fresh('left','KeyA','ArrowLeft'))-Number(fresh('right','KeyD','ArrowRight'));
    stepRace(state,environment,{forward,turn,flip,barrel,spin:Number(held('spin-left','KeyQ'))-Number(held('spin-right','KeyE')),handbrake,boost:held('boost','ShiftLeft','ShiftRight'),jump:hop},dt);hop=false;
    const event=state.event;
    if(event?.type==='takeoff')takeoffAt=now;else if(!state.airborne)takeoffAt=Infinity;
    if(event?.type==='landing'&&event.label)announce(event.score?`${event.label} · +${event.score}`:event.label);
    else if(event?.type==='crash')announce(`${event.label} · ease off the flips`);
    canvas.dataset.airborne=String(state.airborne);$('#race-tricks').textContent=String(state.tricks.score);
   } else {
    const input={forward,turn,brake:held('brake','KeyX'),sprint:held('sprint','ShiftLeft','ShiftRight')};
    stepHoverLift(state,{groundAt:()=>0,canFly:()=>true,flightCeiling:28},{lift:Number(held('rise','Space'))-Number(held('lower','KeyC'))},dt);
    stepCarriage(state,{groundAt:()=>0,wheelTreads:model.wheelTreads,canOccupy:next=>Math.abs(next.position[0])<250&&Math.abs(next.position[2])<250},input,dt);
   }
   advanceRace(race,before,[state.position[0],state.position[2],state.altitude??0],elapsed);
   if(previous!==race.next){gateMeshes[previous].material.color.set('#e9a2b9');gateMeshes[race.next].material.color.set('#81ead1');announce(`Next gate: ${race.next||'finish'}`);}
   if(race.finished){mode='finished';state.speed=0;if(environment){state.velocity=[0,0];state.lateral=0;}$('#race-pause').disabled=true;const best=readBest();try{if(!best||race.elapsed<best)localStorage.setItem(bestKey(),String(race.elapsed));}catch{/* Storage may be disabled; the lap is still valid. */}showBest();announce(`Lap complete · ${race.elapsed.toFixed(2)} seconds${environment&&state.tricks.score?` · ${state.tricks.score} trick points`:''}`);}
  }
  updateVehicle(now);updateCamera(dt);$('#race-time').textContent=race.elapsed.toFixed(2);$('#race-gate').textContent=`${race.passed} / ${race.gates.length}`;
  if(!environment)$('#race-altitude').textContent=`${state.altitude.toFixed(1)} / ${(course.gates[race.next].altitude??0).toFixed(1)} m`;
  $('#race-speed').textContent=Math.round((environment?Math.hypot(state.velocity[0],state.velocity[1]):Math.abs(state.speed))*3.6);drawMap();renderer.render(scene,camera);frame=requestAnimationFrame(tick);
 }
 reset();resize();frame=requestAnimationFrame(tick);
 const dispose=()=>{if(disposed)return;disposed=true;cancelAnimationFrame(frame);abort.abort();observer.disconnect();driver.dispose();model.dispose();disposeGroup(track);renderer.dispose();};
 window.addEventListener('pagehide',dispose,{once:true});
 return {dispose};
}
