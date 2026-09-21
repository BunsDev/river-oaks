import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { solveLeg, applyLegIK, createFootPlacement } from '../src/foot-placement.js';

function rig() {
  const root = new THREE.Group(), model = new THREE.Group(); root.add(model);
  for (const [side,x] of [['l',-0.1],['r',0.1]]) {
    const thigh = new THREE.Bone(), calf = new THREE.Bone(), foot = new THREE.Bone();
    thigh.name=`thigh_${side}`;calf.name=`calf_${side}`;foot.name=`foot_${side}`;
    thigh.position.set(x,0.88,0);calf.position.y=-0.4;foot.position.y=-0.4;
    model.add(thigh);thigh.add(calf);calf.add(foot);
  }
  root.updateMatrixWorld(true);
  return {root,model};
}
test('two-bone IK reaches the target while preserving both segment lengths and forward knees', () => {
  const hip = new THREE.Vector3(0,0.9,0), pole = new THREE.Vector3(0,0.9,1);
  for (const target of [new THREE.Vector3(0,0.15,0.2),new THREE.Vector3(0,0.2,-0.2),new THREE.Vector3(0.12,0.15,0)]) {
    const solution=solveLeg(hip,target,pole,0.4,0.4);
    assert.ok(Math.abs(solution.knee.distanceTo(hip)-0.4)<1e-8);
    assert.ok(Math.abs(solution.knee.distanceTo(solution.ankle)-0.4)<1e-8);
    assert.ok(solution.ankle.distanceTo(target)<1e-8);
    assert.ok(solution.knee.z>Math.min(0,target.z));
  }
  const unreachable=solveLeg(hip,new THREE.Vector3(0,-1,0),pole,0.4,0.4);
  assert.ok(unreachable.ankle.distanceTo(hip)<0.8);
});
test('IK operates in world space under translated, rotated and scaled parents', () => {
  const {root,model}=rig();root.position.set(30,2,-12);root.rotation.y=1.2;root.scale.setScalar(1.1);root.updateMatrixWorld(true);
  const thigh=model.getObjectByName('thigh_l'),calf=model.getObjectByName('calf_l'),foot=model.getObjectByName('foot_l');
  const target=foot.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0.1,0.06,-0.1));
  const pole=thigh.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(1,0,0));
  assert.ok(applyLegIK({thigh,calf,foot,upperLength:0.44,lowerLength:0.44},target,pole)<1e-8);
  assert.ok(foot.getWorldPosition(new THREE.Vector3()).distanceTo(target)<1e-8);
});
test('stance targets remain planted as the body advances and both feet settle after stopping', () => {
  const {root,model}=rig(), placement=createFootPlacement(model,root);
  model.position.y=-0.08;
  let distance=0, planted=0, swings=0;
  for(let frame=0;frame<300;frame++) {
    const before=placement.legs.map(leg=>({target:leg.target?.clone(),contact:leg.contact}));
    distance+=1.1/60;root.position.z=distance;
    // Reset pose as the animation loop does before solving the legs.
    model.position.y=-0.08;
    model.traverse(bone=>{if(bone.isBone) bone.quaternion.identity();});
    placement.update(1/60,{speed:1.1,distance},()=>0);
    assert.ok(placement.legs.some(leg=>leg.contact), 'Walking must always retain a supporting foot');
    placement.legs.forEach((leg,i)=>{
      if(before[i].contact && leg.contact && before[i].target) {assert.ok(leg.target.distanceTo(before[i].target)<1e-10);planted++;}
      if(!leg.contact) swings++;
    });
  }
  assert.ok(planted>100 && swings>100);
  for(let frame=0;frame<90;frame++) {
    model.position.y=-0.08;
    model.traverse(bone=>{if(bone.isBone) bone.quaternion.identity();});
    placement.update(1/60,{speed:0,distance},()=>0);
  }
  for(const leg of placement.legs) {
    assert.equal(leg.contact,true);
    assert.ok(leg.target.distanceTo(root.localToWorld(leg.rest.clone()))<=0.09, 'Resting feet should finish within the natural stance tolerance');
  }
});
