import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { captureOfficeStreet,officeStreetApproach,borrowOfficePresentation,createOfficeArrivalClock,officePeerVisible } from '../src/office-world-presentation.js';
import { ARRIVAL,arrivalCamera } from '../src/office-arrival-model.js';
import { seeThroughNearCamera } from '../src/near-camera-fade.js';
import { createOfficeWorldScene } from '../src/office-world-scene.js';

function fixture(){
  const scene=new THREE.Scene(),district=new THREE.Group(),object=new THREE.Group(),body=new THREE.Group();scene.add(district,body);district.add(object);
  object.position.set(-2741,18.4,1392);object.rotation.y=3.13;object.updateMatrixWorld();
  const camera=new THREE.PerspectiveCamera(58,1.44,.1,2000);camera.position.set(-2743,21.2,1373);camera.lookAt(-2742,19.8,1380);camera.updateMatrixWorld();
  body.position.set(-2742,18.4,1378);body.rotation.y=2.1;
  const pose={position:[-2742,20.08,1378],velocity:[0,0],ground:18.4,distance:3};
  const avatar={object:body,setPresentation(value){this.presentation=value;}},lobby={object,setEntryOpen(value){this.entry=value;},update(frame){this.frame=frame;}};
  let draws=0;const pipeline={render(){draws++;}};
  const street=captureOfficeStreet({scene,camera,pipeline,avatar,lobby,world:{},pose});
  return {scene,district,body,camera,pose,avatar,lobby,street,draws:()=>draws};
}
const near=(a,b,message)=>assert.ok(a.distanceTo(b)<1e-8,message);
test('asset and render stalls cannot skip the visible arrival sequence',()=>{
  const clock=createOfficeArrivalClock();assert.equal(clock.tick(0,false),0);assert.equal(clock.tick(30000,false),0);
  assert.equal(clock.tick(60000,true),0);assert.equal(clock.tick(90000,true),.08);
  assert.ok(Math.abs(clock.tick(90016,true)-.096)<1e-9);
  assert.equal(clock.tick(100000,false),.096);assert.equal(clock.tick(150000,true),.096);
  let elapsed;for(let i=1;i<=700;i++)elapsed=clock.tick(150000+i*1000/60,true);
  assert.ok(elapsed>ARRIVAL.duration,'normal frames eventually finish the journey');
});
test('office peers sharing the first-person arrival point stay out of the camera',()=>{
  assert.equal(officePeerVisible({id:'guest',position:[0,1.25]},'owner',[0,1.25],true),false);
  assert.equal(officePeerVisible({id:'guest',position:[1,1.25]},'owner',[0,1.25],true),true);
  assert.equal(officePeerVisible({id:'owner',position:[2,1.25]},'owner',[0,1.25],true),false);
});
test('the real world scene survives a stalled render, completes all phases and releases borrowed state',t=>{
  const previous=globalThis.document,element=()=>({style:{},classList:{},append(){},setAttribute(){},remove(){}});
  globalThis.document={createElement:element};t.after(()=>{globalThis.document=previous;});
  const f=fixture();f.avatar.ready=true;
  const visit=createOfficeWorldScene({street:f.street,host:{...element(),clientWidth:1440,clientHeight:1000},self:{id:'self',office:{id:'jevica-office'}}});
  t.after(()=>visit.dispose());
  const phases=new Set();
  const draw=now=>{visit.prepare(now);const frame=visit.render(now,[0,1.25],0,[]);phases.add(frame.phase);return frame;};
  assert.equal(draw(0).phase,'lobby');assert.equal(draw(20000).phase,'lobby');assert.equal(visit.inspect().elevation,0);
  for(let i=1;i<=1500;i++)draw(20000+i*1000/60);
  assert.deepEqual([...phases],['lobby','boarding','closing','ascending','opening','arriving','office']);
  assert.ok(Math.abs(visit.inspect().elevation-ARRIVAL.officeElevation)<1e-8);
  assert.equal(f.district.visible,false);visit.dispose();visit.dispose();
  assert.equal(f.lobby.object.parent,f.district);assert.equal(f.avatar.presentation,null);assert.equal(f.scene.children.length,2);assert.equal(f.district.visible,true);
});
test('a glazed penthouse hides the borrowed cabin and lobby after arrival, leaving the closed car doors, and restores them on exit',t=>{
  const previous=globalThis.document,element=()=>({style:{},classList:{},append(){},setAttribute(){},remove(){}});
  globalThis.document={createElement:element};t.after(()=>{globalThis.document=previous;});
  const visitIn=layout=>{
    const f=fixture();f.avatar.ready=true;
    const stone=new THREE.Group(),hiddenTrim=new THREE.Group(),door=new THREE.Group();hiddenTrim.visible=false;
    f.lobby.object.add(stone,hiddenTrim,door);f.lobby.frontDoors=[door];
    const visit=createOfficeWorldScene({street:f.street,host:{...element(),clientWidth:1440,clientHeight:1000},self:{id:'self',office:{id:'jevica-office',layout,levelId:'jevica-office/l0'}}});
    t.after(()=>visit.dispose());
    const seen={};
    for(let i=0;i<=1500;i++){const now=i*1000/60;visit.prepare(now);const {phase}=visit.render(now,[0,1.25],0,[]);seen[phase]??={stone:stone.visible,door:door.visible,doors:f.lobby.frame.doors};}
    return {f,visit,stone,hiddenTrim,door,seen};
  };
  const glazed=visitIn('office-penthouse-1');
  assert.equal(glazed.seen.arriving.stone&&glazed.seen.arriving.door,true,'the cabin stays drawn while the visitor walks out of it');
  assert.deepEqual(glazed.seen.office,{stone:false,door:true,doors:0},'arrived: cabin and lobby hidden, front doors drawn and closed');
  assert.equal(glazed.hiddenTrim.visible,false);
  glazed.visit.dispose();
  assert.equal(glazed.stone.visible,true,'leaving restores the lobby');assert.equal(glazed.hiddenTrim.visible,false,'and keeps a part that was already hidden hidden');
  assert.equal(glazed.f.lobby.object.parent,glazed.f.district);
  const legacy=visitIn('office-legacy-1');
  assert.deepEqual(legacy.seen.office,{stone:true,door:true,doors:1},'the windowless legacy room is unchanged');
  legacy.visit.dispose();
});
test('street lead-in begins at the exact camera and avatar and meets the established lobby path',()=>{
  const {street,body,camera}=fixture(),path=officeStreetApproach(street),rotation=new THREE.Quaternion().setFromRotationMatrix(street.frame);
  const first=path.at(0,1.44),last=path.at(path.duration,1.44),expected=arrivalCamera(0,{aspect:1.44});
  near(first.player.clone().applyMatrix4(street.frame),body.position,'avatar is not relocated on entry');
  near(first.camera.clone().applyMatrix4(street.frame),camera.position,'camera starts at the actual street eye');
  assert.ok(first.quaternion.clone().premultiply(rotation).angleTo(camera.quaternion)<1e-7);
  assert.equal(first.fov,camera.fov);near(last.player,new THREE.Vector3(0,0,ARRIVAL.start));near(last.camera,new THREE.Vector3(...expected.position));
  const endCamera=new THREE.PerspectiveCamera();endCamera.position.fromArray(expected.position);endCamera.lookAt(...expected.target);
  assert.ok(last.quaternion.angleTo(endCamera.quaternion)<1e-7);
  let previous=first;
  for(let t=.01;t<=path.duration;t+=.01){const next=path.at(t,1.44);assert.ok(previous.player.distanceTo(next.player)<.08);assert.ok(previous.camera.distanceTo(next.camera)<.08);assert.ok(previous.quaternion.angleTo(next.quaternion)<.03);previous=next;}
});
test('borrowing and masking the district keeps the very same cabin projected in the same place',()=>{
  const f=fixture(),point=new THREE.Vector3(.8,1.9,2),before=point.clone().applyMatrix4(f.lobby.object.matrixWorld).project(f.camera);
  const lease=borrowOfficePresentation(f.street);f.scene.updateMatrixWorld(true);
  near(point.clone().applyMatrix4(f.lobby.object.matrixWorld).project(f.camera),before,'reparenting has no visible geometry jump');
  lease.inside(true);lease.render(1/60);f.scene.updateMatrixWorld(true);
  near(point.clone().applyMatrix4(f.lobby.object.matrixWorld).project(f.camera),before,'closed-door district culling does not replace the cabin');
  assert.equal(f.district.visible,false);assert.equal(f.body.visible,true);assert.equal(f.draws(),1);
  lease.dispose();
});
test('presentation cleanup restores camera, avatar and layer ownership once without disposing borrowed resources',()=>{
  const f=fixture(),hidden=new THREE.Group();hidden.visible=false;f.scene.add(hidden);
  const material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry(),mesh=new THREE.Mesh(geometry,material);f.lobby.object.add(mesh);
  let disposed=0;material.addEventListener('dispose',()=>disposed++);geometry.addEventListener('dispose',()=>disposed++);
  const lease=borrowOfficePresentation(f.street),original=f.camera.position.clone();lease.inside(true);
  f.camera.position.set(1,2,3);f.body.position.set(4,5,6);f.avatar.setPresentation({ground:42});
  const late=new THREE.Group();f.scene.add(late);lease.render();assert.equal(late.visible,false);
  lease.dispose();lease.dispose();
  near(f.camera.position,original);near(f.body.position,f.street.startAvatar.position);assert.equal(f.avatar.presentation,null);
  assert.equal(f.lobby.object.parent,f.district);assert.equal(f.lobby.entry,0);assert.equal(f.lobby.frame.phase,'idle');
  assert.equal(f.district.visible,true);assert.equal(hidden.visible,false);assert.equal(late.visible,true);assert.equal(disposed,0);
  assert.deepEqual(f.pose.position,[-2742,20.08,1378]);material.dispose();geometry.dispose();
});
test('office lighting reuses the fixed world pool and restores its state',()=>{
  const f=fixture(),light=new THREE.PointLight('#aabbcc',10,10,2);light.position.set(2,3,4);f.scene.add(light);f.street.lights=[light];
  const lease=borrowOfficePresentation(f.street),count=f.scene.children.filter(n=>n.isLight).length;
  const source={position:new THREE.Vector3(20,30,40),color:new THREE.Color('#ffdddd'),intensity:45,distance:7,decay:2};
  lease.lights([source],0);near(light.position,new THREE.Vector3(2,3,4));assert.equal(light.intensity,10);
  lease.lights([source]);near(light.position,source.position);assert.equal(light.intensity,45);assert.equal(f.scene.children.filter(n=>n.isLight).length,count);
  lease.dispose();near(light.position,new THREE.Vector3(2,3,4));assert.equal(light.color.getHexString(),'aabbcc');assert.equal(light.intensity,10);assert.equal(light.distance,10);
});
test('enclosed arrival walls remain opaque near the camera while street facades still fade',()=>{
  const cabin=new THREE.MeshStandardMaterial(),facade=new THREE.MeshStandardMaterial();cabin.userData.nearCameraSolid=true;
  seeThroughNearCamera(cabin);seeThroughNearCamera(facade);
  assert.equal(cabin.userData.seeThroughNearCamera,undefined);assert.equal(facade.userData.seeThroughNearCamera,true);
  cabin.dispose();facade.dispose();
});
test('seated peers render on their plan seat facing its desk, and a seated visitor\'s eye drops to the seated height',t=>{
  const previous=globalThis.document,element=()=>({style:{},classList:{},append(){},setAttribute(){},remove(){},getBoundingClientRect(){return {width:110,height:26};}});
  globalThis.document={createElement:element};t.after(()=>{globalThis.document=previous;});
  const f=fixture();f.avatar.ready=true;
  const place={layoutId:'office-penthouse-1',levelId:'jevica-office/l0'};
  const visit=createOfficeWorldScene({street:f.street,host:{...element(),clientWidth:1440,clientHeight:1000},self:{id:'self',office:{id:'jevica-office',...place,layout:place.layoutId}},reducedMotion:true});
  t.after(()=>visit.dispose());
  const guest={id:'guest',name:'Guest',office:{id:'jevica-office',layout:'office-penthouse-1',levelId:'jevica-office/l0',elevation:0,position:[3.65,5.6],yaw:0,seat:{id:'desk-a1-chair'}}};
  visit.prepare(0);visit.render(0,[3.65,3.55],0,[guest],place);
  const turn=Math.atan2(f.street.frame.elements[8],f.street.frame.elements[10]);
  const peer=visit.inspect().actors.find(actor=>actor.id==='guest'),seated=peer.sitting;
  assert.equal(peer.onScreen,true);assert.equal(peer.labelVisible,true,'an isolated seated peer keeps a readable nameplate');
  assert.equal(seated.height,0.5);
  assert.ok(Math.abs(Math.atan2(Math.sin(seated.yaw-(Math.PI+turn)),Math.cos(seated.yaw-(Math.PI+turn))))<1e-9,'faces the desk at +d');
  visit.render(16,[3.65,3.55],0,[{...guest,office:{...guest.office,position:[3.65,3.55],seat:undefined}}],place);
  assert.equal(visit.inspect().actors.find(actor=>actor.id==='guest').sitting,null,'standing up clears the pose');
  const standing=visit.inspect().camera.position[1];
  visit.render(32,[3.65,5.6],0,[],{...place,seatId:'desk-a1-chair'});
  assert.ok(Math.abs(standing-visit.inspect().camera.position[1]-(1.68-1.2))<1e-9,'seated eye is 0.48 m lower');
});
test('a view moves the camera to its fixed eye inside the office and shows the visitor\'s own body, seated when seated',t=>{
  const previous=globalThis.document,element=()=>({style:{},classList:{},append(){},setAttribute(){},remove(){}});
  globalThis.document={createElement:element};t.after(()=>{globalThis.document=previous;});
  const f=fixture();f.avatar.ready=true;
  const place={layoutId:'office-penthouse-1',levelId:'jevica-office/l0'};
  const visit=createOfficeWorldScene({street:f.street,host:{...element(),clientWidth:1440,clientHeight:1000},self:{id:'self',office:{id:'jevica-office',...place,layout:place.layoutId}},reducedMotion:true});
  t.after(()=>visit.dispose());
  visit.prepare(0);visit.render(0,[3.65,3.55],0,[],place);
  assert.equal(f.avatar.presentation.showBody,false,'first person hides the body');
  const walking=visit.inspect().camera.position;
  visit.render(16,[3.65,3.55],0,[],{...place,viewId:'overview'});
  const eye=new THREE.Vector3(13.6,6.4,-1.2).applyMatrix4(f.street.frame);eye.y+=ARRIVAL.officeElevation;
  near(new THREE.Vector3(...visit.inspect().camera.position),eye,'the camera sits at the overview eye');
  assert.equal(f.avatar.presentation.showBody,true,'the visitor sees their own body from a view');
  assert.equal(f.avatar.presentation.sitting,null);
  visit.render(32,[3.65,5.6],0,[],{...place,viewId:'overview',seatId:'desk-a1-chair'});
  assert.equal(f.avatar.presentation.sitting?.height,0.5,'seated visitors are drawn seated in a view');
  visit.render(48,[3.65,3.55],0,[],place);
  near(new THREE.Vector3(...visit.inspect().camera.position),new THREE.Vector3(...walking),'leaving the view restores the walking camera');
});
test('opening live exterior restores only layers hidden by the cabin lease',()=>{
 const f=fixture(),off=new THREE.Group();off.visible=false;f.scene.add(off);const lease=borrowOfficePresentation(f.street);
 lease.inside(true);assert.equal(f.district.visible,false);lease.inside(false);assert.equal(f.district.visible,true);assert.equal(off.visible,false);
 lease.render();assert.equal(f.district.visible,true);lease.dispose();
});
