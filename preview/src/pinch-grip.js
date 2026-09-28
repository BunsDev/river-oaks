import * as THREE from 'three';
import { placePalm } from './arm-contact.js';

// Construction-time fitting to the clone's rendered skin. Arm IK subsequently
// moves this grip as a rigid hand pose; finger lengths and source assets stay intact.
export function fitPinchGrip(avatar,arm,gap=0.0012) {
  const {model}=avatar,hand=arm.foot,side=arm.side;
  model.updateWorldMatrix(true,true);
  const orientation=hand.getWorldQuaternion(new THREE.Quaternion());
  arm.oppositeShoulder=model.getObjectByName(`upperarm_${side==='r'?'l':'r'}`);
  arm.handForward=hand.worldToLocal(model.getObjectByName(`middle_01_${side}`).getWorldPosition(new THREE.Vector3())).normalize();
  arm.handAcross=hand.worldToLocal(model.getObjectByName(`pinky_01_${side}`).getWorldPosition(new THREE.Vector3()))
    .sub(hand.worldToLocal(model.getObjectByName(`index_01_${side}`).getWorldPosition(new THREE.Vector3()))).normalize();
  const frame=orientation.clone().multiply(arm.frameToHand.clone().invert());
  const normal=new THREE.Vector3(0,1,0).applyQuaternion(frame);
  let padNormal,along;
  for(const finger of ['index','middle','ring','pinky']) {
    const joints=[1,2,3].map(i=>model.getObjectByName(`${finger}_0${i}_${side}`));
    const direction=joints[1].getWorldPosition(new THREE.Vector3()).sub(joints[0].getWorldPosition(new THREE.Vector3())).normalize();
    const axis=direction.clone().cross(normal).normalize();
    const curl=finger==='index'?[0.65,0.9,0.25]:[0.25,1.6,0.6];
    for(let i=0;i<joints.length;i++) {
      const joint=joints[i],world=joint.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(axis,curl[i]));
      joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
      joint.updateWorldMatrix(false,true);
    }
    if(finger==='index') {
      const angle=curl.reduce((sum,value)=>sum+value,0);
      padNormal=normal.clone().applyAxisAngle(axis,angle);
      along=direction.clone().applyAxisAngle(axis,angle);
    }
  }
  const refs={index:[],thumb:[]};
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||! /^(young|middleage|old)_/.test(mesh.material?.name??''))return;
    const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
    for(const finger of Object.keys(refs)) {
      const index=mesh.skeleton.bones.findIndex(bone=>bone.name===`${finger}_03_${side}`);
      for(let i=0;i<position.count;i++) {
        let weight=0;for(let k=0;k<4;k++)if(skinIndex.getComponent(i,k)===index)weight+=skinWeight.getComponent(i,k);
        if(weight>=0.5)refs[finger].push({mesh,index:i});
      }
    }
  });
  const pad=(vertices,sign)=>{
    let score=-Infinity,best;
    for(const {mesh,index} of vertices) {
      const point=mesh.getVertexPosition(index,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld),value=point.dot(padNormal)*sign;
      if(value>score){score=value;best=point;}
    }return best;
  };
  const indexPad=pad(refs.index,1);
  if(!indexPad||!refs.thumb.length)throw new Error('Pinch grip requires skinned index and thumb pads');
  const target=indexPad.clone().addScaledVector(padNormal,gap);
  const thumb=[3,2,1].map(i=>model.getObjectByName(`thumb_0${i}_${side}`)),rest=thumb.map(bone=>bone.quaternion.clone());
  const identity=new THREE.Quaternion();
  // Bounded CCD opposes the thumb to the index. Each solve uses a skin pad,
  // rather than touching two joint centres through the paper.
  for(let iteration=0;iteration<100;iteration++) {
    if(pad(refs.thumb,-1).distanceTo(target)<0.00001)break;
    for(let i=0;i<thumb.length;i++) {
      const joint=thumb[i],origin=joint.getWorldPosition(new THREE.Vector3());
      const from=pad(refs.thumb,-1).sub(origin).normalize(),to=target.clone().sub(origin).normalize();
      const turn=new THREE.Quaternion().setFromUnitVectors(from,to),angle=turn.angleTo(identity);
      if(angle>0.12)turn.slerp(identity,1-0.12/angle);
      const local=joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(joint.getWorldQuaternion(new THREE.Quaternion()).premultiply(turn));
      const change=rest[i].angleTo(local),limit=[1.1,1.5,1.4][i];
      joint.quaternion.copy(change>limit?rest[i].clone().slerp(local,limit/change):local);
      joint.updateWorldMatrix(false,true);
    }
  }
  const centre=indexPad.clone().addScaledVector(padNormal,gap/2),wrist=hand.getWorldPosition(new THREE.Vector3());
  along.addScaledVector(padNormal,-along.dot(padNormal)).normalize();
  // A narrow strip exits the side of the fingertip pinch, away from the curled
  // index knuckle; its length is perpendicular to the finger's distal axis.
  along.crossVectors(padNormal,along).normalize();
  const across=new THREE.Vector3().crossVectors(padNormal,along).normalize();
  const pinchFrame=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(across,padNormal,along));
  arm.frameToHand.copy(pinchFrame).invert().multiply(orientation);
  arm.palmOffset.copy(centre).sub(wrist).applyQuaternion(orientation.clone().invert());
  arm.grip.identity();
}

// The free end of a light strip follows the hand. Relax the authored paper
// angle toward the forearm instead of forcing a sideways wrist bend to hold it.
// Keep the presentation hand near neutral (about five degrees); the paper is
// light and free to turn, so its authored angle must not dictate a bent wrist.
export function placePinch(arm,point,frame,pole,maxBend=0.08) {
  let actual;
  for(let iteration=0;iteration<8;iteration++) {
    actual=placePalm(arm,point,frame,pole);
    const bend=arm.foot.quaternion.angleTo(arm.wristRest);
    if(bend<=maxBend+0.005)break;
    const local=arm.wristRest.clone().slerp(arm.foot.quaternion,maxBend/bend);
    frame.copy(arm.calf.getWorldQuaternion(new THREE.Quaternion())).multiply(local).multiply(arm.frameToHand.clone().invert());
  }
  frame.copy(arm.foot.getWorldQuaternion(new THREE.Quaternion())).multiply(arm.frameToHand.clone().invert());
  return actual;
}

// A supported paper fixes the hand frame. Choose an elbow on the real two-bone
// reach circle whose forearm lies in the palm's flexion plane, so positioning
// the paper does not force lateral wrist deviation. Keep the outward anatomical
// branch; choosing whichever is nearest a moving pole can jump across the body.
export function pinchElbowPole(arm,point,frame,fallback) {
  const orientation=frame.clone().multiply(arm.frameToHand);
  const wrist=point.clone().sub(arm.palmOffset.clone().applyQuaternion(orientation));
  const shoulder=arm.thigh.getWorldPosition(new THREE.Vector3());
  const axis=wrist.clone().sub(shoulder),distance=axis.length();
  if(distance<1e-6)return fallback;
  axis.divideScalar(distance);
  const along=(arm.upperLength**2-arm.lowerLength**2+distance**2)/(2*distance);
  const radius=Math.sqrt(Math.max(0,arm.upperLength**2-along**2));
  if(radius<1e-6)return fallback;
  const centre=shoulder.addScaledVector(axis,along);
  const forward=arm.handForward.clone().applyQuaternion(orientation);
  const normal=new THREE.Vector3().crossVectors(forward,arm.handAcross.clone().applyQuaternion(orientation)).normalize();
  const lateral=new THREE.Vector3().crossVectors(normal,forward).normalize();
  const u=lateral.clone().addScaledVector(axis,-lateral.dot(axis)),projection=u.length();
  if(projection<1e-6)return fallback;
  u.divideScalar(projection);
  const v=new THREE.Vector3().crossVectors(axis,u);
  // A small angular margin avoids the square-root velocity spike where the
  // circle is tangent to the palm plane. Wrist deviation remains bounded.
  const cosine=THREE.MathUtils.clamp(-centre.clone().sub(wrist).dot(lateral)/(radius*projection),-.98,.98);
  const sine=Math.sqrt(Math.max(0,1-cosine*cosine));
  const a=centre.clone().addScaledVector(u,radius*cosine).addScaledVector(v,radius*sine);
  const b=centre.clone().addScaledVector(u,radius*cosine).addScaledVector(v,-radius*sine);
  const outward=arm.thigh.getWorldPosition(new THREE.Vector3()).sub(arm.oppositeShoulder.getWorldPosition(new THREE.Vector3()));
  return a.clone().sub(b).dot(outward)>=0?a:b;
}
