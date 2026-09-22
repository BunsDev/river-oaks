import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_PROFILES, instantiateAvatar } from '../src/avatars.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { createWorkerTask } from '../src/work-props.js';

for(const profile of AVATAR_PROFILES)test(`${profile}: hands maintain work contacts through the full task cycle`,async()=>{
  const source=await loadCharacterRig(profile);
  for(const scale of [0.95,1.1])for(const theme of ['dining','fashion','jewelry','optician','perfumery','gallery']) {
    const avatar=instantiateAvatar(source,{targetHeight:source.height*scale,id:'worker'}),holder=new THREE.Group();holder.add(avatar.model);
    holder.position.set(-2750,18,1194);holder.rotation.y=1.7;holder.updateWorldMatrix(true,true);
    const room={theme,floor:18,fixtures:[{kind:'counter',a:0,d:0.5,w:1,l:0.3}],toWorld(a,d){const p=holder.localToWorld(new THREE.Vector3(a,0,d));return [p.x,-p.z];}};
    const task=createWorkerTask(avatar,holder,room,{a:0,d:0,pose:theme==='dining'?'carry':'attend'});
    assert.ok(task);
    for(const time of [0,2,4,6,8,10,12])for(const attention of [0,1]) {
      task.update(time,attention);
      for(const contact of task.contacts)assert.ok(contact.error<0.001,`${theme} scale ${scale} time ${time}: hand contact misses by ${contact.error}m`);
    }
    task.dispose();assert.equal(task.object.parent,null);avatar.dispose();
  }
});
