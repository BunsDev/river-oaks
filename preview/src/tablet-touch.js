import * as THREE from 'three';

const smooth=value=>{const t=Math.max(0,Math.min(1,value));return t*t*t*(t*(t*6-15)+10);};

// Point with the index and fold the other fingers toward the palm. Measured
// axes keep the pose independent of each source rig's joint orientations.
export function fitTabletTouch(avatar,arm) {
  const {model}=avatar,hand=arm.foot;
  model.updateWorldMatrix(true,true);
  const handWorld=hand.getWorldQuaternion(new THREE.Quaternion());
  const palmFrame=handWorld.clone().multiply(arm.frameToHand.clone().invert());
  const normal=new THREE.Vector3(0,1,0).applyQuaternion(palmFrame);
  for(const finger of ['index','middle','ring','pinky']) {
    const root=model.getObjectByName(`${finger}_01_${arm.side}`),second=model.getObjectByName(`${finger}_02_${arm.side}`);
    const axis=second.getWorldPosition(new THREE.Vector3()).sub(root.getWorldPosition(new THREE.Vector3())).cross(normal).normalize();
    const curl=finger==='index'?[0.65,0.3,0]:[0.25,1.6,0.6];
    for(let i=1;i<=3;i++) {
      const joint=model.getObjectByName(`${finger}_0${i}_${arm.side}`);
      const world=joint.getWorldQuaternion(new THREE.Quaternion()).premultiply(new THREE.Quaternion().setFromAxisAngle(axis,curl[i-1]));
      joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));joint.updateWorldMatrix(false,true);
    }
  }
  arm.grip.setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(10),THREE.MathUtils.degToRad(37.5),Math.PI,'YXZ'));
  const inverseHand=new THREE.Matrix4().copy(hand.matrixWorld).invert(),desired=arm.grip.clone().multiply(arm.frameToHand);
  const point=new THREE.Vector3(),local=new THREE.Vector3(),scale=hand.getWorldScale(new THREE.Vector3());let lowest=Infinity,pad=null;
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||! /^(young|middleage|old)_/.test(mesh.material?.name??''))return;
    mesh.skeleton.update();const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
    const index=mesh.skeleton.bones.findIndex(bone=>bone.name===`index_03_${arm.side}`);
    for(let i=0;i<position.count;i++){
      let weight=0;for(let k=0;k<4;k++)if(skinIndex.getComponent(i,k)===index)weight+=skinWeight.getComponent(i,k);
      if(weight<0.5)continue;
      point.fromBufferAttribute(position,i);mesh.applyBoneTransform(i,point).applyMatrix4(mesh.matrixWorld).applyMatrix4(inverseHand);
      // palmOffset is in world-length units in the hand's rotation frame.
      local.copy(point).multiply(scale).applyQuaternion(desired);
      if(local.y<lowest){lowest=local.y;pad=point.clone().multiply(scale);}
    }
  });
  if(pad)arm.palmOffset.copy(pad);
}

export function tabletTouchPoint(time) {
  const phase=((time%6)+6)%6;
  // Two deliberate taps, with lateral travel only while the finger is lifted.
  const reach=smooth((phase-0.5)/0.6)*(1-smooth((phase-1.6)/0.6))+
    smooth((phase-3.3)/0.6)*(1-smooth((phase-4.4)/0.6));
  const row=smooth((phase-2.2)/0.8)*(1-smooth((phase-5)/0.8));
  return new THREE.Vector3(-0.025,0.022+0.035*(1-reach),-0.055+row*0.09);
}
