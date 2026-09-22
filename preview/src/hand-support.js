import * as THREE from 'three';

const fingers=['thumb','index','middle','ring','pinky'];

// Flat loads need extended fingers, not the imported relaxed curl. Work in the
// measured palm frame: these rigs do not share a conventional local bend axis.
// This pose belongs to the instance and follows its hand throughout arm IK.
export function fitSupportedHand(avatar,arm,{halfWidth,halfDepth,palmX,palmZ,yaw=0}) {
  const {model}=avatar,hand=arm.foot;
  model.updateWorldMatrix(true,true);
  const orientation=hand.getWorldQuaternion(new THREE.Quaternion());
  const frame=orientation.clone().multiply(arm.frameToHand.clone().invert());
  const normal=new THREE.Vector3(0,1,0).applyQuaternion(frame);
  for(const finger of fingers) {
    const joints=[1,2,3].map(i=>model.getObjectByName(`${finger}_0${i}_${arm.side}`));
    if(joints.some(joint=>!joint))continue;
    // The distal joint has no child. Continue its preceding segment as the
    // reference direction so its fingertip pad straightens with the chain.
    const terminal=joints[2].getWorldPosition(new THREE.Vector3()).sub(joints[1].getWorldPosition(new THREE.Vector3())).normalize()
      .applyQuaternion(joints[2].getWorldQuaternion(new THREE.Quaternion()).invert());
    for(let i=0;i<joints.length;i++) {
      const joint=joints[i],world=joint.getWorldQuaternion(new THREE.Quaternion());
      const direction=i<2?joints[i+1].getWorldPosition(new THREE.Vector3()).sub(joint.getWorldPosition(new THREE.Vector3())).normalize():terminal.clone().applyQuaternion(world);
      const flat=direction.clone().addScaledVector(normal,-direction.dot(normal)).normalize();
      world.premultiply(new THREE.Quaternion().setFromUnitVectors(direction,flat));
      joint.quaternion.copy(joint.parent.getWorldQuaternion(new THREE.Quaternion()).invert().multiply(world));
      joint.updateWorldMatrix(false,true);
    }
  }
  // Calibrate to actual skinned pads rather than putting the bone centre on the
  // underside of the load. This runs only at construction, never per frame.
  model.updateMatrixWorld(true);
  const palm=hand.getWorldPosition(new THREE.Vector3()).add(arm.palmOffset.clone().applyQuaternion(orientation));
  const inverseFrame=frame.clone().invert(),surfaceTurn=new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0,1,0),yaw),vertex=new THREE.Vector3();let top=-Infinity;
  model.traverse(mesh=>{
    if(!mesh.isSkinnedMesh||! /^(young|middleage|old)_/.test(mesh.material?.name??''))return;
    mesh.skeleton.update();
    const names=new Set([`hand_${arm.side}`,...fingers.flatMap(finger=>[1,2,3].map(i=>`${finger}_0${i}_${arm.side}`))]);
    const indices=new Set(mesh.skeleton.bones.flatMap((bone,i)=>names.has(bone.name)?[i]:[]));
    const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
    for(let i=0;i<position.count;i++) {
      let weight=0;for(let k=0;k<4;k++)if(indices.has(skinIndex.getComponent(i,k)))weight+=skinWeight.getComponent(i,k);
      if(weight<0.5)continue;
      vertex.fromBufferAttribute(position,i);mesh.applyBoneTransform(i,vertex).applyMatrix4(mesh.matrixWorld).sub(palm);
      vertex.applyQuaternion(inverseFrame).applyQuaternion(surfaceTurn);
      if(Math.abs(vertex.x+palmX)>halfWidth||Math.abs(vertex.z+palmZ)>halfDepth)continue;
      top=Math.max(top,vertex.y);
    }
  });
  if(Number.isFinite(top))arm.palmOffset.addScaledVector(normal.applyQuaternion(orientation.clone().invert()),top+0.0005);
}
