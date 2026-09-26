import * as THREE from 'three';

// Independent posed-surface check. Sample the back/shoulder garment vertices
// and triangle centres against the actual skinned body triangles.
export function createBodiceProbe(avatar) {
  const {model,source}=avatar.rig??avatar;
  const body=model.getObjectByName('Jevica'),cloth=model.getObjectByName('Jevica_fitted_bodice');
  const original=source.scene.getObjectByName('Jevica_fitted_bodice').geometry;
  const selected=new Set(),p=original.attributes.position;
  for(let i=0;i<p.count;i++)if(p.getY(i)>1.04&&p.getZ(i)<.02&&Math.abs(p.getX(i))>.10)selected.add(i);
  const centres=[],ci=original.index;
  for(let i=0;i<ci.count;i+=3) {
    const ids=[ci.getX(i),ci.getX(i+1),ci.getX(i+2)];
    if(ids.every(id=>selected.has(id)))centres.push(ids);
  }
  const bp=body.geometry.attributes.position,bi=body.geometry.index,faces=[];
  for(let i=0;i<bi.count;i+=3) {
    const ids=[bi.getX(i),bi.getX(i+1),bi.getX(i+2)];
    if(ids.some(id=>bp.getY(id)>.98&&bp.getY(id)<1.4&&Math.abs(bp.getX(id))<.34))faces.push(ids);
  }
  return ()=>{
    model.updateMatrixWorld(true);
    const inverse=model.matrixWorld.clone().invert(),points=new Map();
    const pointAt=i=>{
      if(!points.has(i))points.set(i,body.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(body.matrixWorld).applyMatrix4(inverse));
      return points.get(i);
    };
    const triangles=faces.map(ids=>{
      const tri=new THREE.Triangle(...ids.map(pointAt)),bounds=new THREE.Box3().setFromPoints([tri.a,tri.b,tri.c]).expandByScalar(.03);
      return {tri,bounds,normal:tri.getNormal(new THREE.Vector3())};
    });
    const clothPoints=new Map([...selected].map(i=>[i,cloth.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(cloth.matrixWorld).applyMatrix4(inverse)]));
    const samples=[...clothPoints.values(),...centres.map(ids=>new THREE.Vector3().add(clothPoints.get(ids[0])).add(clothPoints.get(ids[1])).add(clothPoints.get(ids[2])).multiplyScalar(1/3))];
    const ids=[...selected],back=sample=>sample<ids.length?original.attributes.normal.getZ(ids[sample])<-.25:centres[sample-ids.length].every(i=>original.attributes.normal.getZ(i)<-.25);
    const hit=new THREE.Vector3(),delta=new THREE.Vector3();let worst=Infinity,backWorst=Infinity,backChecked=0,uncovered=0,worstPoint=null,worstSample=null;
    for(const [sample,point]of samples.entries()) {
      let distance=Infinity,clearance=Infinity;
      for(const {tri,bounds,normal}of triangles) {
        if(!bounds.containsPoint(point))continue;
        tri.closestPointToPoint(point,hit);const d=point.distanceToSquared(hit);
        if(d<distance){distance=d;clearance=delta.subVectors(point,hit).dot(normal);}
      }
      if(!Number.isFinite(clearance))uncovered++;
      else if(clearance<worst){worst=clearance;worstPoint=point.toArray();worstSample=sample<selected.size?[...selected][sample]:centres[sample-selected.size];}
      if(back(sample)){backChecked++;backWorst=Math.min(backWorst,clearance);}
    }
    return {checked:samples.length,uncovered,minimumClearance:worst,backChecked,minimumBackClearance:backWorst,worstPoint,worstSample};
  };
}
