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

test('backpedalling and strafing step along travel while the torso keeps facing the held target',()=>{
  for(const heading of [Math.PI,Math.PI/2,-Math.PI/2]) {
    const {root,model}=rig(),placement=createFootPlacement(model,root);let swings=0;
    for(let frame=0;frame<240;frame++) {
      const distance=frame/60;
      root.position.set(Math.sin(heading)*distance,0,Math.cos(heading)*distance);
      model.position.y=-.08;model.traverse(bone=>{if(bone.isBone)bone.quaternion.identity();});
      placement.update(1/60,{speed:1,distance,heading},()=>0);
      assert.ok(placement.legs.some(leg=>leg.contact),'One supporting foot remains planted');
      for(const leg of placement.legs) {
        if(!leg.contact)swings++;
        assert.ok(leg.target.distanceTo(root.localToWorld(leg.rest.clone()))<.65,'A foot must not get stranded behind the moving body');
      }
    }
    assert.ok(swings>100,'Directional motion keeps taking alternating steps');
  }
});

test('planted ankle support preserves sole clearance normal to an inclined surface at avatar scale',()=>{
  for(const slope of [-.5,.5])for(const scale of [1,1.3]) {
    const {root,model}=rig();root.scale.setScalar(scale);
    const placement=createFootPlacement(model,root);
    const normal=new THREE.Vector3(0,1,-slope).normalize();
    placement.update(1/60,{speed:0,distance:0},(_x,z)=>slope*z);
    for(const leg of placement.legs) {
      const ankle=leg.foot.getWorldPosition(new THREE.Vector3());
      const normalHeight=ankle.dot(normal);
      assert.ok(Math.abs(normalHeight-leg.rest.y*scale)<1e-6,'Slope rotation must preserve the ankle-to-sole distance along the ground normal');
      assert.ok(leg.error<1e-6);
    }
  }
});

test('standing turn steps follow the current facing without excessive knee-to-shoe twist',()=>{
  for(const hz of [30,60,120])for(const direction of [-1,1]) {
    const {root,model}=rig(),placement=createFootPlacement(model,root);
    const steps={l:0,r:0},lag={l:0,r:0};
    for(let frame=0;frame<=3*hz;frame++) {
      const before=placement.legs.map(leg=>leg.contact);
      root.rotation.y=direction*Math.min(Math.PI,Math.max(0,frame-hz*.5)/hz*Math.PI);
      model.position.y=-.08;
      model.traverse(bone=>{if(bone.isBone)bone.quaternion.identity();});
      placement.update(1/hz,{speed:0,distance:0},()=>0);
      placement.legs.forEach((leg,i)=>{
        if(before[i]&&!leg.contact)steps[leg.side]++;
        lag[leg.side]=Math.max(lag[leg.side],leg.orientation.angleTo(root.quaternion));
      });
      assert.ok(placement.legs.some(leg=>leg.contact),'turn always has a supporting foot');
    }
    assert.ok(Math.abs(steps.l-steps.r)<=1,`both feet participate: ${JSON.stringify(steps)}`);
    assert.ok(Math.max(...Object.values(lag))<1.1,`shoe facing stays within 63 degrees of the turning body: ${JSON.stringify(lag)}`);
  }
});

test('a beast lope takes fewer, longer steps over the same ground; stride 1 is the ordinary gait',()=>{
  const walk=stride=>{
    const {root,model}=rig(),placement=createFootPlacement(model,root),swinging=[false,false];
    let distance=0,started=0,planted=0;
    for(let frame=0;frame<240;frame++){
      const before=placement.legs.map(leg=>({target:leg.target?.clone(),contact:leg.contact}));
      distance+=3.2/60;root.position.z=distance;model.position.y=-0.08;
      model.traverse(bone=>{if(bone.isBone)bone.quaternion.identity();});
      placement.update(1/60,stride===undefined?{speed:3.2,distance}:{speed:3.2,distance,stride},()=>0);
      placement.legs.forEach((leg,i)=>{
        if(leg.swing&&!swinging[i])started++;
        swinging[i]=Boolean(leg.swing);
        if(before[i].contact&&leg.contact&&before[i].target){assert.ok(leg.target.distanceTo(before[i].target)<1e-10,'a planted foot stays planted');planted++;}
      });
      assert.ok(placement.legs.some(leg=>leg.contact),'a supporting foot remains');
    }
    return {started,planted,targets:placement.legs.map(leg=>leg.target.toArray())};
  };
  const ordinary=walk(undefined),lope=walk(1.35);
  assert.deepEqual(walk(1),ordinary,'stride 1 leaves the ordinary gait untouched');
  assert.ok(lope.started<ordinary.started*.85,`fewer steps: ${lope.started} vs ${ordinary.started}`);
  assert.ok(lope.planted>100);
});
