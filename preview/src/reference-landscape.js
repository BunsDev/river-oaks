import * as THREE from 'three';
import { winstonBed } from './reference-planting.js';
import { groundSurfaceHeight } from './world-surface.js';
import { buildReferenceBedPlanting } from './landscape-models.js';

export function buildReferenceLandscape(world) {
  const group=new THREE.Group(),bed=winstonBed(world);group.name='Photo-referenced curb planting';
  if(!bed)return group;
  const ring=bed.ring,center=ring.reduce((a,p)=>[a[0]+p[0]/ring.length,a[1]+p[1]/ring.length],[0,0]);
  const positions=[],indices=[];
  const vertex=([x,n],height)=>{positions.push(x,groundSurfaceHeight(world,x,-n)+height,-n);return positions.length/3-1;};
  const middle=vertex(center,.025),soil=new THREE.MeshStandardMaterial({color:'#25231c',roughness:1});
  const inside=ring.map(p=>vertex(p,.025));
  for(let i=0;i<ring.length;i++)indices.push(middle,inside[i],inside[(i+1)%ring.length]);
  const soilGeometry=new THREE.BufferGeometry();soilGeometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));soilGeometry.setIndex(indices);soilGeometry.computeVertexNormals();
  soil.side=THREE.DoubleSide;
  const fill=new THREE.Mesh(soilGeometry,soil);fill.receiveShadow=true;group.add(fill);
  const curb=new THREE.MeshStandardMaterial({color:'#77756f',roughness:.92}),curbPositions=[],curbIndices=[];
  ring.forEach((a,i)=>{
    const b=ring[(i+1)%ring.length],dx=b[0]-a[0],dn=b[1]-a[1],length=Math.hypot(dx,dn),ox=-dn/length*.10,on=dx/length*.10;
    const corners=[a,b,[b[0]+ox,b[1]+on],[a[0]+ox,a[1]+on]],start=curbPositions.length/3;
    for(const height of [.015,.14])for(const [x,n]of corners)curbPositions.push(x,groundSurfaceHeight(world,x,-n)+height,-n);
    for(const face of [[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]){const [p,q,r,s]=face.map(v=>v+start);curbIndices.push(p,q,r,p,r,s);}
  });
  const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(curbPositions,3));geometry.setIndex(curbIndices);geometry.computeVertexNormals();
  const rim=new THREE.Mesh(geometry,curb);rim.castShadow=rim.receiveShadow=true;group.add(rim);
  group.add(buildReferenceBedPlanting(bed,world));
  return group;
}
