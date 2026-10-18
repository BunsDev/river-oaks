import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {instantiateAvatar} from '../src/avatars.js';
import {createReferenceStyle} from '../src/reference-archetypes.js';
import {sharedAppearance} from '../src/shared-appearances.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadCharacterRig} from './helpers/character-rig.js';
import {loadResidentAvatar} from '../src/avatars.js';
import {skirtContactFixture} from './helpers/skirt-contact.js';

for (const appearanceId of ['lyra-human', 'lyra-human']) test(`${appearanceId}: long opaque drape covers the seated lap and restores its standing shape`, async t => {
  const source = await loadCharacterRig('jevica'), previousLoad = GLTFLoader.prototype.loadAsync;
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  GLTFLoader.prototype.loadAsync = async () => ({scene: source.scene});
  globalThis.window = {matchMedia: () => ({matches: false})};
  globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}})})};
  t.after(() => { GLTFLoader.prototype.loadAsync = previousLoad; globalThis.window = previousWindow; globalThis.document = previousDocument; });
  const avatar = await loadResidentAvatar(4, 'remote-drape-test', 'jevica', {folk: false, appearanceId, faceRecipe: {}});
  const model = avatar.rig.model, wrap = model.getObjectByName('Lyra velvet wrap'), train = model.getObjectByName('Lyra spotted sheer train');
  assert(wrap && train, 'both authored layers remain present');
  const rest = wrap.geometry.attributes.position.array.slice(), trainRest = train.geometry.attributes.position.array.slice();
  const body=model.getObjectByName('Jevica'),contact = skirtContactFixture(model, body, wrap), trainContact=skirtContactFixture(model,body,train), layerContact=skirtContactFixture(model,wrap,train);
  model.updateMatrixWorld(true);
  const frame=new THREE.Matrix4().compose(model.getObjectByName('pelvis').getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3())), inverse=frame.clone().invert(), point=new THREE.Vector3(),rear=[],front=[];
  for(let i=0;i<body.geometry.attributes.position.count;i++){
    body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld).applyMatrix4(inverse);
    if(point.y>-.18&&point.y<.02&&Math.abs(point.x)<.14&&point.z<-.04)rear.push(i);
    if(point.y>-.30&&point.y<-.035&&Math.abs(point.x)>.04&&Math.abs(point.x)<.14&&point.z>.06)front.push(i);
  }
  const pelvis = model.getObjectByName('pelvis'), pelvisInverse = pelvis.matrixWorld.clone().invert();
  const waistbands = [wrap, train].map(mesh => ({mesh, points: Array.from({length: mesh.geometry.attributes.position.count}, (_, i) => i)
    .filter(i => mesh.geometry.attributes.uv.getY(i) === 0)
    .map(i => ({i, local: mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(pelvisInverse)}))}));
  for (const {points} of waistbands) assert.equal(points.length, 37, 'entire authored waistband is sampled');
  assert(rear.length>100,'actual posterior hip/thigh samples');
  try {
    avatar.object.position.y = .55 - avatar.rig.hipHeight + .025;
    for (let frame = 0; frame <= 144; frame++) avatar.update(frame * 1000 / 60, 'continue', false, {speed: 0, distance: 0, riding: true, ridingKind: 'seat', seatToFloor: .55}, () => 0);
    model.updateWorldMatrix(true, true); model.updateMatrixWorld(true);
    for (const {mesh, points} of waistbands) {
      const displacement = Math.max(...points.map(({i, local}) => mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)
        .distanceTo(local.clone().applyMatrix4(pelvis.matrixWorld))));
      assert(displacement < 1e-5, `${mesh.name} seated waistband moved ${displacement} metres`);
    }
    const result = contact.sample();
    assert(result.tested > 200, 'actual front cloth covers a substantial thigh surface');
    assert.equal(result.penetrating, 0, JSON.stringify(result));
    for(const mesh of [wrap,train])assert(mesh.morphTargetInfluences.every(value=>value>.99),'both layers activate seated correctives');
    const sheer=trainContact.sample(),layers=layerContact.sample();
    assert(sheer.tested>200);assert.equal(sheer.penetrating,0,JSON.stringify(sheer));
    assert(layers.tested>100);assert.equal(layers.penetrating,0,JSON.stringify(layers));
    t.diagnostic(JSON.stringify({opaque:result,sheer,layers}));
    const backward=new THREE.Vector3(0,0,-1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
    let rearExposed=0;
    for(const i of rear){
      body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld);
      if(!new THREE.Raycaster(point.clone().add(backward),backward.clone().negate(),0,1.002).intersectObject(wrap,false).length)rearExposed++;
    }
    assert.equal(rearExposed,0,`${rearExposed}/${rear.length} rear samples left exposed`);
    assert.deepEqual(wrap.geometry.attributes.position.array, rest, 'runtime leaves the rest buffer untouched');
    assert.deepEqual(train.geometry.attributes.position.array, trainRest, 'runtime leaves the sheer buffer untouched');
    avatar.object.position.y = 0;
    avatar.update(3000, 'continue', false, {speed: 0, distance: 0}, () => 0);
    for (const mesh of [wrap, train]) assert(mesh.morphTargetInfluences.every(value => value === 0), 'standing restores both layers');
    assert(front.length>100,'actual front thigh samples');
    const forward=new THREE.Vector3(0,0,1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion())),failures=[];
    for(const [gait,speed]of [[0,1.4],[1,3.4]])for(let frame=0;frame<=181;frame++){
      const time=3000+gait*4000+frame*1000/60,distance=frame/60*speed;avatar.object.position.z=distance;
      avatar.update(time,'continue',false,{speed,distance},()=>0);
      if(![144,151,163,181].includes(frame))continue;
      avatar.object.updateMatrixWorld(true);let exposed=0;
      for(const i of front){
        body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld);
        if(!new THREE.Raycaster(point.clone().add(forward),forward.clone().negate(),0,1.002).intersectObject(wrap,false).length)exposed++;
      }
      if(exposed)failures.push({speed,frame,exposed,samples:front.length});
    }
    assert.deepEqual(failures,[],'walk/run keeps the opaque surface outside the upper thighs');
  } finally { contact.dispose(); trainContact.dispose(); layerContact.dispose(); avatar.dispose(); }
});


test('Lyra lap coverage follows asymmetric bends under transformed roots',async()=>{
  const source=await loadCharacterRig('jevica'),avatar=instantiateAvatar(source,{targetHeight:1.685,id:'drape-bends'}),root=new THREE.Group();root.add(avatar.model);
  const look=createReferenceStyle(avatar,sharedAppearance('lyra-human')),model=avatar.model,wrap=model.getObjectByName('Lyra velvet wrap');
  const contact=skirtContactFixture(model,model.getObjectByName('Jevica'),wrap),failures=[];
  try{
    for(const [left,right] of [[20,20],[40,40],[60,60],[90,90],[60,90],[90,60],[45,90],[90,45],[30,90],[90,30]]){
      root.position.set(3,2,-5);root.rotation.set(.1,.7,-.15);root.scale.setScalar(1.2);
      for(const [side,degrees] of [['l',left],['r',right]])for(const [name,sign]of [['thigh',-1],['calf',1]]){
        const bone=model.getObjectByName(`${name}_${side}`);bone.quaternion.copy(avatar.rest.get(bone)).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone).x,sign*degrees*Math.PI/180));
      }
      look.update();const result=contact.sample();assert(result.tested>200);
      if(result.penetrating)failures.push({left,right,...result});
    }
    assert.deepEqual(failures,[]);
  }finally{contact.dispose();look.dispose();avatar.dispose();}
});

test('Lyra handkerchief hems clear the floor throughout upright idle, walk and run', async t => {
  const source = await loadCharacterRig('jevica'), previousLoad = GLTFLoader.prototype.loadAsync;
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  GLTFLoader.prototype.loadAsync = async () => ({scene: source.scene});
  globalThis.window = {matchMedia: () => ({matches: false})};
  globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}})})};
  t.after(() => { GLTFLoader.prototype.loadAsync = previousLoad; globalThis.window = previousWindow; globalThis.document = previousDocument; });
  for (const appearanceId of ['lyra-human', 'lyra-human']) for (const speed of [0, 1.4, 3.4]) {
    const avatar = await loadResidentAvatar(4, 'remote-floor-regression', 'jevica', {folk: false, appearanceId, faceRecipe: {}});
    try {
      const meshes = ['Lyra velvet wrap', 'Lyra spotted sheer train'].map(name => avatar.rig.model.getObjectByName(name));
      assert(meshes.every(mesh => mesh?.isSkinnedMesh));
      const point = new THREE.Vector3(); let minimum = Infinity, worst;
      for (let frame = 0; frame <= 360; frame++) {
        const time = frame * 1000 / 60, distance = time / 1000 * speed;
        avatar.object.position.z = distance;
        avatar.update(time, 'continue', false, {speed, distance}, () => 0);
        avatar.object.updateMatrixWorld(true);
        for (const mesh of meshes) {
          mesh.skeleton.update();
          for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
            mesh.getVertexPosition(i, point).applyMatrix4(mesh.matrixWorld);
            if (point.y < minimum) { minimum = point.y; worst = {name: mesh.name, frame, vertex: i}; }
          }
        }
      }
      assert(minimum >= .005, `${appearanceId} speed=${speed}: hem clearance ${minimum}m ${JSON.stringify(worst)}`);
    } finally { avatar.dispose(); }
  }
});
