import { terrainHeight } from './geometry.js';
import { Matrix4, Vector3 } from 'three';

const surfaces=new WeakMap(),CELL=2;

// Compile the same triangles the renderer uses. Spatial buckets avoid a scene
// raycast for each heel, toe, pedestrian and wheel on every animation frame.
export function registerGroundSurfaces(world,meshes) {
  const buckets=new Map(),a=new Vector3(),b=new Vector3(),c=new Vector3();
  const instance=new Matrix4(),transform=new Matrix4();
  for(const mesh of meshes) {
    mesh.updateWorldMatrix(true,false);
    const position=mesh.geometry.attributes.position,index=mesh.geometry.index;
    for(let n=0;n<(mesh.isInstancedMesh?mesh.count:1);n++) {
      transform.copy(mesh.matrixWorld);
      if(mesh.isInstancedMesh){mesh.getMatrixAt(n,instance);transform.multiply(instance);}
      for(let i=0;i<(index?.count??position.count);i+=3) {
        a.fromBufferAttribute(position,index?index.getX(i):i).applyMatrix4(transform);
        b.fromBufferAttribute(position,index?index.getX(i+1):i+1).applyMatrix4(transform);
        c.fromBufferAttribute(position,index?index.getX(i+2):i+2).applyMatrix4(transform);
        const ux=b.x-a.x,uz=b.z-a.z,vx=c.x-a.x,vz=c.z-a.z,det=ux*vz-uz*vx;
        if(Math.abs(det)<1e-9)continue;
        const triangle={x:a.x,z:a.z,y:a.y,ux,uz,vx,vz,det,uy:b.y-a.y,vy:c.y-a.y};
        for(let x=Math.floor(Math.min(a.x,b.x,c.x)/CELL);x<=Math.floor(Math.max(a.x,b.x,c.x)/CELL);x++)
          for(let z=Math.floor(Math.min(a.z,b.z,c.z)/CELL);z<=Math.floor(Math.max(a.z,b.z,c.z)/CELL);z++) {
            const key=`${x}:${z}`;
            if(!buckets.has(key))buckets.set(key,[]);
            buckets.get(key).push(triangle);
          }
      }
    }
  }
  surfaces.set(world,{buckets,lastX:NaN,lastZ:NaN,lastBucket:[]});
}

export function groundSurfaceHeight(world,x,z) {
  const index=surfaces.get(world),cellX=Math.floor(x/CELL),cellZ=Math.floor(z/CELL);
  // Heel/toe and surface-normal probes are spatially coherent. Cache only the
  // candidate bucket, never a height: every probe still tests exact triangles.
  if(index&&(index.lastX!==cellX||index.lastZ!==cellZ)) {
    index.lastX=cellX;index.lastZ=cellZ;
    index.lastBucket=index.buckets.get(`${cellX}:${cellZ}`)??[];
  }
  let height=-Infinity;
  for(const t of index?.lastBucket??[]) {
    const dx=x-t.x,dz=z-t.z,u=(dx*t.vz-dz*t.vx)/t.det,v=(t.ux*dz-t.uz*dx)/t.det;
    if(u>=-1e-7&&v>=-1e-7&&u+v<=1+1e-7)height=Math.max(height,t.y+u*t.uy+v*t.vy);
  }
  return Number.isFinite(height)?height:terrainHeight(world.terrain,x,-z)+(world.walkSurfaceOffset??0);
}
