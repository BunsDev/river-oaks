import { terrainHeight } from './geometry.js';
import { Matrix4, Vector3 } from 'three';

const surfaces=new WeakMap(),CELL=2;

// Compile the same triangles the renderer uses. Spatial buckets avoid a scene
// raycast for each heel, toe, pedestrian and wheel on every animation frame.
// A group (the roads layer holds lanes and walkways) contributes every mesh in it.
export function registerGroundSurfaces(world,objects) {
  const buckets=new Map(),a=new Vector3(),b=new Vector3(),c=new Vector3();
  const instance=new Matrix4(),transform=new Matrix4();
  const meshes=[];
  for(const object of objects)object.traverse(child=>{if(child.isMesh)meshes.push(child);});
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

// Read-only view of the registered ground triangles within a square around
// (x, z), for the debug overlay. Each triangle is returned once, as three
// scene-space [x, y, z] corners.
export function groundSurfaceTriangles(world,x,z,radius) {
  const index=surfaces.get(world),seen=new Set(),result=[];
  if(!index)return result;
  for(let cx=Math.floor((x-radius)/CELL);cx<=Math.floor((x+radius)/CELL);cx++)
    for(let cz=Math.floor((z-radius)/CELL);cz<=Math.floor((z+radius)/CELL);cz++)
      for(const t of index.buckets.get(`${cx}:${cz}`)??[]) {
        if(seen.has(t))continue;seen.add(t);
        result.push([[t.x,t.y,t.z],[t.x+t.ux,t.y+t.uy,t.z+t.uz],[t.x+t.vx,t.y+t.vy,t.z+t.vz]]);
      }
  return result;
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
