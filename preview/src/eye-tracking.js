import * as THREE from 'three';

// These MakeHuman eye surfaces are partial globes weighted entirely to the
// head. Fit a pivot at the widest ring, rather than the center of the cap's box.
function eyeCenter(position,indices) {
 const extremes=[null,null,null,null];
 for(const i of indices){
  for(let axis=0;axis<2;axis++)for(let end=0;end<2;end++){
   const slot=axis*2+end,previous=extremes[slot];
   if(previous===null||(end?position.getComponent(i,axis)>position.getComponent(previous,axis):position.getComponent(i,axis)<position.getComponent(previous,axis)))extremes[slot]=i;
  }
 }
 return new THREE.Vector3((position.getX(extremes[0])+position.getX(extremes[1]))/2,(position.getY(extremes[2])+position.getY(extremes[3]))/2,extremes.reduce((z,i)=>z+position.getZ(i),0)/4);
}

export function createEyeTracking(model) {
 const bindings=[],geometries=[],skeletons=[];
 model.traverse(mesh=>{
  if(!mesh.isSkinnedMesh||!/^brown(?:\.\d+)?$/.test(mesh.material?.name??''))return;
  const headIndex=mesh.skeleton.bones.findIndex(b=>b.name==='head');if(headIndex<0)return;
  const {position,skinIndex,skinWeight}=mesh.geometry.attributes;
  // Do not silently replace an unfamiliar facial rig's authored deformation.
  for(let i=0;i<position.count;i++)for(let slot=0;slot<4;slot++)if(skinWeight.getComponent(i,slot)>0&&skinIndex.getComponent(i,slot)!==headIndex)return;
  const sides=[[],[]];for(let i=0;i<position.count;i++)sides[position.getX(i)<0?0:1].push(i);
  if(sides.some(indices=>!indices.length))return;
  const head=mesh.skeleton.bones[headIndex],headInverse=mesh.skeleton.boneInverses[headIndex],bones=[],inverses=[];
  const geometry=mesh.geometry.clone();geometries.push(geometry);mesh.geometry=geometry;
  for(const [side,indices] of sides.entries()){
   const bone=new THREE.Bone();bone.name=side?'gaze_eye_l':'gaze_eye_r';
   bone.position.copy(eyeCenter(position,indices)).applyMatrix4(mesh.bindMatrix).applyMatrix4(headInverse);
   bone.quaternion.setFromRotationMatrix(new THREE.Matrix4().extractRotation(headInverse));
   head.add(bone);bone.updateMatrix();
   const rest=bone.quaternion.clone(),restMatrix=bone.matrix.clone();
   bones.push(bone);inverses.push(restMatrix.clone().invert().multiply(headInverse));
   bindings.push({bone,head,rest,restMatrix,yaw:0,pitch:0,yawVelocity:0,pitchVelocity:0});
   for(const i of indices){geometry.attributes.skinIndex.setXYZW(i,side,0,0,0);geometry.attributes.skinWeight.setXYZW(i,1,0,0,0);}
  }
  const skeleton=new THREE.Skeleton(bones,inverses);skeletons.push(skeleton);mesh.bind(skeleton,mesh.bindMatrix.clone());
 });
 const matrix=new THREE.Matrix4(),rotation=new THREE.Quaternion(),offset=new THREE.Vector3(),origin=new THREE.Vector3(),euler=new THREE.Euler(0,0,0,'YXZ');
 return {
  get pose(){return bindings.map(({bone,yaw,pitch})=>({name:bone.name,yaw,pitch}));},
  update(target,delta) {
   if(!Number.isFinite(delta)||delta<=0||delta>.25)return;
   const dt=Math.min(.08,delta),frequency=24,decay=Math.exp(-frequency*dt),valid=target?.length===3&&target.every(Number.isFinite);
   for(const binding of bindings){
    const {head,bone,rest,restMatrix}=binding;head.updateWorldMatrix(true,false);
    matrix.multiplyMatrices(head.matrixWorld,restMatrix);origin.setFromMatrixPosition(matrix);
    rotation.setFromRotationMatrix(matrix.extractRotation(matrix)).invert();
    let yaw=0,pitch=0;
    if(valid){
     offset.fromArray(target).sub(origin).applyQuaternion(rotation);
     if(offset.z>0&&offset.lengthSq()>.0625){
      yaw=THREE.MathUtils.clamp(Math.atan2(offset.x,offset.z),-.3,.3);
      pitch=THREE.MathUtils.clamp(-Math.atan2(offset.y,Math.hypot(offset.x,offset.z)),-.18,.18);
     }
    }
    for(const [axis,goal] of [['yaw',yaw],['pitch',pitch]]){
     const key=`${axis}Velocity`,difference=binding[axis]-goal,c=binding[key]+frequency*difference;
     binding[axis]=goal+(difference+c*dt)*decay;binding[key]=(binding[key]-frequency*c*dt)*decay;
    }
    bone.quaternion.copy(rest).multiply(rotation.setFromEuler(euler.set(binding.pitch,binding.yaw,0)));
   }
  },
  dispose(){for(const binding of bindings)binding.bone.removeFromParent();for(const geometry of geometries)geometry.dispose();for(const skeleton of skeletons)skeleton.dispose();},
 };
}
