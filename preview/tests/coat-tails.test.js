import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {instantiateAvatar} from '../src/avatars.js';
import {createReferenceStyle} from '../src/reference-archetypes.js';
import {sharedAppearance} from '../src/shared-appearances.js';
import {loadCharacterRig} from './helpers/character-rig.js';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadResidentAvatar} from '../src/avatars.js';
import {COAT_TAIL_NAME} from '../src/coat-tail-geometry.js';
import {COAT_TAIL_MORPHS} from '../src/coat-tail-morph-data.js';
import {skirtContactFixture} from './helpers/skirt-contact.js';
import {garmentEdgeFixture} from './helpers/garment-edges.js';

for(const id of ['man-workwear','kai-noir','man-tailored'])test(`${id}: coat tails bend with the legs instead of remaining rigid on the pelvis`,async()=>{
  const appearance=sharedAppearance(id),source=await loadCharacterRig(appearance.rig);
  const avatar=instantiateAvatar(source,{targetHeight:source.height,id});
  const model=avatar.model,original=new Set(model.getObjectsByProperty('isMesh',true));
  const sourcePositions=[...original].map(mesh=>({mesh,positions:mesh.geometry.attributes.position.array.slice()}));
  const look=createReferenceStyle(avatar,appearance),pelvis=model.getObjectByName('pelvis');
  model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
  const frame=new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3()));
  const inverse=frame.clone().invert(),pelvisInverse=pelvis.matrixWorld.clone().invert(),samples=[];
  const color=appearance.character==='aurel'?'211d20':appearance.variant==='formal'?'dfd1bd':'1e1b20';
  for(const mesh of model.getObjectsByProperty('isMesh',true)){
    if(original.has(mesh)||mesh.material.color?.getHexString()!==color)continue;
    for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      const point=mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),local=point.clone().applyMatrix4(inverse);
      if(local.y<-.35&&local.y>-.8)samples.push({mesh,i,local:point.applyMatrix4(pelvisInverse)});
    }
  }
  try{
    assert(samples.length>100,'sample the actual lower coat, excluding base body and boots');
    for(const side of ['l','r']){
      const bone=model.getObjectByName(`thigh_${side}`);
      bone.quaternion.copy(avatar.rest.get(bone)).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone).x,-Math.PI/3));
    }
    look.update();model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
    const moving=samples.filter(({mesh,i,local})=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).distanceTo(local.clone().applyMatrix4(pelvis.matrixWorld))>.05).length;
    assert(moving/samples.length>.5,`${moving}/${samples.length} lower-coat samples move beyond rigid pelvis attachment`);
    for(const {mesh,positions}of sourcePositions)assert.deepEqual(mesh.geometry.attributes.position.array,positions,'coat fitting leaves shared source geometry untouched');
  }finally{look.dispose();avatar.dispose();}
});

test('coat bake retains provenance, finite normalized weights and bounded deformation',async()=>{
  const root=new URL('../../',import.meta.url),receipt=JSON.parse(await readFile(new URL('preview/src/coat-tail-morph-receipt.json',root),'utf8'));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  for(const [path,expected]of Object.entries(receipt.inputs))assert.equal(hash(await readFile(new URL(path,root))),expected,path);
  const output=await readFile(new URL('preview/src/coat-tail-morph-data.js',root));
  assert.equal(hash(output),receipt.outputSha256);assert(output.length<150_000,'packed coat data exceeds 150 kB');
  assert.deepEqual(Object.keys(COAT_TAIL_MORPHS),['kai','aurel']);
  for(const [character,data]of Object.entries(COAT_TAIL_MORPHS)){
    for(const field of ['sourcePositions','sourceWeights','positionDelta','normalDelta']){
      assert.equal(data[field].length,950*(field==='sourceWeights'?4:3));assert(data[field].every(Number.isFinite));
    }
    for(let i=0;i<950;i++){
      const weights=data.sourceWeights.slice(i*4,i*4+4);assert(weights.every(w=>w>=0&&w<=1));
      assert(Math.abs(weights.reduce((sum,w)=>sum+w,0)-1)<1e-6);
    }
    const diagnostic=receipt.diagnostics[character];assert(diagnostic.maximumStretch<3.5);assert(diagnostic.minimumAreaRatio>.09);
    assert(diagnostic.tested>100&&diagnostic.penetrating===0&&diagnostic.edges.every(r=>r.testedEdges>2600&&r.skippedEdges===0&&r.crossings===0));
  }
});

for(const id of ['man-workwear','man-tailored'])test(`${id}: coat clearance and pinned waist survive asymmetric bends and transformed roots`,async()=>{
  const source=await loadCharacterRig('man-casual'),avatar=instantiateAvatar(source,{targetHeight:source.height,id}),root=new THREE.Group();root.add(avatar.model);
  const model=avatar.model,look=createReferenceStyle(avatar,sharedAppearance(id)),coat=model.getObjectByName(COAT_TAIL_NAME),pelvis=model.getObjectByName('pelvis');
  const body=model.getObjectByName('man-casualmale_casualsuit02'),contact=skirtContactFixture(model,body,coat),edges=garmentEdgeFixture(model,body,[coat]);
  const attachments=['l','r'].flatMap(side=>model.getObjectByName(`calf_${side}`).getObjectsByProperty('isMesh',true));
  const lower=garmentEdgeFixture(model,body,[coat],{bottom:-.95,top:-.25,attachments});
  model.updateWorldMatrix(true,true);const inverse=pelvis.matrixWorld.clone().invert();
  const waist=Array.from({length:coat.geometry.attributes.position.count},(_,i)=>i).filter(i=>coat.geometry.attributes.uv.getY(i)===0)
    .map(i=>({i,local:coat.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(coat.matrixWorld).applyMatrix4(inverse)}));
  assert.equal(waist.length,38);
  const failures=[];
  try{
    for(const [left,right]of [[20,20],[40,40],[60,60],[90,90],[60,90],[90,60],[45,90],[90,45],[30,90],[90,30]]){
      root.position.set(3,2,-5);root.rotation.set(.1,.7,-.15);root.scale.setScalar(1.2);
      for(const [side,degrees]of [['l',left],['r',right]])for(const [name,sign]of [['thigh',-1],['calf',1]]){
        const bone=model.getObjectByName(`${name}_${side}`);bone.quaternion.copy(avatar.rest.get(bone)).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone).x,sign*degrees*Math.PI/180));
      }
      look.update();model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
      const lap=contact.sample(),edge=[...edges.sample(),...lower.sample()];
      if(lap.tested<100||lap.penetrating||edge.some(r=>!r.testedEdges||r.crossings))failures.push({left,right,lap,edge});
      assert(waist.every(({i,local})=>coat.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(coat.matrixWorld).distanceTo(local.clone().applyMatrix4(pelvis.matrixWorld))<1e-5),'waist stays pinned to the pelvis');
    }
    assert.deepEqual(failures,[]);
  }finally{contact.dispose();edges.dispose();lower.dispose();look.dispose();avatar.dispose();}
});

for(const id of ['man-workwear','kai-noir','man-tailored'])test(`${id}: seated coat stays outside the actual trouser thighs`,async t=>{
  const source=await loadCharacterRig('man-casual'),previousLoad=GLTFLoader.prototype.loadAsync,previousWindow=globalThis.window,previousDocument=globalThis.document;
  GLTFLoader.prototype.loadAsync=async()=>({scene:source.scene});
  globalThis.window={matchMedia:()=>({matches:false})};globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};
  t.after(()=>{GLTFLoader.prototype.loadAsync=previousLoad;globalThis.window=previousWindow;globalThis.document=previousDocument;});
  const avatar=await loadResidentAvatar(4,'remote-coat-test','man-casual',{folk:false,appearanceId:id,faceRecipe:{}}),model=avatar.rig.model;
  const coat=model.getObjectByName(COAT_TAIL_NAME),body=model.getObjectByName('man-casualmale_casualsuit02');
  const contact=skirtContactFixture(model,body,coat),edges=garmentEdgeFixture(model,body,[coat]);
  const rest=coat.geometry.attributes.position.array.slice();
  try{
    avatar.object.position.y=.55-avatar.rig.hipHeight+.025;
    for(let frame=0;frame<=144;frame++)avatar.update(frame*1000/60,'continue',false,{speed:0,distance:0,riding:true,ridingKind:'seat',seatToFloor:.55},()=>0);
    const lap=contact.sample(),edge=edges.sample();t.diagnostic(JSON.stringify({lap,edge}));
    assert(lap.tested>100,'actual front coat has substantial sampled lap contact');
    assert.equal(lap.penetrating,0,JSON.stringify(lap));
    assert(edge.every(r=>r.testedEdges>100&&r.crossings===0),JSON.stringify(edge));
    assert.deepEqual(coat.geometry.attributes.position.array,rest,'runtime keeps owned rest positions immutable');
    avatar.object.position.y=0;avatar.update(3000,'continue',false,{speed:0,distance:0},()=>0);
    assert(coat.morphTargetInfluences.every(value=>value===0),'standing restores the authored coat');
    const failures=[];
    for(const [gait,speed]of [[0,1.4],[1,3.4]])for(let frame=0;frame<=181;frame++){
      const distance=frame/60*speed;avatar.object.position.z=distance;
      avatar.update(3000+gait*4000+frame*1000/60,'continue',false,{speed,distance},()=>0);
      if(![144,151,163,181].includes(frame))continue;
      for(const result of edges.sample())if(!result.testedEdges||result.crossings)failures.push({speed,frame,...result});
    }
    assert.deepEqual(failures,[],'moving coat crosses the actual trouser thighs');
  }finally{contact.dispose();edges.dispose();avatar.dispose();}
});


for(const id of ['man-workwear','kai-noir','man-tailored'])test(`${id}: lower coat clears actual trousers and boots through opposing strides`,async t=>{
  const source=await loadCharacterRig('man-casual'),previousLoad=GLTFLoader.prototype.loadAsync,previousWindow=globalThis.window,previousDocument=globalThis.document;
  GLTFLoader.prototype.loadAsync=async()=>({scene:source.scene});
  globalThis.window={matchMedia:()=>({matches:false})};globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};
  t.after(()=>{GLTFLoader.prototype.loadAsync=previousLoad;globalThis.window=previousWindow;globalThis.document=previousDocument;});
  const avatar=await loadResidentAvatar(4,'remote-coat-lower-test','man-casual',{folk:false,appearanceId:id,faceRecipe:{}}),model=avatar.rig.model;
  const coat=model.getObjectByName(COAT_TAIL_NAME),body=model.getObjectByName('man-casualmale_casualsuit02');
  const attachments=['l','r'].flatMap(side=>model.getObjectByName(`calf_${side}`).getObjectsByProperty('isMesh',true));
  assert(attachments.length>=6,'include actual soles, foot lasts and shin shafts');
  const fixture=garmentEdgeFixture(model,body,[coat],{bottom:-.95,top:-.25,attachments});
  const failures=[];
  const sample=phase=>{for(const result of fixture.sample()){assert(result.testedEdges>2600);if(result.crossings)failures.push({phase,...result});}};
  try{
    sample('rest');
    for(const [gait,speed]of [[0,1.4],[1,3.4]])for(let frame=0;frame<=181;frame++){
      const distance=frame/60*speed;avatar.object.position.z=distance;
      avatar.update(gait*4000+frame*1000/60,'continue',false,{speed,distance},()=>0);
      if([144,151,163,181].includes(frame))sample(`${gait}:${frame}`);
    }
    assert.deepEqual(failures,[],'lower coat crosses actual trousers or boots');
  }finally{fixture.dispose();avatar.dispose();}
});


for(const id of ['man-workwear','man-tailored'])test(`${id}: shin shafts stay stable during ankle flexion and corrective shares follow bone identity`,async()=>{
  const source=await loadCharacterRig('man-casual'),avatar=instantiateAvatar(source,{targetHeight:source.height,id});
  const model=avatar.model,look=createReferenceStyle(avatar,sharedAppearance(id)),coat=model.getObjectByName(COAT_TAIL_NAME);
  try{
    model.updateWorldMatrix(true,true);
    for(const side of ['l','r']){
      const calf=model.getObjectByName(`calf_${side}`),foot=model.getObjectByName(`foot_${side}`);
      const footMeshes=new Set(foot.getObjectsByProperty('isMesh',true));
      const shafts=calf.getObjectsByProperty('isMesh',true).filter(mesh=>!footMeshes.has(mesh));
      assert(shafts.length>0&&footMeshes.size>0,'actual shaft and foot attachments exist');
      const points=shafts.map(mesh=>({mesh,point:mesh.getVertexPosition(0,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld)}));
      foot.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(foot).x,.6));model.updateWorldMatrix(true,true);
      assert(points.every(({mesh,point})=>mesh.getVertexPosition(0,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).distanceTo(point)<1e-6),'ankle cannot rotate shin shafts');
    }
    const {skinIndex,skinWeight}=coat.geometry.attributes;
    let calfVertices=0;
    for(let i=0;i<skinWeight.count;i++){
      if(skinWeight.getZ(i)<.9)continue;
      calfVertices++;
      const side=coat.skeleton.bones[skinIndex.getZ(i)].name.endsWith('_l')?0:1;
      const other=coat.geometry.morphAttributes.position[1-side];
      assert(Math.abs(other.getX(i))+Math.abs(other.getY(i))+Math.abs(other.getZ(i))<1e-8,'calf-weighted correction belongs to its own leg');
    }
    assert(calfVertices>100,'exercise lower-tail corrective routing');
  }finally{look.dispose();avatar.dispose();}
});
