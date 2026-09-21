import * as THREE from 'three';
import { physicalSurface } from './materials.js';
import { terrainHeight } from './geometry.js';
import { canopyTiles } from './vegetation.js';

export function buildObservedFoliage(world) {
  const group=new THREE.Group(), data=world.vegetation;
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;
  const ctx=canvas.getContext('2d'), gradient=ctx.createLinearGradient(-20,0,20,0);
  gradient.addColorStop(0,'#304e20');gradient.addColorStop(0.4,'#708b3f');gradient.addColorStop(0.54,'#4f6d2a');gradient.addColorStop(1,'#819749');
  ctx.strokeStyle='#655d3b';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(132,248);ctx.quadraticCurveTo(115,120,122,32);ctx.stroke();
  // Four roughly 10 cm leaves per card, rather than an oversized single leaf.
  for(const [x,y,angle] of [[108,47,-0.35],[85,116,-1.0],[170,125,0.9],[139,194,0.45]]) {
    ctx.save();ctx.translate(x,y);ctx.rotate(angle);
    ctx.fillStyle=gradient;ctx.beginPath();ctx.moveTo(0,-45);ctx.bezierCurveTo(26,-28,26,22,0,45);ctx.bezierCurveTo(-24,19,-25,-25,0,-45);ctx.fill();
    ctx.strokeStyle='#b2bd7070';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,-42);ctx.lineTo(0,44);ctx.stroke();
    ctx.strokeStyle='#bac77a35';ctx.lineWidth=0.55;
    for(let v=-27;v<30;v+=10)for(const side of [-1,1]){ctx.beginPath();ctx.moveTo(0,v+7);ctx.lineTo(side*(18-Math.abs(v)*0.2),v-7);ctx.stroke();}
    ctx.restore();
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
  const material=new THREE.MeshStandardMaterial({map:texture,alphaTest:0.45,side:THREE.DoubleSide,roughness:0.9,metalness:0});
  const leafGeometry=new THREE.PlaneGeometry(0.29,0.29), dummy=new THREE.Object3D(), color=new THREE.Color();
  const lod=[];let seed=81929;
  const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
  for(const tile of canopyTiles(data.voxels)) {
    const mesh=new THREE.InstancedMesh(leafGeometry,material,tile.voxels.length*16);
    const ground=tile.voxels.map(v=>terrainHeight(world.terrain,v[0],v[1]));
    // Each LOD prefix includes every measured voxel; distance never drops a district patch.
    for(let layer=0;layer<16;layer++)tile.voxels.forEach((v,index)=>{
      dummy.position.set(v[0]+(random()-0.5)*0.4,ground[index]+v[2]+(random()-0.5)*0.4,-v[1]+(random()-0.5)*0.4);
      dummy.rotation.set(random()*Math.PI,random()*Math.PI*2,random()*Math.PI);
      dummy.scale.setScalar(0.9+random()*0.45);dummy.updateMatrix();
      const instance=layer*tile.voxels.length+index;mesh.setMatrixAt(instance,dummy.matrix);
      mesh.setColorAt(instance,color.setHSL(0.2+random()*0.05,0.10+random()*0.13,0.62+random()*0.25));
    });
    mesh.computeBoundingSphere();mesh.castShadow=mesh.receiveShadow=true;mesh.userData.aoExclude=true;
    group.add(mesh);lod.push({mesh,center:tile.center,ground:ground[0],count:tile.voxels.length});
  }
  // Fill the interpreted branch crowns between sparse leaf-off returns. These
  // sprays are decorative foliage, not additional measured vegetation voxels.
  for (const tile of canopyTiles(data.voxels)) {
    const tips = data.branch_supports
      .filter(support => Math.abs(support.position[0]-tile.center[0]) < 32 && Math.abs(support.position[1]-tile.center[1]) < 32)
      .flatMap(support => support.endpoints.map(end => ({ end, radius: Math.max(0.4, Math.min(1.25, support.radius_m * 0.42)) })));
    if (!tips.length) continue;
    const mesh = new THREE.InstancedMesh(leafGeometry, material, tips.length * 64);
    for (let layer = 0; layer < 64; layer++) tips.forEach(({end, radius}, index) => {
      const angle = random()*Math.PI*2, vertical = random()*2-1, r = Math.cbrt(random());
      const spread = Math.sqrt(1-vertical*vertical)*r*radius;
      dummy.position.set(end[0]+Math.cos(angle)*spread, terrainHeight(world.terrain,end[0],end[1])+end[2]*0.9+vertical*r*radius*0.75, -end[1]+Math.sin(angle)*spread);
      dummy.rotation.set(random()*Math.PI,random()*Math.PI*2,random()*Math.PI);
      dummy.scale.setScalar(1.15+random()*0.45); dummy.updateMatrix();
      mesh.setMatrixAt(layer*tips.length+index,dummy.matrix);
      mesh.setColorAt(layer*tips.length+index,color.setHSL(0.22+random()*0.025,0.16+random()*0.12,0.50+random()*0.25));
    });
    mesh.computeBoundingSphere(); mesh.castShadow=mesh.receiveShadow=true; mesh.userData.aoExclude=true; group.add(mesh);
    lod.push({mesh,center:tile.center,ground:terrainHeight(world.terrain,...tile.center),count:tips.length,layers:[64,24,8]});
  }
  const segments=[];
  for(const support of data.branch_supports) {
    const [x,y]=support.position, ground=terrainHeight(world.terrain,x,y), h=support.height_m;
    const base=new THREE.Vector3(x,ground,-y), fork=new THREE.Vector3(x+0.04,ground+h*0.43,-y);
    segments.push({a:base,b:fork,width:Math.max(0.065,h*0.014)});
    for(const end of support.endpoints) {
      const tip=new THREE.Vector3(end[0],terrainHeight(world.terrain,end[0],end[1])+end[2]*0.9,-end[1]);
      const joint=fork.clone().lerp(tip,0.55);
      segments.push({a:fork,b:joint,width:Math.max(0.035,h*0.006)},{a:joint,b:tip,width:Math.max(0.015,h*0.0025)});
    }
  }
  const branchGeometry=new THREE.CylinderGeometry(0.48,1,1,8,1);
  const bark=physicalSurface('bark',{instanced:true,tileSize:1,normalScale:new THREE.Vector2(0.8,0.8)});
  const branches=new THREE.InstancedMesh(branchGeometry,bark,segments.length), up=new THREE.Vector3(0,1,0),direction=new THREE.Vector3();
  segments.forEach((part,index)=>{
    direction.subVectors(part.b,part.a);dummy.position.addVectors(part.a,part.b).multiplyScalar(0.5);dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize());dummy.scale.set(part.width,direction.length(),part.width);dummy.updateMatrix();branches.setMatrixAt(index,dummy.matrix);
  });
  branches.castShadow=branches.receiveShadow=true;group.add(branches);
  group.userData.texture=texture;
  group.userData.update=position=>{for(const tile of lod){const distance=Math.hypot(position.x-tile.center[0],position.z+tile.center[1],position.y-tile.ground);const levels=tile.layers ?? [16,5,1];tile.mesh.count=tile.count*(distance<90?levels[0]:distance<160?levels[1]:levels[2]);}};
  group.userData.observedVoxels=data.voxels.length;
  return group;
}

// Mapped tree positions; branch, crown and leaf forms are explicitly interpreted.
export function buildFoliage(trees) {
  const group = new THREE.Group();
  if (!trees.length) return group;
  const canvas = document.createElement('canvas'); canvas.width = 64; canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(8,64,53,64); gradient.addColorStop(0,'#45602d'); gradient.addColorStop(0.5,'#7c8f4a'); gradient.addColorStop(1,'#536d32');
  ctx.fillStyle = gradient; ctx.beginPath(); ctx.moveTo(32,4); ctx.bezierCurveTo(68,32,62,95,32,124); ctx.bezierCurveTo(0,94,-2,30,32,4); ctx.fill();
  ctx.strokeStyle = '#a6ae7188'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(32,8); ctx.lineTo(32,120); ctx.stroke();
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const leavesMaterial = new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.88 });
  const bark = new THREE.MeshStandardMaterial({ color:'#6b6354', roughness:1 });
  const leafGeometry = new THREE.PlaneGeometry(0.14,0.26), branchGeometry = new THREE.CylinderGeometry(0.55,1,1,7);
  const leafCount = 5500, leaves = new THREE.InstancedMesh(leafGeometry, leavesMaterial, leafCount*trees.length);
  const branches = new THREE.InstancedMesh(branchGeometry,bark,trees.length*13);
  const dummy = new THREE.Object3D(), direction = new THREE.Vector3(), up = new THREE.Vector3(0,1,0), color = new THREE.Color();
  let seed = 48273;
  const random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
  trees.forEach((tree,index) => {
    const [x,north,y]=tree.position, z=-north, radius=tree.crown_radius_m, h=tree.height_m;
    const centers=[];
    const branch=(start,end,width,slot)=>{
      direction.subVectors(end,start); dummy.position.addVectors(start,end).multiplyScalar(0.5); dummy.quaternion.setFromUnitVectors(up,direction.clone().normalize()); dummy.scale.set(width,direction.length(),width);dummy.updateMatrix();branches.setMatrixAt(index*13+slot,dummy.matrix);
    };
    branch(new THREE.Vector3(x,y,z),new THREE.Vector3(x+0.15,y+h*0.64,z),radius*0.08,0);
    for(let i=0;i<12;i++){
      const angle=i*2.39996, spread=radius*(0.5+random()*0.45), end=new THREE.Vector3(x+Math.cos(angle)*spread,y+h*(0.59+random()*0.36),z+Math.sin(angle)*spread);
      branch(new THREE.Vector3(x,y+h*(0.36+i*0.014),z),end,radius*0.025, i+1);centers.push(end);
    }
    for(let i=0;i<leafCount;i++){
      const center=centers[i%centers.length], angle=random()*Math.PI*2, vertical=random()*2-1, r=Math.cbrt(random()), spread=Math.sqrt(1-vertical*vertical)*r;
      dummy.position.set(center.x+Math.cos(angle)*spread*radius*0.52,center.y+vertical*r*h*0.17,center.z+Math.sin(angle)*spread*radius*0.52);
      dummy.rotation.set(random()*Math.PI,random()*Math.PI*2,random()*Math.PI); dummy.scale.setScalar(0.85+random()*0.7);dummy.updateMatrix();leaves.setMatrixAt(index*leafCount+i,dummy.matrix);
      leaves.setColorAt(index*leafCount+i,color.setHSL(0.23+random()*0.035,0.16+random()*0.17,0.48+random()*0.4));
    }
  });
  for(const mesh of [branches,leaves]){mesh.castShadow=mesh.receiveShadow=true;group.add(mesh);}
  leaves.userData.aoExclude=true;
  group.userData.texture=texture;
  return group;
}
