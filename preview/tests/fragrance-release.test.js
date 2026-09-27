import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AVATAR_PROFILES, instantiateAvatar } from '../src/avatars.js';
import { loadCharacterRig } from './helpers/character-rig.js';
import { skinInStripFrame } from './helpers/fragrance-skin.js';
import { handConvexIntersections } from './helpers/convex-contact.js';
import { createWorkerTask } from '../src/work-props.js';
import { staffWorkPose, blendStationPose } from '../src/store-work.js';

function paperIntersectsBox(strip,mesh) {
  mesh.geometry.computeBoundingBox();
  const bounds=mesh.geometry.boundingBox.clone().expandByScalar(-.00005),p=strip.geometry.attributes.position,indices=strip.geometry.index;
  const point=i=>mesh.worldToLocal(strip.localToWorld(new THREE.Vector3().fromBufferAttribute(p,i)));
  for(let i=0;i<indices.count;i+=3)if(bounds.intersectsTriangle(new THREE.Triangle(point(indices.getX(i)),point(indices.getX(i+1)),point(indices.getX(i+2)))))return true;
  return false;
}

for(const profile of AVATAR_PROFILES)test(`${profile}: fragrance paper lands, releases and re-grasps`,async()=>{
  const source=await loadCharacterRig(profile),sourcePose=[];
  source.scene.traverse(b=>{if(b.isBone)sourcePose.push([b,...b.position.toArray(),...b.quaternion.toArray()]);});
  const avatar=instantiateAvatar(source,{targetHeight:profile.startsWith('woman')?1.66:1.78,id:'paper-release'});
  const holder=new THREE.Group();holder.add(avatar.model);holder.position.set(-25,18,12);holder.rotation.y=1.1;holder.updateWorldMatrix(true,true);
  const room={theme:'perfumery',floor:18,fixtures:[{kind:'counter',a:0,d:.625,w:1.5}],toWorld(a,d){const p=holder.localToWorld(new THREE.Vector3(a,0,d));return [p.x,-p.z];}};
  const task=createWorkerTask(avatar,holder,room,{a:0,d:0,pose:'attend'});
  try {
    assert.equal(task.docked,true);
    const right=()=>task.contacts.find(c=>c.side==='r');
    task.strip.geometry.computeBoundingBox();
    task.update(0,0);assert.equal(right().engaged,false,'the paper must actually be released');
    const stand=task.object.getObjectByName('Blotter stand');assert.ok(stand,'released paper has a physical holder');
    const jaws=['Blotter upper jaw','Blotter lower jaw'].map(name=>stand.getObjectByName(name));
    const solids=[];stand.traverse(mesh=>{if(mesh.isMesh){mesh.geometry.computeBoundingBox();solids.push(mesh);}});
    const samples=task.object.children.filter(mesh=>mesh.geometry?.type==='CylinderGeometry');
    assert.equal(samples.length,6,'three physical sample bottles with caps');
    for(const time of [0,1,2,10,11,12]) {
      task.update(time,0);
      for(const jaw of jaws){
        const p=jaw.geometry.attributes.position,points=Array.from({length:p.count},(_,i)=>task.strip.worldToLocal(jaw.localToWorld(new THREE.Vector3().fromBufferAttribute(p,i))));
        assert.ok(Math.min(...points.map(p=>Math.abs(Math.abs(p.y)-.0003)))<.0001,`${time}: paper touches the physical clip`);
        assert.ok(points.some(p=>p.z>-.003&&p.z<.117),'clip overlaps the supported paper');
      }
      if(time===0||time===12){assert.equal(right().engaged,false,'the paper must actually be released');assert.ok(new THREE.Vector3(...right().actual).distanceTo(new THREE.Vector3(...right().loadTarget))>.06);}
      if(time===2||time===10)assert.equal(right().engaged,true,'grasp completes before lift and remains through landing');
    }
    let previous=null,maxElbowSpeed=0,maxWristSpeed=0,maxTipSpeed=0,maxWristAngularSpeed=0,maxPaperAngularSpeed=0;
    for(let frame=0;frame<=1440;frame++) {
      const time=frame/120,pose=blendStationPose({},staffWorkPose('perfumery',time),0);
      for(const bone of avatar.bones){
        bone.quaternion.copy(avatar.rest.get(bone));
        for(const [i,axis] of ['x','y','z'].entries())if(pose[bone.name]?.[i])bone.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone)[axis],pose[bone.name][i]));
      }
      holder.updateWorldMatrix(true,true);task.update(time,0);
      const hand=avatar.model.getObjectByName('hand_r'),wrist=hand.getWorldPosition(new THREE.Vector3()),rotation=hand.getWorldQuaternion(new THREE.Quaternion());
      const elbow=avatar.model.getObjectByName('lowerarm_r').getWorldPosition(new THREE.Vector3());
      const forward=avatar.model.getObjectByName('middle_01_r').getWorldPosition(new THREE.Vector3()).sub(wrist);
      const forearm=wrist.clone().sub(avatar.model.getObjectByName('lowerarm_r').getWorldPosition(new THREE.Vector3()));
      const across=avatar.model.getObjectByName('pinky_01_r').getWorldPosition(new THREE.Vector3()).sub(avatar.model.getObjectByName('index_01_r').getWorldPosition(new THREE.Vector3()));
      const normal=new THREE.Vector3().crossVectors(forward,across).normalize();
      forward.addScaledVector(normal,-forward.dot(normal));forearm.addScaledVector(normal,-forearm.dot(normal));
      const tip=task.strip.localToWorld(new THREE.Vector3(0,0,.117)),paper=task.strip.getWorldQuaternion(new THREE.Quaternion());
      if(previous){maxElbowSpeed=Math.max(maxElbowSpeed,elbow.distanceTo(previous.elbow)*120);maxWristSpeed=Math.max(maxWristSpeed,wrist.distanceTo(previous.wrist)*120);maxTipSpeed=Math.max(maxTipSpeed,tip.distanceTo(previous.tip)*120);maxWristAngularSpeed=Math.max(maxWristAngularSpeed,rotation.angleTo(previous.rotation)*120);maxPaperAngularSpeed=Math.max(maxPaperAngularSpeed,paper.angleTo(previous.paper)*120);}
      previous={elbow,wrist,rotation,tip,paper};
      assert.ok(right().error<.001,`${time}: contact target remains reachable`);
      assert.ok(hand.quaternion.angleTo(avatar.rest.get(hand))<Math.PI/2,`${time}: wrist stays within the existing bend limit`);
      assert.ok(forward.angleTo(forearm)<=Math.PI/9,`${time}: sideways wrist bend ${forward.angleTo(forearm)} exceeds 20 degrees`);
      if(time>2&&time<10)assert.equal(right().engaged,true,'airborne paper remains held');
      if(frame%10===0){
        const bottles=handConvexIntersections(avatar.model,samples);
        assert.ok(bottles.triangles>2000,'both rendered hands are checked');
        assert.equal(bottles.intersections,0,`${time}: hand crosses a sample bottle or cap`);
        const skin=skinInStripFrame(avatar.model,task.strip);assert.equal(skin.intersections,0,`${time}: paper intersects a hand triangle`);
        for(const solid of solids){
          assert.equal(paperIntersectsBox(task.strip,solid),false,`${time}: paper crosses ${solid.name}`);
          const skin=skinInStripFrame(avatar.model,solid);assert.equal(skin.intersections,0,`${time}: hand crosses ${solid.name}`);
        }
      }
    }
    assert.ok(maxWristSpeed<1,`continuous wrist position: ${maxWristSpeed}`);
    assert.ok(maxElbowSpeed<1.5,`continuous elbow position: ${maxElbowSpeed}`);
    assert.ok(maxTipSpeed<1,`continuous paper position: ${maxTipSpeed}`);
    assert.ok(maxWristAngularSpeed<7,`continuous wrist rotation: ${maxWristAngularSpeed}`);
    assert.ok(maxPaperAngularSpeed<6,`continuous paper rotation: ${maxPaperAngularSpeed}`);
    for(const [bone,...pose] of sourcePose)assert.deepEqual([...bone.position.toArray(),...bone.quaternion.toArray()],pose,'source rig is unchanged');
  } finally {task.dispose();avatar.dispose();}
});
