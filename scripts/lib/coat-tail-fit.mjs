import * as THREE from 'three';

// A coat opens across the whole hip. Spread the lap transition around that
// arc, and gather the back vertically instead of flattening its lower rows.
// This authored target is consumed only by the offline contact bake.
export function coatTailSeatPoint(point,waist){
  const depth=Math.max(0,waist-point.y),lap=Math.min(depth,.45);
  const front=THREE.MathUtils.smoothstep(point.z,-.18,.18);
  const pinned=THREE.MathUtils.smoothstep(depth,0,.08);
  const folded=new THREE.Vector3(point.x,waist+.035*Math.sin(lap/.45*Math.PI)-Math.max(0,depth-.45),point.z+lap*.85);
  const rear=new THREE.Vector3(point.x,point.y<-.25?-.25+(point.y+.25)*.45:point.y,point.z);
  return point.clone().lerp(rear.lerp(folded,front),pinned);
}
