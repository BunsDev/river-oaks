import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { AVATAR_PROFILES } from '../src/avatars.js';
import { relaxResidentArms } from '../src/avatar-stance.js';
import { createWorkerTask } from '../src/work-props.js';

function rig(profile, scale) {
  const bytes=readFileSync(new URL(`../public/assets/characters/${profile}.glb`,import.meta.url));
  const gltf=JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));
  const nodes=gltf.nodes.map(node=>{
    const object=new THREE.Object3D();object.name=node.name??'';
    if(node.translation)object.position.fromArray(node.translation);
    if(node.rotation)object.quaternion.fromArray(node.rotation);
    if(node.scale)object.scale.fromArray(node.scale);
    if(node.matrix){object.matrix.fromArray(node.matrix);object.matrix.decompose(object.position,object.quaternion,object.scale);}
    return object;
  });
  gltf.nodes.forEach((node,i)=>node.children?.forEach(child=>nodes[i].add(nodes[child])));
  const model=new THREE.Group();gltf.scenes[gltf.scene??0].nodes.forEach(i=>model.add(nodes[i]));model.scale.setScalar(scale);
  relaxResidentArms(model);
  const hipHeight=model.getObjectByName('thigh_l').getWorldPosition(new THREE.Vector3()).y;
  return {model,hipHeight};
}

for(const profile of AVATAR_PROFILES)test(`${profile}: both palms support work props through the full task cycle`,()=>{
  for(const scale of [0.95,1.1])for(const theme of ['dining','fashion','jewelry','optician','perfumery','gallery']) {
    const avatar=rig(profile,scale),holder=new THREE.Group();holder.add(avatar.model);
    holder.position.set(-2750,18,1194);holder.rotation.y=1.7;holder.updateWorldMatrix(true,true);
    const room={theme,floor:18,fixtures:[{kind:'counter',a:0,d:0.5,w:1,l:0.3}],toWorld(a,d){const p=holder.localToWorld(new THREE.Vector3(a,0,d));return [p.x,-p.z];}};
    const task=createWorkerTask(avatar,holder,room,{a:0,d:0,pose:theme==='dining'?'carry':'attend'});
    assert.ok(task);
    for(const time of [0,2,4,6,8,10,12])for(const attention of [0,1]) {
      task.update(time,attention);
      for(const contact of task.contacts)assert.ok(contact.error<0.001,`${theme} scale ${scale} time ${time}: palm misses by ${contact.error}m`);
    }
    task.dispose();assert.equal(task.object.parent,null);
  }
});
