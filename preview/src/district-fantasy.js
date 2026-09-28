import * as THREE from 'three';
import { RETRO } from './retro-palette.js';

// Space-age garden architecture follows the mapped facades and roof footprints.
// Canopies, fins and orbital lights remain above the existing walking clearance.
export function buildDistrictFantasy(world) {
  const group=new THREE.Group();group.name='Retrofuturistic garden district';
  const enamel=color=>new THREE.MeshPhysicalMaterial({color,roughness:.30,clearcoat:.7,metalness:.12});
  const ivory=enamel(RETRO.porcelain),accents=[RETRO.teal,RETRO.rose,RETRO.mint,RETRO.apricot].map(enamel);
  const brass=new THREE.MeshStandardMaterial({color:RETRO.brass,roughness:.25,metalness:.83});
  const glow=new THREE.MeshStandardMaterial({color:RETRO.light,emissive:RETRO.light,emissiveIntensity:1.4,roughness:.35});
  const warm=new THREE.MeshStandardMaterial({color:'#ffe4ba',emissive:'#ffd0a3',emissiveIntensity:1.3});
  const box=new THREE.BoxGeometry(1,1,1),dome=new THREE.SphereGeometry(1,32,12);
  // Centimeter-scale fascia beads never need the canopy's tessellation.
  const bead=new THREE.SphereGeometry(1,8,6);
  const ring=new THREE.TorusGeometry(1,.022,6,64);ring.rotateX(Math.PI/2);
  const post=new THREE.CylinderGeometry(.5,.5,1,12),batches=new Map();
  const add=(geometry,material,position,scale,yaw=0,storeId=null)=>{
    const key=`${geometry.uuid}:${material.uuid}`;
    if(!batches.has(key))batches.set(key,{geometry,material,parts:[]});
    batches.get(key).parts.push({position,scale,yaw,storeId});
  };
  for(const [index,store] of world.stores.entries()) {
    const [x,north,base]=store.facade,[nx,ny]=store.outward,yaw=Math.atan2(nx,-ny);
    const at=(across,height,depth=.35)=>[x-ny*across+nx*depth,base+height,-north-nx*across-ny*depth];
    const accent=accents[index%accents.length],building=world.buildings.find(b=>b.id===store.building_id);
    add(dome,ivory,at(0,5.08,.80),[3.5,.19,1.25],yaw,store.id);
    add(dome,accent,at(0,5.13,.80),[3.35,.19,1.16],yaw,store.id);
    add(ring,brass,at(0,5.08,.80),[3.50,1,1.25],yaw,store.id);
    add(ring,glow,at(0,4.98,.80),[3.20,1,1.07],yaw,store.id);
    // Cantilevered horizontal fins and a pastel ceramic panel repeat across the street.
    const top=Math.min(8.0,(building?.size[2]??9)-.6);
    for(let i=0;i<3;i++)add(box,i===1?accent:ivory,at(0,top+i*.23,.28),[6.7,.085,.65-i*.1],yaw,store.id);
    for(const side of [-1,1]) {
      add(box,brass,at(side*3.25,3.16,.18),[.065,4.95,.11],yaw,store.id);
      add(box,accent,at(side*3.34,3.16,.16),[.10,4.95,.08],yaw,store.id);
      // Small orbital pendants, safely over head height.
      add(post,brass,at(side*2.76,4.55,1.23),[.022,.81,.022],yaw,store.id);
      add(dome,warm,at(side*2.76,4.09,1.23),[.14,.14,.14],yaw,store.id);
      add(ring,brass,at(side*2.76,4.09,1.23),[.28,1,.28],yaw,store.id);
    }
    // Atomic-age starburst on the fascia, flanking the existing readable sign.
    for(let ray=0;ray<8;ray++) {
      const a=ray*Math.PI/4,center=at(2.75+Math.cos(a)*.14,5.55+Math.sin(a)*.14,.38);
      add(bead,brass,center,[.025,.025,.025],yaw,store.id);
    }
    add(dome,warm,at(2.75,5.55,.39),[.065,.065,.05],yaw,store.id);
  }
  for(const [index,building] of world.buildings.entries()) {
    if(building.kind==='parking')continue;
    const [x,north,base]=building.center,roof=base+building.size[2];
    const radius=Math.min(2.6,building.size[0]*.17,building.size[1]*.17);
    if(radius<1)continue;
    add(dome,accents[index%accents.length],[x,roof+.75,-north],[radius,.50,radius]);
    add(ring,brass,[x,roof+.71,-north],[radius*1.15,1,radius*1.15]);
    add(ring,glow,[x,roof+.49,-north],[radius*.95,1,radius*.95]);
    add(post,brass,[x,roof+1.80,-north],[.055,2,.055]);
    add(dome,warm,[x,roof+2.84,-north],[.12,.12,.12]);
  }
  const dummy=new THREE.Object3D();
  for(const {geometry,material,parts} of batches.values()) {
    const mesh=new THREE.InstancedMesh(geometry,material,parts.length);mesh.userData.storeIds=parts.map(p=>p.storeId);
    parts.forEach((p,i)=>{dummy.position.fromArray(p.position);dummy.scale.fromArray(p.scale);dummy.rotation.set(0,p.yaw,0);dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);});
    mesh.castShadow=material!==glow&&material!==warm;mesh.receiveShadow=true;group.add(mesh);
  }
  group.userData.direction='space-age-garden';
  return group;
}
