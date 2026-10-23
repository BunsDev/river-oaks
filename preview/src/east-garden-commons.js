import * as THREE from 'three';
import { commonsGroundAt } from '../../shared/east-garden-commons-layout.js';
import { RETRO } from './retro-palette.js';

export { attachEastGardenCommons, detachEastGardenCommons } from './east-garden-commons-world.js';

/** Simple shared-material geometry for route/clearance review, before art detail. */
export function buildEastGardenCommons(layout) {
  const group = new THREE.Group(); group.name = 'East Garden Commons blockout';
  if (!layout) return group;
  const materials = {
    route:new THREE.MeshStandardMaterial({color:RETRO.ivory,roughness:.8}),
    column:new THREE.MeshStandardMaterial({color:RETRO.teal,roughness:.6}),
    canopy:new THREE.MeshStandardMaterial({color:RETRO.ivory,roughness:.8}),
    bench:new THREE.MeshStandardMaterial({color:RETRO.brass,roughness:.55}),
    planter:new THREE.MeshStandardMaterial({color:'#73875c',roughness:1}),
  };
  const box = new THREE.BoxGeometry(1,1,1), geometries = new Set([box]);
  const addBox = (id,r,bottom,height,material) => {
    const mesh = new THREE.Mesh(box,materials[material]); mesh.name = id;
    mesh.position.set((r[0]+r[2])/2,bottom+height/2,-(r[1]+r[3])/2);
    mesh.scale.set(r[2]-r[0],height,r[3]-r[1]); mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
  };
  // A sampled ramp is the same height function used by authoritative movement.
  for (const surface of layout.surfaces) {
    const [west,south,east,north]=surface.rect,positions=[],indices=[];
    const start=Math.max(west,layout.edge),end=surface===layout.surfaces[0]?layout.surfaces[1].rect[0]:east;
    const xs=surface===layout.surfaces[0]?[...Array.from({length:21},(_,i)=>start+i*.5),end]:[start,end];
    const ys=surface===layout.surfaces[0]?Array.from({length:13},(_,i)=>south+(north-south)*i/12):[south,north];
    const columns=xs.length-1,rows=ys.length-1;
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++) {
      const px=xs[x],py=ys[y];
      const height=commonsGroundAt(layout,Math.max(px,layout.edge+1e-6),py)??layout.ground;
      positions.push(px,height,-py);
      if(x<columns&&y<rows){const a=y*(columns+1)+x,b=a+1,c=a+columns+1;indices.push(a,b,c,b,c+1,c);}
    }
    // Twenty-centimetre slab thickness, with sides/bottom for player-height review.
    const topCount=positions.length/3,topIndices=[...indices];
    for(let i=0;i<topCount;i++)positions.push(positions[i*3],positions[i*3+1]-.2,positions[i*3+2]);
    for(let i=0;i<topIndices.length;i+=3)indices.push(topIndices[i]+topCount,topIndices[i+2]+topCount,topIndices[i+1]+topCount);
    const rim=[...xs.map((_,i)=>i),...ys.slice(1).map((_,i)=>(i+1)*(columns+1)+columns),
      ...xs.slice(0,-1).map((_,i)=>rows*(columns+1)+columns-1-i),...ys.slice(1,-1).map((_,i)=>(rows-1-i)*(columns+1))];
    for(let i=0;i<rim.length;i++){const a=rim[i],b=rim[(i+1)%rim.length];indices.push(a,a+topCount,b,b,a+topCount,b+topCount);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometries.add(geometry);
    const mesh=new THREE.Mesh(geometry,materials.route);mesh.name=surface.id;mesh.receiveShadow=true;group.add(mesh);
  }
  for(const solid of layout.solids)addBox(solid.id,solid.rect,layout.ground,solid.height,solid.kind);
  addBox(`${layout.pavilion.id}/roof`,layout.pavilion.rect,layout.ground+layout.pavilion.clearHeight,layout.pavilion.roofThickness,'canopy');
  let disposed=false;
  group.userData.dispose=()=>{if(disposed)return;disposed=true;for(const geometry of geometries)geometry.dispose();for(const material of Object.values(materials))material.dispose();group.clear();};
  group.userData.layout=layout;
  return group;
}
