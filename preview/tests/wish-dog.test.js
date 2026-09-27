import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createWishDog } from '../src/wish-dog.js';

const bytes=readFileSync(new URL('../public/assets/dog/dog.glb',import.meta.url));
const jsonLength=bytes.readUInt32LE(12),gltf=JSON.parse(bytes.toString('utf8',20,20+jsonLength));
const exportedMaterials=gltf.materials;
gltf.materials=gltf.materials.map(({name})=>({name}));delete gltf.images;delete gltf.textures;
gltf.buffers[0].uri='data:application/octet-stream;base64,'+bytes.subarray(28+jsonLength).toString('base64');
globalThis.ProgressEvent??=class{};
const asset=await new GLTFLoader().parseAsync(JSON.stringify(gltf),'');

test('dog has a textured anatomical skin, independent rig, bounded geometry and grounded paws',async()=>{
  const a=createWishDog('maya',{loadAsset:async()=>asset}),b=createWishDog('ada',{loadAsset:async()=>asset});
  assert.equal(await a.ready,true);await b.ready;
  assert.notEqual(a.object.getObjectByName('b_Head'),b.object.getObjectByName('b_Head'));
  let triangles=0,meshes=0;
  a.object.traverse(o=>{if(o.isMesh){meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;assert.equal(o.userData.localId,'maya');}});
  assert.ok(meshes<=4);assert.ok(triangles>5000&&triangles<30000,`triangles ${triangles}`);
  assert.ok(exportedMaterials.some(m=>m.normalTexture&&m.pbrMetallicRoughness?.baseColorTexture&&m.pbrMetallicRoughness?.metallicRoughnessTexture));
  a.object.updateMatrixWorld(true);
  const feet=['b_LeftHand02','b_RightHand02','b_LeftFoot02','b_RightFoot02'].map(name=>a.object.getObjectByName(name));
  const contact=feet.map(bone=>bone.getWorldPosition(new THREE.Vector3()));
  const size=new THREE.Box3().setFromObject(a.object).getSize(new THREE.Vector3());
  assert.ok(size.y>.8&&size.y<1.1&&size.z<2.2,`metre scale ${size.toArray()}`);
  for(let i=0;i<100;i++){
    a.update(i/10,'trouble');a.object.updateMatrixWorld(true);
    feet.forEach((bone,n)=>assert.ok(bone.getWorldPosition(new THREE.Vector3()).distanceTo(contact[n])<1e-6,'idle leaves planted paws fixed'));
  }
  assert.ok(Math.abs(new THREE.Box3().setFromObject(a.object).min.y)<.005,'rendered sole reaches ground');
  a.dispose();b.dispose();
});

test('dog reduced motion freezes pose and independent disposal retains cached resources',async()=>{
  const dog=createWishDog('maya',{loadAsset:async()=>asset});await dog.ready;
  const resources=new Set();asset.scene.traverse(o=>{if(o.isMesh){resources.add(o.geometry);resources.add(o.material);}});
  for(const resource of resources)resource.addEventListener('dispose',()=>assert.fail('cached resources must survive an individual wish'));
  dog.update(3,'trouble',true);dog.object.updateMatrixWorld(true);const before=[];dog.object.traverse(o=>before.push(o.matrixWorld.toArray()));
  dog.update(31,'pleading',true);dog.object.updateMatrixWorld(true);const after=[];dog.object.traverse(o=>after.push(o.matrixWorld.toArray()));
  assert.deepEqual(after,before);
  dog.dispose();dog.dispose();assert.equal(dog.object.children.length,0);
});

test('undo before dog asset resolves cannot attach a ghost; load failures remain recoverable',async()=>{
  let resolve;const dog=createWishDog('maya',{loadAsset:()=>new Promise(r=>{resolve=r;})});
  dog.dispose();resolve(asset);assert.equal(await dog.ready,false);assert.equal(dog.object.children.length,0);
  const failed=createWishDog('maya',{loadAsset:async()=>{throw new Error('offline');}});assert.equal(await failed.ready,false);assert.equal(failed.loaded,false);failed.dispose();
});

test('dog head motion is identical in its own frame at every resident heading',async()=>{
  const dogs=[0,Math.PI/2].map(angle=>{const holder=new THREE.Group();holder.rotation.y=angle;const dog=createWishDog('maya',{loadAsset:async()=>asset});holder.add(dog.object);return dog;});
  await Promise.all(dogs.map(d=>d.ready));
  dogs.forEach(d=>d.update(Math.PI/(2*1.7),'trouble'));
  for(const name of ['b_Neck','b_Head','b_Tail01'])assert.ok(dogs[0].object.getObjectByName(name).quaternion.angleTo(dogs[1].object.getObjectByName(name).quaternion)<1e-6,name);
  dogs.forEach(d=>d.dispose());
});
