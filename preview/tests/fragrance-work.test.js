import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_PROFILES, instantiateAvatar } from '../src/avatars.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { createWorkerTask, workPropKind } from '../src/work-props.js';

test('fragrance workers demonstrate a scent strip',()=>{
  assert.equal(workPropKind('perfumery','attend'),'blotter');
  assert.equal(workPropKind('salon','attend'),'samples');
});

import { skinInStripFrame } from './helpers/fragrance-skin.js';
import { handConvexIntersections } from './helpers/convex-contact.js';

for(const profile of AVATAR_PROFILES)test(`${profile}: fragrance pinch contacts the paper without stretching fingers`,async()=>{
  const source=await loadCharacterRig(profile);
  const sourceThumb=source.scene.getObjectByName('thumb_01_r').quaternion.clone();
  for(const scale of [0.95,1.1]) {
    const avatar=instantiateAvatar(source,{targetHeight:source.height*scale,id:'fragrance'}),holder=new THREE.Group();holder.add(avatar.model);
    holder.position.set(-2750,18,1194);holder.rotation.y=1.7;holder.updateWorldMatrix(true,true);
    const bones=[];avatar.model.traverse(bone=>{if(bone.isBone)bones.push([bone,bone.position.clone()]);});
    const task=createWorkerTask(avatar,holder,{theme:'perfumery',floor:18,fixtures:[]},{pose:'greet'});
    try {
      assert.equal(task.kind,'blotter');assert.ok(task.strip?.isMesh,'A physical paper strip is rendered');
      task.strip.geometry.computeBoundingBox();const bounds=task.strip.geometry.boundingBox;
      let low=Infinity,high=-Infinity;
      for(const time of [0,2,4,6,8,10,12]) {
        task.update(time,0);
        const y=task.strip.getWorldPosition(new THREE.Vector3()).y;low=Math.min(low,y);high=Math.max(high,y);
        for(const contact of task.contacts)assert.ok(contact.error<0.001,`${time}: ${contact.kind} contact drift ${contact.error}`);
        const hand=avatar.model.getObjectByName('hand_r');
        assert.ok(hand.quaternion.angleTo(avatar.rest.get(hand))<0.25,`${time}: pinch bends the wrist excessively`);
        const skin=skinInStripFrame(avatar.model,task.strip);
        const overlaps=p=>p.x>=bounds.min.x&&p.x<=bounds.max.x&&p.z>=bounds.min.z&&p.z<=bounds.max.z;
        const index=skin.index.filter(overlaps),thumb=skin.thumb.filter(overlaps);
        assert.ok(index.length&&thumb.length,'Both fingertip pads overlap the paper');
        const top=Math.max(...index.map(p=>p.y)),bottom=Math.min(...thumb.map(p=>p.y));
        assert.ok(top<=bounds.min.y+0.0002&&top>=bounds.min.y-0.002,`${time}: index contact ${top}`);
        assert.ok(bottom>=bounds.max.y-0.0002&&bottom<=bounds.max.y+0.002,`${time}: thumb contact ${bottom}`);
        const penetrations=skin.hand.filter(p=>overlaps(p)&&p.y>bounds.min.y+0.00005&&p.y<bounds.max.y-0.00005);
        assert.equal(penetrations.length,0,`${time}, scale ${scale}: paper cuts through hand skin at ${JSON.stringify(penetrations.map(p=>p.toArray()))}`);
        assert.ok(skin.triangles>1000,'Actual skinned hand triangles are checked');
        assert.equal(skin.intersections,0,`${time}: paper intersects a hand triangle`);
        const tray=task.object.getObjectByName('Supported work surface');tray.geometry.computeBoundingBox();
        assert.equal(skinInStripFrame(avatar.model,tray).intersections,0,`${time}: fragrance hand crosses its carried tray`);
        const samples=task.object.children.filter(mesh=>mesh.geometry?.type==='CylinderGeometry');
        assert.equal(handConvexIntersections(avatar.model,samples).intersections,0,`${time}: hand crosses a carried sample bottle or cap`);
      }
      assert.ok(high-low>0.15,'Worker lifts the strip for inspection');
      for(const [bone,position] of bones)assert.ok(bone.position.equals(position),`${bone.name} length changed`);
      assert.ok(source.scene.getObjectByName('thumb_01_r').quaternion.equals(sourceThumb),'Shared source is untouched');
    } finally {task.dispose();avatar.dispose();}
    assert.equal(task.strip.parent,null,'Disposal removes the held strip');
  }
});
