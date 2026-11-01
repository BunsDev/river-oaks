import * as THREE from 'three';

// Inspect rendered triangles, independently of the costume's fitting method.
export function measureJevicaClearance(fixture) {return measureClearance(fixture,false);}
export function measureJevicaArmClearance(fixture) {return measureClearance(fixture,true);}
export function measureJevicaWaistClearance(fixture) {return measureClearance(fixture,false,true);}

function measureClearance({avatar},arms,waistBand=false) {
  avatar.object.updateWorldMatrix(true,true);
  const waist=avatar.object.children.find(group=>group.children.some(mesh=>mesh.isMesh&&mesh.userData.deformableCostume));
  const body=avatar.rig.model.getObjectByName('Jevica');
  if(!waist||!body?.isSkinnedMesh)throw new Error('Missing Jevica skin or peplum');
  const inverse=new THREE.Matrix4().copy(waist.matrixWorld).invert(), matrix=new THREE.Matrix4();
  const bins=Array.from({length:80},()=>[]),low=-1.1,step=1.2/bins.length;
  let clothRadius=0;
  // The trousers and blazer are shells skinned to the rig (jevica-suit.js); the peplum hangs from the waist group.
  const shells=['Jevica satin trousers','Jevica satin blazer'].map(name=>avatar.rig.model.getObjectByName(name)).filter(Boolean);
  // Arms are measured against the peplum only: the blazer's sleeves dress them on purpose.
  const surfaces=waistBand?[...waist.children,...shells,avatar.rig.model.getObjectByName('Jevica_fitted_bodice')]:arms?waist.children:[...waist.children,...shells];
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
  let worst=-Infinity,checked=0,uncovered=0,worstPoint=null,uncoveredPoint=null;
  // Trousers hug each leg (jevica-suit.js), so a ray from the waist axis grazes the far
  // side of a leg and misses its cloth. Legs are measured from their own bone chain
  // instead: from the closest point on thigh→calf→foot, out through the skin vertex.
  const legs=!arms&&!waistBand&&shells.length>0;
  const chain=side=>['thigh','calf','foot'].map(name=>avatar.rig.model.getObjectByName(`${name}_${side}`).getWorldPosition(new THREE.Vector3()).applyMatrix4(inverse));
  // Below the shoe's cuff the shoe, not the trousers, covers the skin.
  const shoes=legs?avatar.rig.model.getObjectByName('Jevicashoes01'):null;let shoeTop=-Infinity;
  if(shoes){const q=new THREE.Vector3(),toWaist=new THREE.Matrix4().multiplyMatrices(inverse,shoes.matrixWorld);for(let i=0;i<shoes.geometry.attributes.position.count;i++)shoeTop=Math.max(shoeTop,shoes.getVertexPosition(i,q).applyMatrix4(toWaist).y);}
  const chains=legs?{l:chain('l'),r:chain('r')}:null,leftBones=new Set(body.skeleton.bones.flatMap((b,i)=>/_l$/.test(b.name)?[i]:[]));
  const closest=(points,q)=>{let best=null,distance=Infinity;const segment=new THREE.Line3(),c=new THREE.Vector3();
    for(let k=0;k<points.length-1;k++){segment.set(points[k],points[k+1]);segment.closestPointToPoint(q,true,c);const d=c.distanceTo(q);if(d<distance){distance=d;best=c.clone();}}return best;};
  for(let i=0;i<skin.count;i++) {
    if(![0,1,2,3].some(j=>bones.has(skin.getComponent(i,j))&&weights.getComponent(i,j)>0.05))continue;
    body.getVertexPosition(i,p).applyMatrix4(matrix);
    if(waistBand?(p.y<-.03||p.y>.08):(p.y<-.82||p.y>(arms ? .085 : -.12)))continue;
    if(legs&&p.y<shoeTop+.01)continue;
    let radius,outer=0;
    // Down to 15 cm below the hip joints (the crotch) the hips are convex around the waist axis, as for the gown.
    if(legs&&p.y<Math.min(chains.l[0].y,chains.r[0].y)-.15) {
      let left=0;for(let j=0;j<4;j++)if(leftBones.has(skin.getComponent(i,j)))left+=weights.getComponent(i,j);
      const origin=closest(chains[left>=.5?'l':'r'],p);radius=origin.distanceTo(p);if(radius<.01)continue;
      ray.origin.copy(origin);ray.direction.copy(p).sub(origin).normalize();
      const bin=Math.floor((p.y-low)/step);
      for(let b=bin-6;b<=bin+6;b++)for(const [a,bb,c] of bins[b]??[])if(ray.intersectTriangle(a,bb,c,false,hit))outer=Math.max(outer,hit.distanceTo(origin));
    } else {
      radius=Math.hypot(p.x,p.z);if(radius<.04)continue;
      ray.origin.set(0,p.y,0);ray.direction.set(p.x/radius,0,p.z/radius);
      for(const [a,b,c] of bins[Math.floor((p.y-low)/step)]??[]) {
        if(ray.intersectTriangle(a,b,c,false,hit))outer=Math.max(outer,Math.hypot(hit.x,hit.z));
      }
    }
    if(!outer){if(!arms){uncovered++;uncoveredPoint??={position:p.toArray(),legRay:legs&&p.y<Math.min(chains.l[0].y,chains.r[0].y)-.15};}continue;}
    checked++;
    const overlap=arms?outer-radius:radius-outer;
    if(overlap>worst){worst=overlap;worstPoint={position:p.toArray(),outer,radius};}
  }
  return {worst,checked,uncovered,clothRadius,worstPoint,uncoveredPoint};
}
