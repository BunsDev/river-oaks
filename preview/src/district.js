import * as THREE from 'three';
import { createRetailInteriors } from './retail-interiors.js';
import { buildRetailDisplays } from './retail-displays.js';
import { terrainHeight } from './geometry.js';
import { physicalSurface } from './materials.js';
import { thinStorefrontGlass, displayRoomSurface } from './storefront-materials.js';

function sign(name, illuminated = false) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = name === 'Le Colonial' ? '#192d42' : name === 'Steak 48' ? '#222b29' : illuminated ? '#f7f6f2' : '#ece9e0'; context.fillRect(0, 0, 1024, 128);
  context.fillStyle = name === 'Harry Winston' ? '#987c4a' : name === 'Le Colonial' ? '#f5f1e5' : name === 'Steak 48' ? '#f5e3bd' : '#252a29';
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.font = name === 'Cartier' || name === 'Le Colonial' ? 'italic 65px Georgia' : name === 'Steak 48' ? '600 70px Arial' : `500 ${name.length > 20 ? 39 : name.length > 13 ? 47 : 57}px Georgia`;
  context.fillText(name === 'Cartier' || name === 'Le Colonial' || name === 'Steak 48' ? name : name.toUpperCase(), 512, 65, 955);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.MeshStandardMaterial({ map: texture, emissiveMap: illuminated ? texture : null, emissive: illuminated ? '#ffffff' : '#000000', emissiveIntensity: illuminated ? 0.18 : 0, roughness: 0.7 });
}

function cutStone() {
  const material=physicalSurface('stone',{instanced:true,tileSize:3,normalScale:new THREE.Vector2(0.035,0.035),roughness:0.74});
  const compile=material.onBeforeCompile, key=material.customProgramCacheKey;
  const color=new THREE.Color('#e5dece').toArray().map(x=>x.toFixed(4)).join(',');
  material.onBeforeCompile=shader=>{
    compile(shader);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      diffuseColor.rgb = mix(vec3(${color}), diffuseColor.rgb, 0.045);
      vec2 roJointGrid = fract(vMapUv * vec2(3.0 / 0.95, 3.0 / 0.48));
      vec2 roJointEdge = min(roJointGrid, 1.0 - roJointGrid);
      float roJoint = min(smoothstep(0.002, 0.009, roJointEdge.x), smoothstep(0.003, 0.012, roJointEdge.y));
      diffuseColor.rgb *= mix(0.78, 1.0, roJoint);`);
  };
  material.customProgramCacheKey=()=>key()+'-cut-limestone';
  return material;
}

export function buildDistrictBuildings(world) {
  const group = new THREE.Group(), materials = new Set(), geometries = new Set(), textures = [];
  const box = new THREE.BoxGeometry(1, 1, 1); geometries.add(box);
  const pane = new THREE.PlaneGeometry(1, 1); geometries.add(pane);
  const stone = cutStone();
  const dark = new THREE.MeshStandardMaterial({ color: '#303634', metalness: 0.58, roughness: 0.35 });
  const glass = thinStorefrontGlass();
  const upperGlass = new THREE.MeshPhysicalMaterial({ color:'#536263',metalness:0.22,roughness:0.14,envMapIntensity:1.4 });
  const interior = displayRoomSurface();
  const floor = displayRoomSurface({ floor: true });
  textures.push(interior.aoMap, interior.emissiveMap, floor.aoMap, floor.emissiveMap);
  const display = new THREE.MeshStandardMaterial({color:'#e8ddc6',roughness:0.5,emissive:'#ddbe86',emissiveIntensity:0.12});
  const light = new THREE.MeshStandardMaterial({color:'#fff2d5',emissive:'#ffddb0',emissiveIntensity:2.5,roughness:0.3});
  const roof = new THREE.MeshStandardMaterial({ color: '#aaa99f', roughness: 0.93 });
  const gold = new THREE.MeshStandardMaterial({ color: '#a68d62', roughness: 0.35, metalness: 0.75 });
  const navy = new THREE.MeshStandardMaterial({ color:'#192d42',roughness:0.62 });
  const wood = new THREE.MeshStandardMaterial({ color:'#71543a',roughness:0.72 });
  const hedge = new THREE.MeshStandardMaterial({ color:'#31543d',roughness:0.93 });
  const velvet = new THREE.MeshStandardMaterial({color:'#45413b',roughness:0.96});
  const furniture = new THREE.MeshStandardMaterial({color:'#775c40',roughness:0.65});
  for (const material of [stone, dark, glass, upperGlass, interior, floor, display, light, roof, gold, navy, wood, hedge, velvet, furniture]) materials.add(material);
  const interiors = createRetailInteriors();
  interiors.materials.forEach(material => materials.add(material));
  const displays=[];
  const batches = new Map();
  const part = (material, position, scale, yaw = 0, buildingIndex = -1) => {
    if (!batches.has(material)) batches.set(material, []);
    batches.get(material).push({ position, scale, yaw, buildingIndex });
  };
  world.buildings.forEach((building, index) => {
    const shape = new THREE.Shape(building.ring.map(([x, y]) => new THREE.Vector2(x, y)));
    const retailHeight=building.kind==='parking'?0:4.25;
    // The ground-floor wall is assembled around real openings. Upper massing and
    // roof keep the mapped polygon; rooms below are original display alcoves.
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: building.size[2]-retailHeight, bevelEnabled: false, steps: 1, curveSegments: 1 });
    geometry.rotateX(-Math.PI / 2); geometries.add(geometry);
    const mesh = new THREE.Mesh(geometry, building.kind === 'parking' ? roof : stone);
    mesh.position.y = building.center[2]+retailHeight; mesh.castShadow = mesh.receiveShadow = true;
    mesh.userData.districtBuilding = building.id; group.add(mesh);
    const roofGeometry = new THREE.ShapeGeometry(shape); roofGeometry.rotateX(-Math.PI / 2); geometries.add(roofGeometry);
    const top = new THREE.Mesh(roofGeometry, roof); top.position.y = building.center[2] + building.size[2] + 0.02; top.receiveShadow = true; group.add(top);
    const ring = building.ring;
    const winding=Math.sign(ring.slice(1).reduce((sum,b,i)=>sum+ring[i][0]*b[1]-b[0]*ring[i][1],0));
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i-1], b = ring[i], dx = b[0]-a[0], dy = b[1]-a[1], length = Math.hypot(dx, dy);
      if (length < 1) continue;
      const yaw = Math.atan2(dy, dx), cx = (a[0]+b[0])/2, cz = -(a[1]+b[1])/2, base = building.center[2];
      const material = stone;
      part(material, [cx, base + 4.65, cz], [length, 1.0, 0.16], yaw, index);
      part(stone, [cx, base + 0.18, cz], [length, 0.36, 0.26], yaw, index);
      part(stone, [cx, base + building.size[2] - 0.2, cz], [length + 0.1, 0.38, 0.3], yaw, index);
      const bays = Math.floor(length / 3.2), span = length / Math.max(1, bays);
      const entries=world.stores.filter(store=>store.building_id===building.id).map(store=>{
        const sx=store.facade[0]-a[0],sy=store.facade[1]-a[1];
        return {along:(sx*dx+sy*dy)/length,distance:Math.abs(sx*dy-sy*dx)/length};
      }).filter(entry=>entry.distance<0.2 && entry.along>=0 && entry.along<=length);
      const entryAt=offset=>entries.some(entry=>Math.abs(entry.along-offset)<1.15);
      for (let k = 0; k < bays; k++) {
        const t = (k+0.5)/bays, x = a[0]+dx*t, z = -(a[1]+dy*t);
        const nx=winding*dy/length, nz=winding*dx/length;
        const at=(depth,height)=>[x-nx*depth,base+height,z-nz*depth];
        // Cut the entry out of this single outward-facing sheet, so the door
        // does not reflect twice through a second pane behind its opening.
        let intervals = [[k * span + 0.19, (k + 1) * span - 0.19]];
        for (const entry of entries) intervals = intervals.flatMap(([left, right]) => {
          const lo = entry.along - 0.85, hi = entry.along + 0.85;
          if (hi <= left || lo >= right) return [[left, right]];
          return [[left, Math.min(right, lo)], [Math.max(left, hi), right]].filter(([a, b]) => b - a > 0.05);
        });
        for (const [left, right] of intervals) {
          const center = at(0.11, 2.25), offset = (left + right) / 2 - t * length;
          center[0] += dx / length * offset; center[2] -= dy / length * offset;
          part(glass, center, [right - left, 3.65, 1], yaw + (winding < 0 ? Math.PI : 0), index);
        }
        if(!entryAt(t*length)) part(dark, [x, base+2.25, z], [0.055, 3.7, 0.19], yaw, index);
        part(dark, [x, base+3.5, z], [span-0.3, 0.055, 0.19], yaw, index);
        if(!entryAt(k*span)) part(material, [a[0]+dx*k/bays, base+2.25, -(a[1]+dy*k/bays)], [0.3, 4.1, 0.54], yaw, index);
        if (retailHeight) {
            const nearest=world.stores.filter(store=>store.building_id===building.id).sort((left,right)=>Math.hypot(left.facade[0]-x,left.facade[1]+z)-Math.hypot(right.facade[0]-x,right.facade[1]+z))[0];
          part(floor,at(1.35,0.28),[span,0.10,2.7],yaw,index);
          part(interiors.forCategory(nearest?.category),at(2.7,2.25),[span,4.0,0.12],yaw,index);
          part(interior,at(1.35,4.16),[span,0.12,2.7],yaw,index);
          // Warm display strips and plinths reveal depth through recessed glass.
          part(light,at(1.35,3.98),[span-0.5,0.025,0.06],yaw,index);
          if(!entryAt(t*length)) {
            if(['restaurant','ice_cream'].includes(nearest?.category)) {
              part(furniture,at(1.85,1.04),[1.1,0.055,0.72],yaw,index);
              part(dark,at(1.85,0.65),[0.06,0.75,0.52],yaw,index);
              for(const side of [-1,1]) {
                const seat=at(1.85,0.74);seat[0]+=dx/length*0.8*side;seat[2]-=dy/length*0.8*side;
                part(furniture,seat,[0.43,0.06,0.43],yaw,index);
                const back=[...seat];back[0]+=dx/length*0.2*side;back[2]-=dy/length*0.2*side;back[1]+=0.25;
                part(furniture,back,[0.05,0.5,0.43],yaw,index);
                const leg=[...seat];leg[1]-=0.23;part(dark,leg,[0.04,0.46,0.35],yaw,index);
              }
            } else {
              part(display,at(1.75,0.86),[0.8,1.05,0.75],yaw,index);
              displays.push({position:at(1.75,1.4),yaw:yaw+(winding<0?Math.PI:0),category:nearest?.category,jewelry:['jewelry','fashion_accessories'].includes(nearest?.category)});
            }
          }
          for(const side of [-1,1]) {
            if(entryAt((k+(side>0?1:0))*span)) continue;
            const p=at(1.35,2.2);p[0]+=dx/length*span/2*side;p[2]-=dy/length*span/2*side;
            part(interior,p,[0.08,4.0,2.7],yaw,index);
          }
        }
        for (let level = 1; level < Math.floor(building.size[2]/4)-1; level++) part(upperGlass, [x, base+6.9+level*3.25, z], [span-0.8, 2.1, 0.15], yaw, index);
      }
    }
  });
  for (const store of world.stores) {
    const [x, north, base] = store.facade, [nx, ny] = store.outward;
    const yaw = Math.atan2(nx, -ny);
    const isDior = store.name === 'Dior', isCartier = store.name === 'Cartier', isVanCleef = store.name === 'Van Cleef & Arpels';
    const isHarry = store.name === 'Harry Winston', isSteak = store.name === 'Steak 48', isColonial = store.name === 'Le Colonial';
    const material = sign(store.name, isDior || isCartier || isVanCleef || isSteak || isColonial); materials.add(material); textures.push(material.map);
    const geometry = new THREE.PlaneGeometry(isColonial ? 4.5 : store.name.length > 17 ? 9 : 7, isColonial ? 0.5 : 0.85); geometries.add(geometry);
    const label = new THREE.Mesh(geometry, material);
    label.position.set(x+nx*(isColonial ? 1.4 : 0.3), base+(isColonial ? 3.97 : isSteak ? 5.35 : 4.65), -north-ny*(isColonial ? 1.4 : 0.3)); label.rotation.y = yaw;
    label.userData.storeId = store.id; group.add(label);
    // Door hardware and source-specific frontage details provide pedestrian-scale cues.
    const entryFrame = isHarry ? stone : isCartier || isVanCleef ? gold : dark;
    for(const side of [-1,1]) part(entryFrame,[x+nx*0.15-ny*side*0.82,base+1.8,-north-ny*0.15-nx*side*0.82],[0.065,3.2,0.16],yaw);
    if (!isHarry) part(entryFrame,[x+nx*0.15,base+3.38,-north-ny*0.15],[1.7,0.06,0.16],yaw);
    part(glass, [x+nx*0.26, base+1.8, -north-ny*0.26], [1.5, 3.0, 0.09], yaw);
    part(gold, [x+nx*0.36, base+1.5, -north-ny*0.36], [0.04, 0.65, 0.06], yaw);
    if (!isDior && !isCartier && !isVanCleef && !isHarry) part(isColonial ? navy : dark, [x+nx*0.65, base+4.02, -north-ny*0.65], [4.6, 0.09, 1.4], yaw);
    if (isHarry) {
      const archGeometry=new THREE.TorusGeometry(0.94,0.10,8,28,Math.PI); geometries.add(archGeometry);
      const arch=new THREE.Mesh(archGeometry,stone);
      arch.position.set(x+nx*0.38,base+2.65,-north-ny*0.38); arch.rotation.y=yaw;
      arch.castShadow=arch.receiveShadow=true; group.add(arch);
      for(const side of [-1,1]) {
        const across=side*2.45;
        part(navy,[x-ny*across+nx*0.58,base+3.98,-north-nx*across-ny*0.58],[1.85,0.09,1.2],yaw);
      }
    }
    if (isSteak) {
      for(let slat=-2;slat<=2;slat++) part(wood,[x+nx*(0.25+slat*0.23),base+3.93,-north-ny*(0.25+slat*0.23)],[4.35,0.045,0.09],yaw);
      part(hedge,[x+nx*0.55,base+4.24,-north-ny*0.55],[4.5,0.4,0.45],yaw);
      part(light,[x+nx*1.25,base+3.88,-north-ny*1.25],[4.0,0.035,0.05],yaw);
    }
    if (isColonial) {
      const foliageGeometry=new THREE.IcosahedronGeometry(0.3,1); geometries.add(foliageGeometry);
      const foliage=new THREE.InstancedMesh(foliageGeometry,hedge,12), shrub=new THREE.Object3D();
      for(const [sideIndex,side] of [-1,1].entries()) {
        const across=side*2.35;
        part(navy,[x-ny*across+nx*1.2,base+0.3,-north-nx*across-ny*1.2],[0.85,0.6,0.65],yaw);
        for(let stem=0;stem<6;stem++) {
          const spread=(stem-2.5)*0.13, depth=((stem%3)-1)*0.16;
          shrub.position.set(x-ny*(across+spread)+nx*(1.2+depth),base+0.75+(stem%2)*0.13,-north-nx*(across+spread)-ny*(1.2+depth));
          shrub.scale.set(0.78,0.75,0.72); shrub.updateMatrix();
          foliage.setMatrixAt(sideIndex*6+stem,shrub.matrix);
          foliage.setColorAt(sideIndex*6+stem,new THREE.Color(stem%2 ? '#3c6947' : '#547c4d'));
        }
      }
      foliage.castShadow=foliage.receiveShadow=true; group.add(foliage);
    }
    if (isVanCleef) {
      const ceramic = new THREE.MeshStandardMaterial({color:'#e7dbc4',roughness:0.68,metalness:0.04}); materials.add(ceramic);
      const diamond = new THREE.OctahedronGeometry(0.12,0); geometries.add(diamond);
      const tiles = new THREE.InstancedMesh(diamond,ceramic,384), tile = new THREE.Object3D();
      for(let row=0;row<12;row++) for(let column=0;column<32;column++) {
        const across=(column-15.5)*0.24, height=5.18+row*0.23;
        tile.position.set(x-ny*across+nx*0.38,base+height,-north-nx*across-ny*0.38);
        tile.rotation.set(0,yaw,0); tile.scale.set(1,0.96,0.28); tile.updateMatrix();
        const index=row*32+column; tiles.setMatrixAt(index,tile.matrix);
        tiles.setColorAt(index,new THREE.Color().setHSL(0.105,0.16,0.76+row*0.007+column*0.0008));
      }
      tiles.castShadow=tiles.receiveShadow=true; group.add(tiles);
    }
  }
  const dummy = new THREE.Object3D();
  for (const [material, parts] of batches) {
    const mesh = new THREE.InstancedMesh(material === glass ? pane : box, material, parts.length);
    mesh.userData.buildingIndices = parts.map(part => part.buildingIndex);
    parts.forEach((part, index) => { dummy.position.fromArray(part.position); dummy.scale.fromArray(part.scale); dummy.rotation.set(0, part.yaw, 0); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); });
    mesh.castShadow = material !== glass && material !== light; mesh.receiveShadow = true; group.add(mesh);
  }
  group.userData.reflectionMaterials = [glass, upperGlass];
  group.userData.reflectionExclusions = group.children.filter(mesh => mesh.material === glass || mesh.material === upperGlass);
  group.add(buildRetailDisplays(displays));
  group.userData.dispose = () => {
    interiors.dispose();
    group.traverse(item => {
      if (item.isInstancedMesh) item.dispose();
      if (item.geometry) geometries.add(item.geometry);
      if (item.material) materials.add(item.material);
    });
    geometries.forEach(geometry => geometry.dispose());
    materials.forEach(material => material.dispose());
    textures.forEach(texture => texture.dispose());
  };
  return group;
}

export function buildDistrictDetail(world) {
  const group = new THREE.Group(), objects = [];
  const dummy = new THREE.Object3D();
  const bronze = new THREE.MeshStandardMaterial({ color: '#454c46', roughness: 0.55, metalness: 0.6 });
  const timber = new THREE.MeshStandardMaterial({ color: '#80705a', roughness: 0.85 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  const benches = world.stores.filter((_, i) => i % 3 === 0);
  for (const store of benches) {
    const [nx, ny] = store.outward, x = store.visit[0] + nx*2.8 + ny*4, north = store.visit[1] + ny*2.8 - nx*4;
    const ground = terrainHeight(world.terrain, x, north), yaw = Math.atan2(nx, -ny);
    for (let i = 0; i < 5; i++) objects.push({ material: timber, p: [x+nx*(i-2)*0.11, ground+0.65, -north-ny*(i-2)*0.11], s: [1.8, 0.06, 0.09], yaw });
    for (const side of [-1, 1]) objects.push({ material: bronze, p: [x+ny*side*0.65, ground+0.4, -north+nx*side*0.65], s: [0.1, 0.5, 0.5], yaw });
    objects.push({ material: bronze, p: [x+nx*1.2, ground+2.8, -north-ny*1.2], s: [0.1, 5.2, 0.1], yaw });
    objects.push({ material: bronze, p: [x+nx*1.2, ground+5.45, -north-ny*1.2], s: [0.55, 0.12, 0.65], yaw });
  }
  for (const material of [bronze, timber]) {
    const parts = objects.filter(p => p.material === material), mesh = new THREE.InstancedMesh(box, material, parts.length);
    parts.forEach((p,i) => { dummy.position.fromArray(p.p); dummy.scale.fromArray(p.s); dummy.rotation.set(0,p.yaw,0); dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix); });
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}
