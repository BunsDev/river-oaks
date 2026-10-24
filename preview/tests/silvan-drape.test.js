import {verifyBakeProvenance} from '../../scripts/lib/bake-provenance.mjs';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SILVAN_DRAPE_MORPHS} from '../src/silvan-drape-morph-data.js';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {loadCharacterRig} from './helpers/character-rig.js';
import {createReferenceStyle} from '../src/reference-archetypes.js';
import {sharedAppearance} from '../src/shared-appearances.js';
import {instantiateAvatar} from '../src/avatars.js';
import {loadResidentAvatar} from '../src/avatars.js';
import {skirtContactFixture} from './helpers/skirt-contact.js';
import {garmentEdgeFixture} from './helpers/garment-edges.js';
import {SILVAN_DRAPES} from '../src/silvan-drape-geometry.js';

for(const [appearanceId,profile,bodyName] of [
  ['forest-aristocrat','man-casual','man-casualmale_casualsuit02'],
  ['forest-aristocrat','man-casual','man-casualmale_casualsuit02'],
  ['forest-aristocrat-feminine','jevica','Jevica'],
  ['forest-aristocrat-feminine','jevica','Jevica'],
])test(`${appearanceId}: drapes and details follow the seated rig and restore standing`,async t=>{
  const source=await loadCharacterRig(profile),previousLoad=GLTFLoader.prototype.loadAsync,previousWindow=globalThis.window,previousDocument=globalThis.document;
  GLTFLoader.prototype.loadAsync=async()=>({scene:source.scene});
  globalThis.window={matchMedia:()=>({matches:false})};globalThis.document={createElement:()=>({getContext:()=>new Proxy({},{get:()=>()=>{}})})};
  t.after(()=>{GLTFLoader.prototype.loadAsync=previousLoad;globalThis.window=previousWindow;globalThis.document=previousDocument;});
  const avatar=await loadResidentAvatar(4,'remote-silvan-test',profile,{folk:false,appearanceId,faceRecipe:{}}),model=avatar.rig.model;
  const panels=SILVAN_DRAPES.map(recipe=>model.getObjectByName(recipe.name)),detail=model.getObjectByName('Forest aristocrat drape gold');
  assert(panels.every(p=>p?.isSkinnedMesh)&&detail?.isSkinnedMesh,'all panels and attached details are fitted');
  const body=model.getObjectByName(bodyName),edgeContact=garmentEdgeFixture(model,body,panels),contacts=panels.slice(0,2).map(p=>skirtContactFixture(model,body,p));
  model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
  const pelvis=model.getObjectByName('pelvis'),inverse=pelvis.matrixWorld.clone().invert();
  const waists=panels.map(mesh=>({mesh,points:Array.from({length:37},(_,i)=>({i,local:mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverse)}))}));
  const rest=[...panels,detail].map(mesh=>mesh.geometry.attributes.position.array.slice());
  try{
    avatar.object.position.y=.55-avatar.rig.hipHeight+.025;
    for(let frame=0;frame<=144;frame++)avatar.update(frame*1000/60,'continue',false,{speed:0,distance:0,riding:true,ridingKind:'seat',seatToFloor:.55},()=>0);
    const results=contacts.map(contact=>contact.sample());
    for(const result of results){assert(result.tested>100,JSON.stringify(result));assert.equal(result.penetrating,0,JSON.stringify(result));}
    const seatedEdges=edgeContact.sample();t.diagnostic(JSON.stringify({seatedEdges}));
    assert(seatedEdges.every(result=>result.testedEdges>0&&result.crossings===0),JSON.stringify(seatedEdges));
    for(const {mesh,points}of waists){
      assert(mesh.morphTargetInfluences.every(value=>value>.99));
      const displacement=Math.max(...points.map(({i,local})=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld).distanceTo(local.clone().applyMatrix4(pelvis.matrixWorld))));
      assert(displacement<1e-5,`${mesh.name} waistband moved ${displacement}m`);
    }
    const triangles=panels.flatMap(mesh=>{
      const vertices=Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
      return Array.from({length:mesh.geometry.index.count/3},(_,i)=>new THREE.Triangle(...[0,1,2].map(c=>vertices[mesh.geometry.index.getX(i*3+c)])));
    });
    const point=new THREE.Vector3(),closest=new THREE.Vector3();let maximumDetailGap=0;
    // Sample throughout every original leaf and chain; this is sampled
    // attachment coverage, not a whole-surface collision proof.
    for(let i=0;i<detail.geometry.attributes.position.count;i+=7){
      detail.getVertexPosition(i,point).applyMatrix4(detail.matrixWorld);let distance=Infinity;
      for(const triangle of triangles)distance=Math.min(distance,triangle.closestPointToPoint(point,closest).distanceTo(point));
      maximumDetailGap=Math.max(maximumDetailGap,distance);
    }
    assert(maximumDetailGap<.07,`gold detail detached: ${maximumDetailGap}m`);
    t.diagnostic(JSON.stringify({contacts:results,maximumDetailGap}));
    for(const [i,mesh]of [...panels,detail].entries())assert.deepEqual(mesh.geometry.attributes.position.array,rest[i],'runtime keeps rest buffers unchanged');
    avatar.object.position.y=0;avatar.update(3000,'continue',false,{speed:0,distance:0},()=>0);
    for(const mesh of [...panels,detail])assert(mesh.morphTargetInfluences.every(value=>value===0),'standing restores cloth and details');
    const failures=[];
    for(const [gait,speed]of [[0,1.4],[1,3.4]])for(let frame=0;frame<=181;frame++){
      const distance=frame/60*speed;avatar.object.position.z=distance;
      avatar.update(3000+gait*4000+frame*1000/60,'continue',false,{speed,distance},()=>0);
      if(![144,151,163,181].includes(frame))continue;
      for(const result of edgeContact.sample())if(!result.testedEdges||result.crossings)failures.push({speed,frame,...result});
    }
    assert.deepEqual(failures,[],'moving garment edges cross the actual upper thighs');
  }finally{edgeContact.dispose();for(const contact of contacts)contact.dispose();avatar.dispose();}
});

for(const [appearanceId,profile,bodyName,height]of [
  ['forest-aristocrat','man-casual','man-casualmale_casualsuit02',1.805],
  ['forest-aristocrat-feminine','jevica','Jevica',1.685],
])test(`${appearanceId}: drape clearance follows asymmetric bends under transformed roots`,async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig(profile),{targetHeight:height,id:'silvan-bends'}),root=new THREE.Group();root.add(avatar.model);
  const model=avatar.model,look=createReferenceStyle(avatar,sharedAppearance(appearanceId));
  const contacts=SILVAN_DRAPES.slice(0,2).map(recipe=>skirtContactFixture(model,model.getObjectByName(bodyName),model.getObjectByName(recipe.name))),failures=[];
  const edges=garmentEdgeFixture(model,model.getObjectByName(bodyName),SILVAN_DRAPES.map(recipe=>model.getObjectByName(recipe.name)));
  try{
    for(const [left,right]of [[20,20],[40,40],[60,60],[90,90],[60,90],[90,60],[45,90],[90,45],[30,90],[90,30]]){
      root.position.set(3,2,-5);root.rotation.set(.1,.7,-.15);root.scale.setScalar(1.2);
      for(const [side,degrees]of [['l',left],['r',right]])for(const [name,sign]of [['thigh',-1],['calf',1]]){
        const bone=model.getObjectByName(`${name}_${side}`);bone.quaternion.copy(avatar.rest.get(bone)).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone).x,sign*degrees*Math.PI/180));
      }
      look.update();
      for(const result of edges.sample())if(!result.testedEdges||result.crossings)failures.push({left,right,...result});
      for(const [panel,contact]of contacts.entries()){const result=contact.sample();if((result.tested<20&&!(panel===1&&left===20&&right===20))||result.penetrating)failures.push({left,right,panel,...result});}
    }
    assert.deepEqual(failures,[]);
  }finally{edges.dispose();for(const contact of contacts)contact.dispose();look.dispose();avatar.dispose();}
});


test('Silvan packed corrections retain provenance and bounded per-rig data',async()=>{
  const root=new URL('../../',import.meta.url),receipt=JSON.parse(await readFile(new URL('preview/src/silvan-drape-morph-receipt.json',root),'utf8'));
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  await verifyBakeProvenance({root, bake: 'silvan-drape', receipt});
  const bytes=await readFile(new URL('preview/src/silvan-drape-morph-data.js',root));
  assert.equal(hash(bytes),receipt.outputSha256);assert(bytes.length<1_500_000,'packed source exceeds 1.5 MB');
  assert.deepEqual(Object.keys(SILVAN_DRAPE_MORPHS),['masculine','feminine']);
  for(const [variant,parts]of Object.entries(SILVAN_DRAPE_MORPHS)){
    assert.equal(parts.length,4);
    for(const [i,data]of parts.entries()){
      const count=i===3?5740:925;
      assert.equal(data.sourcePositions.length,count*3);assert.equal(data.sourceWeights.length,count*4);
      assert.equal(data.positionDelta.length,count*3);assert.equal(data.normalDelta.length,count*3);
      for(const field of ['sourcePositions','sourceWeights','positionDelta','normalDelta'])assert(data[field].every(Number.isFinite),field);
      assert(data.positionDelta.every(value=>Math.abs(value)<1.2));assert(data.normalDelta.every(value=>Math.abs(value)<=2));
      const weights=data.fittedWeights??data.sourceWeights;assert.equal(weights.length,count*4);
      for(let v=0;v<count;v++){
        const row=weights.slice(v*4,v*4+4);assert(row.every(w=>Number.isFinite(w)&&w>=0&&w<=1));
        assert(Math.abs(row.reduce((sum,w)=>sum+w,0)-1)<1e-6);
      }
      if(i<3){assert.equal(receipt.diagnostics[variant][i].penetrating,0);assert(receipt.diagnostics[variant][i].maxReconstruction<1e-6);}
    }
  }
});
