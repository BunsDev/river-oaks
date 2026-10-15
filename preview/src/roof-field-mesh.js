import * as THREE from 'three';
import { roofFieldBoundaries } from './roof-field-boundaries.js';
const area = ring => ring.reduce((sum,a,i) => { const b=ring[(i+1)%ring.length]; return sum+a[0]*b[1]-b[0]*a[1]; },0)/2;
function inside(p,ring) {
  let result=false;
  for(let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[i],b=ring[j];
    if((a[1]>p[1])!==(b[1]>p[1]) && p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])result=!result;
  }
  return result;
}
// Round convex corners inward only. Concave/service corners stay within the
// original cell union; rounding must never grow planting into a reserved void.
function roundedPath(ring, path, radius) {
  const turns=ring.map((b,i)=>{
    const a=ring[(i+ring.length-1)%ring.length],c=ring[(i+1)%ring.length];
    const cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]);
    const r=cross>0?Math.min(radius,Math.hypot(b[0]-a[0],b[1]-a[1])*.35,Math.hypot(c[0]-b[0],c[1]-b[1])*.35):0;
    const toward=q=>{const length=Math.hypot(q[0]-b[0],q[1]-b[1]);return length?[b[0]+(q[0]-b[0])*r/length,b[1]+(q[1]-b[1])*r/length]:b;};
    return {b,enter:toward(a),leave:toward(c)};
  });
  path.moveTo(...turns[0].enter);
  for(const {b,enter,leave} of turns){path.lineTo(...enter);path.quadraticCurveTo(...b,...leave);}
  path.closePath();return path;
}
export function roofFieldGeometry(fields, { depth = .14 } = {}) {
  const rings=roofFieldBoundaries(fields), outers=rings.filter(r=>area(r)>0), holes=rings.filter(r=>area(r)<0);
  const shapes=outers.map(ring=>{
    const shape=roundedPath(ring,new THREE.Shape(),fields[0].size*.3);
    for(const hole of holes)if(inside(hole[0],ring))shape.holes.push(roundedPath(hole,new THREE.Path(),0));
    return shape;
  });
  const geometry=new THREE.ExtrudeGeometry(shapes,{depth,bevelEnabled:false,steps:1,curveSegments:3});
  geometry.rotateX(-Math.PI/2);geometry.computeBoundingBox();geometry.computeBoundingSphere();return geometry;
}
