import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
import {shareAvatarSkeletons} from '../src/avatar-skeletons.js';
import {instantiateAvatar,AVATAR_PROFILES} from '../src/avatars.js';
import {loadCharacterRig} from './helpers/character-rig.js';

const meshes=model=>{const out=[];model.traverse(m=>{if(m.isSkinnedMesh)out.push(m);});return out;};
function vertexPositions(mesh){mesh.skeleton.update();return Array.from({length:mesh.geometry.attributes.position.count},(_,i)=>mesh.getVertexPosition(i,new THREE.Vector3()).toArray());}

test('all seven cached rigs retain exact skinned vertices while equivalent cloned skeletons share one owner',async()=>{
 for(const profile of [...AVATAR_PROFILES,'jevica']){
  const source=await loadCharacterRig(profile),model=clone(source.scene),parts=meshes(model),originals=new Set(parts.map(m=>m.skeleton));
  model.getObjectByName('head').rotation.z+=.12;model.getObjectByName('upperarm_l').rotation.x+=.3;model.updateMatrixWorld(true);
  const before=parts.map(m=>({positions:vertexPositions(m),bind:m.bindMatrix.clone(),inverse:m.bindMatrixInverse.clone(),geometry:m.geometry}));
  assert.ok(originals.size>=5);const retained=shareAvatarSkeletons(model);assert.equal(retained.size,1,profile);
  for(const [i,m]of parts.entries()){assert.deepEqual(vertexPositions(m),before[i].positions);assert.ok(m.bindMatrix.equals(before[i].bind));assert.ok(m.bindMatrixInverse.equals(before[i].inverse));assert.equal(m.geometry,before[i].geometry);}
  assert.equal(new Set(meshes(source.scene).map(m=>m.skeleton)).size,1,'Cached source retains its original skeleton');
  for(const s of retained)s.dispose();
 }
});

test('different bone identities and any different inverse bind matrix remain separate',()=>{
 const root=new THREE.Group(),a=new THREE.Bone(),b=new THREE.Bone();root.add(a,b);
 const skeletons=[new THREE.Skeleton([a],[new THREE.Matrix4()]),new THREE.Skeleton([b],[new THREE.Matrix4()]),new THREE.Skeleton([a],[new THREE.Matrix4().makeTranslation(.000001,0,0)])];
 for(const s of skeletons){const m=new THREE.SkinnedMesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial());m.skeleton=s;root.add(m);}
 assert.equal(shareAvatarSkeletons(root).size,3);assert.deepEqual(meshes(root).map(m=>m.skeleton),skeletons);
 for(const m of meshes(root)){m.skeleton.dispose();m.geometry.dispose();m.material.dispose();}
});

test('duplicates retire once, the retained skeleton stays alive, and instances never share animated bones',async()=>{
 const source=await loadCharacterRig('jevica'),model=clone(source.scene),parts=meshes(model),retired=new Map();
 for(const m of parts){const skeleton=m.skeleton,dispose=skeleton.dispose.bind(skeleton);skeleton.dispose=()=>{retired.set(skeleton,(retired.get(skeleton)??0)+1);dispose();};}
 const retained=shareAvatarSkeletons(model);assert.equal(retained.size,1);assert.equal(retired.size,parts.length-1);assert.ok([...retired.values()].every(n=>n===1));
 shareAvatarSkeletons(model);assert.equal(retired.size,parts.length-1,'Repeated sharing is idempotent');assert.ok([...retained].every(s=>!retired.has(s)));
 const first=instantiateAvatar(source,{targetHeight:1.7}),second=instantiateAvatar(source,{targetHeight:1.7});
 assert.equal(first.skeletons.size,1);assert.equal(second.skeletons.size,1);assert.notEqual([...first.skeletons][0],[...second.skeletons][0]);
 assert.notEqual(first.model.getObjectByName('head'),second.model.getObjectByName('head'));
 assert.equal(new Set(meshes(first.model).map(m=>m.skeleton)).size,2,'Eye tracking keeps its separate two-bone skeleton');
 first.dispose();second.dispose();for(const s of retained)s.dispose();
});

test('meshes keep different bind transforms when their bone palette is shared',()=>{
 const model=new THREE.Group(),bone=new THREE.Bone();model.add(bone);
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));geometry.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(new Array(12).fill(0),4));geometry.setAttribute('skinWeight',new THREE.Float32BufferAttribute([1,0,0,0,1,0,0,0,1,0,0,0],4));
 const parts=[];
 for(const x of [0,.25]){const mesh=new THREE.SkinnedMesh(geometry,new THREE.MeshBasicMaterial()),skeleton=new THREE.Skeleton([bone],[new THREE.Matrix4()]);mesh.bind(skeleton,new THREE.Matrix4().makeTranslation(x,0,0));model.add(mesh);parts.push(mesh);}
 bone.rotation.z=.3;model.updateMatrixWorld(true);const before=parts.map(vertexPositions);
 assert.notDeepEqual(before[0],before[1]);assert.equal(shareAvatarSkeletons(model).size,1);
 parts.forEach((mesh,i)=>assert.deepEqual(vertexPositions(mesh),before[i]));assert.ok(!parts[0].bindMatrix.equals(parts[1].bindMatrix));
 parts[0].skeleton.dispose();geometry.dispose();for(const mesh of parts)mesh.material.dispose();
});
