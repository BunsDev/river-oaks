import { Matrix4, Mesh, Vector4 } from 'three';

// A CPU contact pass samples thousands of vertices in one pose. Reuse each
// bone's transform within that pass instead of multiplying it per influence.
// Keep a private cache: the renderer owns the shared skeleton's GPU matrices.
export function createSkinnedVertexSampler(mesh) {
  const transforms=mesh.skeleton.bones.map(()=>new Matrix4());
  const base=new Vector4(),point=new Vector4();
  return {
    // Call after the caller has updated the mesh and bone world matrices.
    update() {
      const {bones,boneInverses}=mesh.skeleton;
      for(let i=0;i<bones.length;i++)transforms[i].multiplyMatrices(bones[i].matrixWorld,boneInverses[i]);
    },
    getVertexPosition(index,target) {
      // Read the live geometry and influences, including temporary speech
      // targets. Mesh's implementation handles relative and absolute morphs.
      Mesh.prototype.getVertexPosition.call(mesh,index,target);
      base.set(target.x,target.y,target.z,1).applyMatrix4(mesh.bindMatrix);
      target.set(0,0,0);
      const {skinIndex,skinWeight}=mesh.geometry.attributes;
      for(let slot=0;slot<4;slot++) {
        const weight=skinWeight.getComponent(index,slot);
        if(weight!==0)target.addScaledVector(point.copy(base).applyMatrix4(transforms[skinIndex.getComponent(index,slot)]),weight);
      }
      return target.applyMatrix4(mesh.bindMatrixInverse);
    },
  };
}
