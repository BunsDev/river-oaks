import { Color, InstancedMesh, Matrix4 } from 'three';

// Partition static, opaque planting into independently culled bounds. Geometry
// and materials stay shared; instance positions and colors remain unchanged.
export function spatialInstanceBatches(source,cellSize=12) {
  const cells=new Map(),matrix=new Matrix4(),color=new Color();
  for(let i=0;i<source.count;i++) {
    source.getMatrixAt(i,matrix);
    const key=`${Math.floor(matrix.elements[12]/cellSize)}:${Math.floor(matrix.elements[14]/cellSize)}`;
    if(!cells.has(key))cells.set(key,[]);
    cells.get(key).push(i);
  }
  return [...cells.values()].map(indices=>{
    const batch=new InstancedMesh(source.geometry,source.material,indices.length);
    batch.position.copy(source.position);batch.quaternion.copy(source.quaternion);batch.scale.copy(source.scale);
    batch.castShadow=source.castShadow;batch.receiveShadow=source.receiveShadow;
    batch.renderOrder=source.renderOrder;batch.visible=source.visible;batch.frustumCulled=source.frustumCulled;
    batch.name=source.name;batch.userData={...source.userData};batch.layers.mask=source.layers.mask;
    indices.forEach((index,slot)=>{
      source.getMatrixAt(index,matrix);batch.setMatrixAt(slot,matrix);
      if(source.instanceColor){source.getColorAt(index,color);batch.setColorAt(slot,color);}
    });
    batch.computeBoundingSphere();batch.computeBoundingBox();
    return batch;
  });
}
