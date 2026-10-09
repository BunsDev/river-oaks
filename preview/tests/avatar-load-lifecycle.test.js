import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { loadResidentAvatar } from '../src/avatars.js';
import { buildStorePeople } from '../src/store-people.js';
import { residentHairstyleFor } from '../src/resident-hairstyle.js';
import { storePersonId } from '../src/store-encounters.js';

function trackMaterials(t) {
  const owned=new Map(),clone=THREE.Material.prototype.clone;
  t.mock.method(THREE.Material.prototype,'clone',function(){
    const material=clone.call(this);owned.set(material,0);
    material.addEventListener('dispose',()=>owned.set(material,owned.get(material)+1));
    return material;
  });
  return ()=>{
    assert.ok(owned.size>0,'the loaded avatar allocated its own materials');
    assert.ok([...owned.values()].every(count=>count===1),'every cloned material must be released exactly once');
  };
}

test('resident load releases its instantiated rig when the hairstyle download fails',async t=>{
  const source=await loadCharacterRig('woman-casual');
  const id=Array.from({length:100},(_,i)=>`load-failure-${i}`).find(id=>residentHairstyleFor(id,'woman-casual'));
  t.mock.method(GLTFLoader.prototype,'loadAsync',async url=>{
    if(url.endsWith('/woman-casual.glb'))return source;
    throw new Error('hairstyle unavailable');
  });
  const verify=trackMaterials(t);
  await assert.rejects(loadResidentAvatar(0,id,'woman-casual'),/hairstyle unavailable/);
  verify();
});

test('store people release a partial rig on hairstyle failure and report the asset error',async t=>{
  const source=await loadCharacterRig('man-casual');
  const room={storeId:'lifecycle',index:0,theme:'fashion',facade:[0,0],floor:0,right:[1,0],inward:[0,1],toWorld:(a,d)=>[a,d],people:[{role:'guest',seed:0,a:0,d:0,pose:'stand'}]};
  // Guest seed 0 selects man-casual. Choose a stable identity needing a donor.
  while(!residentHairstyleFor(storePersonId(room,0),'man-casual'))room.storeId+='x';
  const errors=[];
  const previousDocument=globalThis.document;
  globalThis.document={querySelector:()=>({dataset:{}}),dispatchEvent:event=>errors.push(event)};
  t.after(()=>{if(previousDocument===undefined)delete globalThis.document;else globalThis.document=previousDocument;});
  t.mock.method(GLTFLoader.prototype,'loadAsync',async url=>{
    if(url.endsWith('/man-casual.glb'))return source;
    throw new Error('hairstyle unavailable');
  });
  const verify=trackMaterials(t),people=buildStorePeople([room]);
  await people.userData.ready;
  assert.equal(people.userData.figures.length,0);
  assert.equal(errors.length,1);
  people.userData.dispose();
  verify();
});
