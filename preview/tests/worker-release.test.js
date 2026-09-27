import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_PROFILES, instantiateAvatar } from '../src/avatars.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { createWorkerTask } from '../src/work-props.js';

function sourcePose(source) {
  const pose=[];
  source.scene.traverse(bone=>{if(bone.isBone)pose.push([bone.name,...bone.position.toArray(),...bone.quaternion.toArray(),...bone.scale.toArray()]);});
  return pose;
}

for(const profile of AVATAR_PROFILES)test(`${profile}: release follows set-down, and re-grasp precedes lift`,async()=>{
  const source=await loadCharacterRig(profile),original=sourcePose(source),avatar=instantiateAvatar(source,{targetHeight:profile.startsWith('woman')?1.66:1.78,id:'release'});
  const holder=new THREE.Group();holder.add(avatar.model);holder.position.set(-25,18,12);holder.rotation.y=1.1;holder.updateWorldMatrix(true,true);
  const room={theme:'fashion',floor:18,fixtures:[{kind:'counter',a:0,d:.625,w:1.5}],toWorld(a,d){const p=holder.localToWorld(new THREE.Vector3(a,0,d));return [p.x,-p.z];}};
  const task=createWorkerTask(avatar,holder,room,{a:0,d:0,pose:'attend'});
  try {
    assert.equal(task.docked,true,'the regression uses a reachable worktop');
    task.update(0,0);
    assert.ok(task.contacts.every(c=>c.engaged===false),'resting hands must actually release the load');
    assert.ok(Math.abs(task.object.position.y-1.025)<.0001,'the load sits on the rendered counter surface');
    const released=task.contacts.map(c=>new THREE.Vector3(...c.actual));
    const finger=avatar.model.getObjectByName('index_02_l'),relaxed=finger.quaternion.clone();
    task.update(2,0);
    assert.ok(task.contacts.every(c=>c.engaged),'both hands support before liftoff');
    assert.ok(task.contacts.every((c,i)=>new THREE.Vector3(...c.actual).distanceTo(released[i])>.06),'release moves hands clear of the load');
    assert.ok(finger.quaternion.angleTo(relaxed)>.025,'released fingers relax instead of retaining a fixed platform pose');
    for(const time of [3,5,8,9.9]) {
      task.update(time,0);assert.ok(task.contacts.every(c=>c.engaged),'never release an airborne load');
      assert.ok(task.contacts.every(c=>c.error<.001));
    }
    task.update(10,0);assert.ok(task.contacts.every(c=>c.engaged),'support continues through landing');
    task.update(11.8,0);assert.ok(task.contacts.every(c=>!c.engaged));
    assert.ok(Math.abs(task.object.position.y-1.025)<.0001);
    let previous=null,previousRotations=null,maxSpeed=0,maxAngularSpeed=0;
    for(let frame=0;frame<=720;frame++) {
      task.update(frame/60,0);
      const wrists=['l','r'].map(side=>avatar.model.getObjectByName(`hand_${side}`).getWorldPosition(new THREE.Vector3()));
      const rotations=['l','r'].map(side=>avatar.model.getObjectByName(`hand_${side}`).getWorldQuaternion(new THREE.Quaternion()));
      if(previous)maxSpeed=Math.max(maxSpeed,...wrists.map((p,i)=>p.distanceTo(previous[i])*60));
      if(previousRotations)maxAngularSpeed=Math.max(maxAngularSpeed,...rotations.map((q,i)=>q.angleTo(previousRotations[i])*60));
      previous=wrists;previousRotations=rotations;
    }
    assert.ok(maxSpeed<1,`no release/re-grasp or loop teleport: ${maxSpeed} m/s`);
    assert.ok(maxAngularSpeed<7,`withdrawal and re-grasp turn the wrists gradually: ${maxAngularSpeed} rad/s`);
    assert.deepEqual(sourcePose(source),original,'a complete release cycle preserves the shared source rig');
  } finally {task.dispose();avatar.dispose();}
});

for(const profile of AVATAR_PROFILES)test(`${profile}: unsupported loads and paper never release`,async()=>{
  const source=await loadCharacterRig(profile),original=sourcePose(source);
  for(const theme of ['dining','fashion','jewelry','optician','perfumery','salon','default'])for(const docked of theme==='perfumery'?[false,true]:[false]) {
    const avatar=instantiateAvatar(source,{targetHeight:profile.startsWith('woman')?1.66:1.78,id:'held'}),holder=new THREE.Group();holder.add(avatar.model);holder.updateWorldMatrix(true,true);
    const room={theme,floor:0,fixtures:docked?[{kind:'counter',a:0,d:.625,w:1.5}]:[],toWorld:(a,d)=>[a,-d]};
    const task=createWorkerTask(avatar,holder,room,{a:0,d:0,pose:theme==='dining'?'carry':'attend'});
    try {
      assert.equal(task.docked,docked);
      for(let frame=0;frame<=720;frame++) {
        task.update(frame/60,0);
        for(const contact of task.contacts)if(!docked) {
          assert.equal(contact.engaged,true,`${theme}, ${frame}: an occupied hand must keep holding`);
          assert.equal(contact.release,0);
          assert.ok(new THREE.Vector3(...contact.actual).distanceTo(new THREE.Vector3(...contact.loadTarget))<.001);
        }
        if(docked&&(frame===0||frame===720))assert.ok(task.contacts.every(c=>!c.engaged),'both hands release their supported loads');
      }
      assert.deepEqual(sourcePose(source),original);
    } finally {task.dispose();avatar.dispose();}
  }
});
