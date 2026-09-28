import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar, AVATAR_PROFILES} from '../src/avatars.js';
import {createFootPlacement} from '../src/foot-placement.js';
import {createUpperBodyGait} from '../src/upper-body-gait.js';

const position=(avatar,name)=>avatar.model.getObjectByName(name).getWorldPosition(new THREE.Vector3());
const reset=avatar=>{for(const [bone,rest]of avatar.rest)bone.quaternion.copy(rest);};

test('casting eases walking arm swing out while preserving planted feet, then restores it on release',async()=>{
  const source=await loadCharacterRig('jevica'),ranges=[];
  for(const casting of [false,true]) {
    const avatar=instantiateAvatar(source,{targetHeight:1.7}),root=new THREE.Group();root.add(avatar.model);
    const feet=createFootPlacement(avatar.model,root),motion=createUpperBodyGait(avatar,root);
    const arm=avatar.model.getObjectByName('upperarm_l');let maximum=0,previous=null;
    for(let frame=0;frame<300;frame++) {
      reset(avatar);root.position.z=frame/60;
      feet.update(1/60,{speed:1,distance:frame/60},()=>0);
      const contacts=feet.legs.map(l=>l.foot.getWorldPosition(new THREE.Vector3()));
      motion.update(1/60,1,feet.legs,{casting:casting&&frame<180});
      feet.legs.forEach((l,i)=>assert.ok(l.foot.getWorldPosition(new THREE.Vector3()).distanceTo(contacts[i])<1e-7));
      if(previous)assert.ok(previous.angleTo(arm.quaternion)<.08,'Casting transitions never snap the shoulder');
      previous=arm.quaternion.clone();
      if(frame>60&&frame<180)maximum=Math.max(maximum,arm.quaternion.angleTo(avatar.rest.get(arm)));
      if(frame===299)assert.ok(arm.quaternion.angleTo(avatar.rest.get(arm))>.005,'Ordinary walking swing returns');
    }
    ranges.push(maximum);motion.dispose();avatar.dispose();
  }
  assert.ok(ranges[1]<ranges[0]*.2,'The casting arm holds its aim instead of swinging through each step');
});

test('walking flexes the elbows and lets wrists follow through, then settles at rest across all rigs and frame rates',async()=>{
  for(const profile of [...AVATAR_PROFILES,'jevica']) {
    const source=await loadCharacterRig(profile);
    for(const hz of [30,60,120]) {
      const avatar=instantiateAvatar(source,{targetHeight:1.7}),root=new THREE.Group();root.add(avatar.model);
      const feet=createFootPlacement(avatar.model,root),motion=createUpperBodyGait(avatar,root),baseY=avatar.model.position.y;
      const ranges=Object.fromEntries(['lowerarm_l','lowerarm_r','hand_l','hand_r'].map(name=>[name,{min:Infinity,max:-Infinity,previous:null,maxSpeed:0}]));
      let elbowMin=Infinity,elbowMax=-Infinity;
      const elbow=side=>{const shoulder=position(avatar,`upperarm_${side}`),joint=position(avatar,`lowerarm_${side}`),hand=position(avatar,`hand_${side}`);return 180-shoulder.sub(joint).angleTo(hand.sub(joint))*180/Math.PI;};
      let distance=0;
      for(let frame=0;frame<=5*hz;frame++) {
        const speed=frame<3*hz?1.1:0;distance+=speed/hz;
        reset(avatar);avatar.model.position.y=baseY-.018;root.position.z=distance;
        feet.update(1/hz,{speed,distance},()=>0);motion.update(1/hz,speed,feet.legs);
        if(frame>hz&&frame<3*hz){avatar.model.updateMatrixWorld(true);for(const side of ['l','r']){const angle=elbow(side);elbowMin=Math.min(elbowMin,angle);elbowMax=Math.max(elbowMax,angle);}}
        for(const [name,r]of Object.entries(ranges)) {
          const bone=avatar.model.getObjectByName(name),q=avatar.rest.get(bone).clone().invert().multiply(bone.quaternion);
          const flex=2*Math.atan2(new THREE.Vector3(q.x,q.y,q.z).dot(avatar.axes.get(bone).x),q.w);
          if(r.previous)r.maxSpeed=Math.max(r.maxSpeed,r.previous.angleTo(bone.quaternion)*hz);
          r.previous=bone.quaternion.clone();
          if(frame>hz&&frame<3*hz){r.min=Math.min(r.min,flex);r.max=Math.max(r.max,flex);}
          if(frame===5*hz)assert.ok(q.angleTo(new THREE.Quaternion())<.001,`${profile}: ${name} settles after stopping`);
        }
      }
      for(const [name,r]of Object.entries(ranges)) {
        assert.ok(r.maxSpeed<2,`${profile}/${hz}: ${name} changes without snapping: ${r.maxSpeed}`);
        if(name.startsWith('lowerarm')) {
          // Anatomical flexion, not deviation from the bent rest pose: walking elbows
          // stay softly bent and never straighten past the joint or clench.
          assert.ok(elbowMin>15&&elbowMax<60,`${profile}/${hz}: elbows stay softly bent while walking: ${elbowMin.toFixed(1)}..${elbowMax.toFixed(1)}°`);
          assert.ok(r.max-r.min>.04,`${profile}/${hz}: elbows articulate throughout the stride`);
        }else assert.ok(r.max-r.min>.008&&Math.max(Math.abs(r.min),Math.abs(r.max))<.06,`${profile}/${hz}: subtle wrist follow-through`);
      }
      motion.dispose();avatar.dispose();
    }
  }
});

test('rendered arms oppose the legs under a transformed parent while feet and gaze remain stable',async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig('woman-casual'),{targetHeight:1.66}),root=new THREE.Group();root.add(avatar.model);
  const feet=createFootPlacement(avatar.model,root),motion=createUpperBodyGait(avatar,root),baseY=avatar.model.position.y;
  root.rotation.y=.8;root.scale.setScalar(1.2);
  const forward=new THREE.Vector3(Math.sin(.8),0,Math.cos(.8));let cross=0,arms=0,legs=0;
  for(let frame=0;frame<=480;frame++) {
    const distance=Math.min(frame,360)*1.1/120,speed=frame<360?1.1:0;
    root.position.copy(forward).multiplyScalar(distance).add(new THREE.Vector3(40,0,-30));
    reset(avatar);avatar.model.position.y=baseY-.018;
    feet.update(1/120,{speed,distance},()=>0);
    const before=feet.legs.map(l=>l.foot.getWorldPosition(new THREE.Vector3()));
    const head=avatar.model.getObjectByName('head'),gaze=head.getWorldQuaternion(new THREE.Quaternion());
    motion.update(1/120,speed,feet.legs);root.updateMatrixWorld(true);
    feet.legs.forEach((l,i)=>assert.ok(l.foot.getWorldPosition(new THREE.Vector3()).distanceTo(before[i])<1e-7,'Upper-body gait must preserve planted feet'));
    assert.ok(head.getWorldQuaternion(new THREE.Quaternion()).angleTo(gaze)<1e-6,'Chest movement must not turn the gaze');
    if(frame>90&&frame<360) {
      const arm=side=>position(avatar,`lowerarm_${side}`).sub(position(avatar,`upperarm_${side}`)).normalize().dot(forward);
      const leg=side=>position(avatar,`foot_${side}`).sub(position(avatar,`thigh_${side}`)).dot(forward);
      const a=arm('l')-arm('r'),l=leg('l')-leg('r');cross+=a*l;arms+=a*a;legs+=l*l;
    }
  }
  assert.ok(cross/Math.sqrt(arms*legs)<-.8,'Opposite-side arm and leg motion stays coordinated');
  for(const name of ['upperarm_l','upperarm_r','spine_01','neck_01']) {
    const bone=avatar.model.getObjectByName(name);assert.ok(bone.quaternion.angleTo(avatar.rest.get(bone))<.001,'Stop returns to the authored rest pose');
  }
  avatar.dispose();
});

test('suspension retains the displayed swing and reduced motion suppresses secondary gait',async()=>{
  const source=await loadCharacterRig('woman-casual');
  for(const reducedMotion of [false,true]) {
    const avatar=instantiateAvatar(source,{targetHeight:1.66}),root=new THREE.Group();root.add(avatar.model);
    const feet=createFootPlacement(avatar.model,root),motion=createUpperBodyGait(avatar,root,{reducedMotion}),baseY=avatar.model.position.y;
    for(let frame=0;frame<36;frame++) {
      reset(avatar);avatar.model.position.y=baseY-.018;root.position.z=frame*1.1/60;
      feet.update(1/60,{speed:1.1,distance:root.position.z},()=>0);motion.update(1/60,1.1,feet.legs);
    }
    const arms=avatar.bones.filter(b=>/^(upperarm|lowerarm|hand)_/.test(b.name)),before=arms.map(b=>b.quaternion.clone());
    if(reducedMotion)arms.forEach((b,i)=>assert.deepEqual(before[i].toArray(),avatar.rest.get(b).toArray()));
    else assert.ok(before[0].angleTo(avatar.rest.get(arms[0]))>.01,'Exercise a visible swing before suspending');
    for(let held=0;held<8;held++) {
      reset(avatar);motion.update(0,0,feet.legs,{flying:true,carrying:true});
      arms.forEach((b,i)=>assert.deepEqual(b.quaternion.toArray(),before[i].toArray(),'Repeated zero-delta frames retain the complete displayed pose'));
    }
    for(let frame=0;frame<90;frame++){reset(avatar);motion.update(1/60,0,feet.legs,{flying:true});}
    arms.forEach(b=>assert.ok(b.quaternion.angleTo(avatar.rest.get(b))<.001,'Flight releases walking motion'));
    motion.dispose();avatar.dispose();
  }
});

test('carrying eases down the loaded arm swing without suppressing the free arm',async()=>{
  const avatar=instantiateAvatar(await loadCharacterRig('man-workwear'),{targetHeight:1.8}),root=new THREE.Group();root.add(avatar.model);
  const feet=createFootPlacement(avatar.model,root),motion=createUpperBodyGait(avatar,root),baseY=avatar.model.position.y;
  const ranges=Object.fromEntries(['upperarm','lowerarm','hand'].map(part=>[part,{left:0,right:0,maxChange:0,previous:null}]));
  for(let frame=0;frame<240;frame++) {
    reset(avatar);avatar.model.position.y=baseY-.018;root.position.z=frame*1.1/60;
    feet.update(1/60,{speed:1.1,distance:root.position.z},()=>0);motion.update(1/60,1.1,feet.legs,{carrying:frame>=60});
    for(const [part,result]of Object.entries(ranges)) {
      const l=avatar.model.getObjectByName(`${part}_l`),r=avatar.model.getObjectByName(`${part}_r`);
      if(result.previous)result.maxChange=Math.max(result.maxChange,r.quaternion.angleTo(result.previous));result.previous=r.quaternion.clone();
      // Swing amplitude within the stride, not the constant walking posture offset.
      if(frame===120){result.leftReference=l.quaternion.clone();result.rightReference=r.quaternion.clone();}
      if(frame>120){result.left=Math.max(result.left,l.quaternion.angleTo(result.leftReference));result.right=Math.max(result.right,r.quaternion.angleTo(result.rightReference));}
    }
  }
  for(const [part,{left,right,maxChange}]of Object.entries(ranges)) {
    assert.ok(left>(part==="hand"?.008:part==="lowerarm"?.06:.1)&&right<left*.4,`${part}: the carried side moves less than the free side (${left.toFixed(3)} vs ${right.toFixed(3)})`);
    assert.ok(maxChange<.1,'Picking up a load must not snap the arm');
  }
  motion.dispose();avatar.dispose();
});

test('standing turn counterbalance follows the support leg without moving planted feet or turning the gaze',async()=>{
  for(const mode of ['ordinary','reduced','flying']) {
  const avatar=instantiateAvatar(await loadCharacterRig('woman-casual'),{targetHeight:1.66}),root=new THREE.Group();root.add(avatar.model);
  const feet=createFootPlacement(avatar.model,root),motion=createUpperBodyGait(avatar,root,{reducedMotion:mode==='reduced'}),baseY=avatar.model.position.y;
  root.position.set(12,0,-7);root.scale.setScalar(1.2);
  const chest=avatar.model.getObjectByName('spine_03'),head=avatar.model.getObjectByName('head');
  let towards=0,samples=0,maxShift=0;
  for(let frame=0;frame<240;frame++) {
    root.rotation.y=.6+Math.min(Math.PI,Math.max(0,frame-30)/60*Math.PI);
    reset(avatar);avatar.model.position.y=baseY-.018;
    feet.update(1/60,{speed:0,distance:0},()=>0);
    const planted=feet.legs.map(l=>l.foot.getWorldPosition(new THREE.Vector3())),before=chest.getWorldPosition(new THREE.Vector3()),gaze=head.getWorldQuaternion(new THREE.Quaternion());
    const swing=feet.legs.find(l=>l.swing?.turning),support=feet.legs.find(l=>l.contact),right=new THREE.Vector3(1,0,0).applyQuaternion(root.quaternion);
    const pelvis=feet.legs.reduce((p,l)=>p.add(l.thigh.getWorldPosition(new THREE.Vector3())),new THREE.Vector3()).multiplyScalar(.5);
    motion.update(1/60,0,feet.legs,{flying:mode==='flying'});root.updateMatrixWorld(true);
    const shift=chest.getWorldPosition(new THREE.Vector3()).sub(before);maxShift=Math.max(maxShift,shift.length());
    if(swing&&support&&swing.swing.progress>.35&&swing.swing.progress<.75) {
      towards+=shift.dot(right)*Math.sign(support.foot.getWorldPosition(new THREE.Vector3()).sub(pelvis).dot(right));samples++;
    }
    feet.legs.forEach((l,i)=>assert.ok(l.foot.getWorldPosition(new THREE.Vector3()).distanceTo(planted[i])<1e-7,'Counterbalance must preserve foot support'));
    assert.ok(head.getWorldQuaternion(new THREE.Quaternion()).normalize().angleTo(gaze.normalize())<1e-5,`Counterbalance must preserve gaze orientation at ${frame}: ${head.getWorldQuaternion(new THREE.Quaternion()).angleTo(gaze)}`);
  }
  assert.ok(samples>15,'Exercise several standing support transfers');
  if(mode==='ordinary')assert.ok(towards/samples>.003,`Chest moves toward support during mid-step: ${towards/samples}`);
  else assert.ok(maxShift<1e-7,'Reduced motion and flight suppress counterbalance');
  assert.ok(maxShift<.035,'Counterbalance stays subtle');
  for(const name of ['spine_01','neck_01']) {const bone=avatar.model.getObjectByName(name);assert.ok(bone.quaternion.angleTo(avatar.rest.get(bone))<.001,'Settles back to neutral');}
  avatar.dispose();
  }
});
