import * as THREE from 'three';

// Inspect rendered triangles, independently of the costume's fitting method.
export function measureJevicaClearance(fixture) {return measureClearance(fixture,false);}
export function measureJevicaArmClearance(fixture) {return measureClearance(fixture,true);}
export function measureJevicaWaistClearance(fixture) {return measureClearance(fixture,false,true);}

function measureClearance({avatar},arms,waistBand=false) {
  avatar.object.updateWorldMatrix(true,true);
  const waist=avatar.object.children.find(group=>group.children.some(mesh=>mesh.isMesh&&mesh.userData.deformableCostume));
  const body=avatar.rig.model.getObjectByName('Jevica');
  if(!waist||!body?.isSkinnedMesh)throw new Error('Missing Jevica skin or gown');
  const inverse=new THREE.Matrix4().copy(waist.matrixWorld).invert(), matrix=new THREE.Matrix4();
  const bins=Array.from({length:80},()=>[]),low=-1.1,step=1.2/bins.length;
  let clothRadius=0;
  const surfaces=waistBand?[...waist.children,avatar.rig.model.getObjectByName('Jevica_fitted_bodice')]:waist.children;
  for(const mesh of surfaces) {
    if(!mesh.isMesh)continue;
    matrix.multiplyMatrices(inverse,mesh.matrixWorld);
    const attribute=mesh.geometry.attributes.position;
    const points=Array.from({length:attribute.count},(_,i)=>{
      const p=new THREE.Vector3();
      if(mesh.isSkinnedMesh)mesh.getVertexPosition(i,p);else p.fromBufferAttribute(attribute,i);
      return p.applyMatrix4(matrix);
    });
    for(const p of points)clothRadius=Math.max(clothRadius,Math.hypot(p.x,p.z));
    const index=mesh.geometry.index, count=index?.count??points.length;
    for(let i=0;i<count;i+=3) {
      const tri=[0,1,2].map(j=>points[index?index.getX(i+j):i+j]);
      const start=Math.max(0,Math.floor((Math.min(...tri.map(p=>p.y))-low)/step));
      const end=Math.min(bins.length-1,Math.floor((Math.max(...tri.map(p=>p.y))-low)/step));
      for(let b=start;b<=end;b++)bins[b].push(tri);
    }
  }
  const skin=body.geometry.attributes.skinIndex,weights=body.geometry.attributes.skinWeight;
  const limb=waistBand?/^(spine_01|pelvis)/:arms?/^(upperarm_|lowerarm_|hand_|thumb_|index_|middle_|ring_|pinky_)/:/^(pelvis|thigh_|calf_)/;
  const bones=new Set(body.skeleton.bones.flatMap((b,i)=>limb.test(b.name)?[i]:[]));
  const ray=new THREE.Ray(),p=new THREE.Vector3(),hit=new THREE.Vector3();
  matrix.multiplyMatrices(inverse,body.matrixWorld);
  let worst=-Infinity,checked=0,uncovered=0,worstPoint=null;
  for(let i=0;i<skin.count;i++) {
    if(![0,1,2,3].some(j=>bones.has(skin.getComponent(i,j))&&weights.getComponent(i,j)>0.05))continue;
    body.getVertexPosition(i,p).applyMatrix4(matrix);
    if(waistBand?(p.y<-.03||p.y>.08):(p.y<-.82||p.y>(arms ? .085 : -.12)))continue;
    const radius=Math.hypot(p.x,p.z);if(radius<.04)continue;
    ray.origin.set(0,p.y,0);ray.direction.set(p.x/radius,0,p.z/radius);
    let outer=0;
    for(const [a,b,c] of bins[Math.floor((p.y-low)/step)]??[]) {
      if(ray.intersectTriangle(a,b,c,false,hit))outer=Math.max(outer,Math.hypot(hit.x,hit.z));
    }
    if(!outer){if(!arms)uncovered++;continue;}
    checked++;
    const overlap=arms?outer-radius:radius-outer;
    if(overlap>worst){worst=overlap;worstPoint={position:p.toArray(),outer,radius};}
  }
  return {worst,checked,uncovered,clothRadius,worstPoint};
}
