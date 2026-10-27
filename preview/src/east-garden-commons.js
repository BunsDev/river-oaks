import * as THREE from 'three';
import { commonsGroundAt } from '../../shared/east-garden-commons-layout.js';
import { RETRO } from './retro-palette.js';
import { buildCityKit } from './city-kit/render.js';
import { KIT_MATERIALS } from '../../shared/city-kit/catalog.js';
import { physicalSurface } from './materials.js';

export { attachEastGardenCommons, detachEastGardenCommons } from './east-garden-commons-world.js';

/**
 * The Commons ground ramp and pavilion, plus the assembled destination
 * (layout.destination, shared/commons-destination.js) when it is composed.
 */
export function buildEastGardenCommons(layout) {
  const group = new THREE.Group(); group.name = 'East Garden Commons';
  if (!layout) return group;
  // With the destination composed, the gateway ramp is paved in Market Street's granite
  // so the District street runs on into the shared lane without a change of floor.
  const granite=KIT_MATERIALS['granite-sett'];
  const materials = {
    route:layout.destination?physicalSurface(granite.surface,{tileSize:granite.tile,variation:.08,color:new THREE.Color(granite.color),textureContrast:granite.textureContrast,normalScale:new THREE.Vector2(.3,.3)}):new THREE.MeshStandardMaterial({color:RETRO.ivory,roughness:.8}),
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
  // With the destination composed, the kit paves everything past the three-metre
  // gateway; the base slab keeps only the measured ramp from the District edge.
  const destination=layout.destination, baseSurfaces=destination?layout.surfaces.slice(0,1):layout.surfaces.slice(0,2);
  for (const surface of baseSurfaces) {
    const [west,south,east,north]=surface.rect,positions=[],indices=[];
    const start=Math.max(west,layout.edge),end=surface===layout.surfaces[0]?(destination?layout.edge+3:layout.surfaces[1].rect[0]):east;
    const xs=surface===layout.surfaces[0]?[...Array.from({length:21},(_,i)=>start+i*.5).filter(x=>x<end),end]:[start,end];
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
    // Metric UVs (east, north) so surface materials tile at their real size.
    geometry.setAttribute('uv',new THREE.Float32BufferAttribute(Array.from({length:positions.length/3},(_,i)=>[positions[i*3],-positions[i*3+2]]).flat(),2));
    const mesh=new THREE.Mesh(geometry,materials.route);mesh.name=surface.id;mesh.receiveShadow=true;group.add(mesh);
  }
  const baseSolids=destination?layout.solids.slice(0,layout.solids.length-destination.solids.length):layout.solids;
  let kit=null;
  if(destination){
    kit=buildCityKit({...destination,pieces:[...destination.pieces,...pavilionPieces(layout,baseSolids)]},{groundAt:(east,north)=>commonsGroundAt(layout,Math.max(east,layout.edge+1e-6),north)??layout.ground,ground:layout.ground,plantingMetres:layout.plantingMetres});
    group.add(kit);buildPavilion(layout,group,materials,geometries);
  } else {
    for(const solid of baseSolids)addBox(solid.id,solid.rect,layout.ground,solid.height,solid.kind);
    addBox(`${layout.pavilion.id}/roof`,layout.pavilion.rect,layout.ground+layout.pavilion.clearHeight,layout.pavilion.roofThickness,'canopy');
  }
  group.userData.ready = kit?.userData.ready ?? Promise.resolve();
  let disposed=false;
  group.userData.dispose=()=>{if(disposed)return;disposed=true;kit?.userData.dispose();for(const geometry of geometries)geometry.dispose();for(const material of Object.values(materials))material.dispose();group.clear();};
  group.userData.update=position=>kit?.userData.update(position);
  group.userData.shadowProxies=kit?.userData.shadowProxies??[];
  group.userData.setLanterns=(lit,complete)=>kit?.userData.setLanterns(lit,complete);
  group.userData.lanterns=kit?.userData.lanterns??new Map();
  group.userData.stats=()=>kit?.userData.stats()??null;
  group.userData.layout=layout;
  return group;
}

// The approved blockout's benches and rain garden, drawn with kit pieces.
function pavilionPieces(layout,solids) {
  const pieces=[];
  for(const solid of solids){
    const [w,s,e,n]=solid.rect,centre=[(w+e)/2,(s+n)/2];
    if(solid.kind==='bench')pieces.push({id:solid.id,piece:'furniture/bench',at:centre,yaw:centre[1]>-1335?0:Math.PI});
    if(solid.kind==='planter')pieces.push({id:solid.id,piece:'landscape/planter',rect:solid.rect});
  }
  return pieces;
}

// The landmark pavilion: round ivory posts with brass capitals, a layered canopy
// with a teal fascia and a raised lantern deck. Posts keep the blockout's solids.
function buildPavilion(layout,group,materials,geometries) {
  const {rect,clearHeight,roofThickness}=layout.pavilion,ground=layout.ground,[w,s,e,n]=rect;
  const fascia=new THREE.MeshStandardMaterial({color:RETRO.teal,roughness:.5});materials.fascia=fascia;
  const add=(geometry,material,x,y,north)=>{geometries.add(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,-north);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);return mesh;};
  for(const x of [w+.25,e-.25])for(const y of [s+.25,n-.25]){
    add(new THREE.CylinderGeometry(.2,.24,clearHeight-.3,16),materials.canopy,x,ground+(clearHeight-.3)/2,y);
    add(new THREE.CylinderGeometry(.32,.22,.3,16),materials.bench,x,ground+clearHeight-.15,y);
    add(new THREE.CylinderGeometry(.3,.3,.12,16),materials.bench,x,ground+.06,y);
  }
  add(new THREE.BoxGeometry(e-w+1.6,roofThickness*.55,n-s+1.6),materials.canopy,(w+e)/2,ground+clearHeight+roofThickness*.27,(s+n)/2);
  add(new THREE.BoxGeometry(e-w+1.7,.32,n-s+1.7),fascia,(w+e)/2,ground+clearHeight+.12,(s+n)/2);
  add(new THREE.BoxGeometry(e-w-2,.22,n-s-2),materials.canopy,(w+e)/2,ground+clearHeight+roofThickness+.18,(s+n)/2);
  add(new THREE.BoxGeometry(e-w-1.9,.06,n-s-1.9),materials.bench,(w+e)/2,ground+clearHeight+roofThickness+.31,(s+n)/2);
  add(new THREE.BoxGeometry(3.2,.9,2.2),materials.canopy,(w+e)/2,ground+clearHeight+roofThickness+.75,(s+n)/2);
  add(new THREE.BoxGeometry(3.4,.08,2.4),materials.bench,(w+e)/2,ground+clearHeight+roofThickness+1.24,(s+n)/2);
}
