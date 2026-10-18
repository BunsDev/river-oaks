import * as THREE from 'three';

// Original fitted linen layer derived from the shipped CC0 Jevica surface.
// Keep its exact leg weights so the hips, knees and cuffs bend continuously.
export function createSilvanTrousers(body,model,material){
  if(!body?.isSkinnedMesh)throw new TypeError('Silvan trousers require the shipped skinned body');
  model.updateWorldMatrix(true,true);model.updateMatrixWorld(true);
  const pelvis=model.getObjectByName('pelvis'),frame=new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3()));
  const toFrame=frame.clone().invert().multiply(body.matrixWorld),normalToFrame=new THREE.Matrix3().getNormalMatrix(toFrame),fromFrame=toFrame.clone().invert();
  const source=body.geometry,rest=Array.from({length:source.attributes.position.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(source.attributes.position,i).applyMatrix4(toFrame));
  const indices=[],vertices=new Map(),attributes=Object.fromEntries(['position','normal','uv','skinIndex','skinWeight'].map(name=>[name,[]]));
  const leg=i=>{let weight=0;for(let c=0;c<4;c++)if(/^(pelvis|thigh_[lr]|calf_[lr])$/.test(body.skeleton.bones[source.attributes.skinIndex.getComponent(i,c)].name))weight+=source.attributes.skinWeight.getComponent(i,c);return weight>.5;};
  for(let n=0;n<source.index.count;n+=3){
    const ids=[0,1,2].map(c=>source.index.getX(n+c));
    if(!ids.every(i=>rest[i].y<.09&&rest[i].y>-.53&&leg(i)))continue;
    for(const i of ids){
      if(!vertices.has(i)){
        vertices.set(i,vertices.size);
        const normal=new THREE.Vector3().fromBufferAttribute(source.attributes.normal,i).applyNormalMatrix(normalToFrame);
        // Fit closely beneath the outer drape, with extra room at the knee.
        // The lower cuff overlaps the tall boot through the walking stride.
        const ease=.003+.009*THREE.MathUtils.smoothstep(-rest[i].y,.04,.3);
        const point=rest[i].clone().addScaledVector(normal,ease).applyMatrix4(fromFrame);attributes.position.push(...point.toArray());
        for(const name of ['normal','uv','skinIndex','skinWeight'])for(let c=0;c<source.attributes[name].itemSize;c++)attributes[name].push(source.attributes[name].getComponent(i,c));
      }
      indices.push(vertices.get(i));
    }
  }
  if(!indices.length)throw new TypeError('Silvan trousers require compatible lower-body geometry');
  const geometry=new THREE.BufferGeometry();geometry.setIndex(indices);
  for(const [name,array]of Object.entries(attributes))geometry.setAttribute(name,name==='skinIndex'?new THREE.Uint16BufferAttribute(array,4):new THREE.Float32BufferAttribute(array,source.attributes[name].itemSize));
  const mesh=new THREE.SkinnedMesh(geometry,material);mesh.name='Forest aristocrat linen trousers';
  mesh.position.copy(body.position);mesh.quaternion.copy(body.quaternion);mesh.scale.copy(body.scale);mesh.bindMode=body.bindMode;mesh.bind(body.skeleton,body.bindMatrix);
  mesh.frustumCulled=false;mesh.castShadow=mesh.receiveShadow=true;
  const group=new THREE.Group();body.parent.add(group);group.add(mesh);
  return {mesh,group};
}
