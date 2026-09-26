import { Matrix3, Raycaster, Vector3 } from 'three';

// The points are on the cushion's unit sphere. Indent the actual upholstery,
// then raycast that final surface so buttons sit on triangles, not a guessed plane.
export function fitTuftedButtons(cushion, points) {
  const vertices=cushion.geometry.attributes.position,scale=cushion.scale;
  const anchors=points.map(p=>new Vector3(...p));
  for(let i=0;i<vertices.count;i++) {
    const vertex=new Vector3().fromBufferAttribute(vertices,i);
    // Sphere UV seams duplicate vertices. Close sub-picometre trig gaps before
    // raycasting a rotated cushion directly along one of those seams.
    for(const axis of ['x','y','z'])if(Math.abs(vertex[axis])<1e-12)vertex[axis]=0;
    const distance=Math.min(...anchors.map(anchor=>vertex.clone().sub(anchor).multiply(scale).length()));
    const depth=.012*Math.exp(-((distance/.052)**2));
    const normal=vertex.clone().divide(scale).normalize();
    vertex.addScaledVector(normal.divide(scale),-depth);
    vertices.setXYZ(i,vertex.x,vertex.y,vertex.z);
  }
  vertices.needsUpdate=true;cushion.geometry.computeVertexNormals();cushion.geometry.computeBoundingSphere();
  cushion.updateWorldMatrix(true,false);
  const normalMatrix=new Matrix3().getNormalMatrix(cushion.matrixWorld),ray=new Raycaster();
  return anchors.map(anchor=>{
    const normal=anchor.clone().applyMatrix3(normalMatrix).normalize();
    const origin=cushion.localToWorld(anchor.clone()).addScaledVector(normal,.10);
    ray.set(origin,normal.clone().negate());
    const hit=ray.intersectObject(cushion,false)[0];
    if(!hit)throw new Error('Upholstery button missed its cushion');
    return {position:hit.point,normal:hit.face.normal.clone().applyMatrix3(normalMatrix).normalize()};
  });
}
