import * as THREE from 'three';
import { RETRO } from './retro-palette.js';
import { createRetailInteriors } from './retail-interiors.js';
import { buildRetailDisplays } from './retail-displays.js';
import { groundSurfaceHeight } from './world-surface.js';
import { physicalSurface } from './materials.js';
import { thinStorefrontGlass, displayRoomSurface } from './storefront-materials.js';
import { clearOfRoads, hedgeClusters } from './street-furniture.js';
import { storeRoomsFor, uncoveredBay, coveringRoom } from './store-rooms.js';
import { buildStoreInteriors } from './store-interiors.js';

// Signs are drawn once per tenant: ivory lettering on a brass-edged teal plaque
// (the retro palette), backlit on reference-guided frontages. The plaque fills
// the canvas, so signs are opaque and never sort against the glazing.
function sign(name, illuminated = false, home = false) {
  const canvas = document.createElement('canvas'); canvas.width = 1024; canvas.height = 128;
  const context = canvas.getContext('2d');
  context.fillStyle = home ? '#43564e' : RETRO.deepTeal; context.fillRect(0, 0, 1024, 128);
  const ink = RETRO.ivory;
  context.textAlign = 'center'; context.textBaseline = 'middle';
  context.font = `500 ${name.length > 20 ? 39 : name.length > 13 ? 47 : 57}px Futura, Avenir, sans-serif`;
  context.strokeStyle=RETRO.brass;context.lineWidth=3;context.strokeRect(8,8,1008,112);
  const text = name === 'Cartier' || name === 'Le Colonial' || name === 'Steak 48' ? name : name.toUpperCase();
  context.fillStyle = ink; context.fillText(text, 512, 62, 955);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8;
  const material = new THREE.MeshStandardMaterial({
    map: texture, emissiveMap: illuminated ? texture : null, emissive: illuminated ? '#ffffff' : '#000000', emissiveIntensity: illuminated ? 0.18 : 0,
    roughness: 0.7, metalness: 0,
  });
  return material;
}

function cutStone() {
  const material=physicalSurface('stone',{instanced:true,tileSize:3,normalScale:new THREE.Vector2(0.035,0.035),roughness:0.36});
  const compile=material.onBeforeCompile, key=material.customProgramCacheKey;
  const color=new THREE.Color(RETRO.ivory).toArray().map(x=>x.toFixed(4)).join(',');
  material.onBeforeCompile=shader=>{
    compile(shader);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      diffuseColor.rgb = mix(vec3(${color}), diffuseColor.rgb, 0.045);
      vec2 roJointGrid = fract(vMapUv * vec2(3.0 / 1.9, 3.0 / 1.2));
      vec2 roJointEdge = min(roJointGrid, 1.0 - roJointGrid);
      float roJoint = min(smoothstep(0.002, 0.009, roJointEdge.x), smoothstep(0.003, 0.012, roJointEdge.y));
      // Large ceramic panels have a fine joint and restrained surface variation.
      vec2 roBlock = floor(vMapUv * vec2(3.0 / 1.9, 3.0 / 1.2));
      float roTone = fract(sin(dot(roBlock, vec2(12.9898, 78.233))) * 43758.5453);
      diffuseColor.rgb *= mix(0.78, 1.0, roJoint) * (0.98 + 0.03 * roTone);`);
  };
  material.customProgramCacheKey=()=>key()+'-retro-ceramic-v1';
  return material;
}

// Upper storeys: window centre heights, sized so a two-storey mapped mass
// carries one row below its cornice and taller masses stack further rows.
export function upperWindowLevels(height) {
  const count = Math.floor((height - 6.85 - 0.8 - 0.35) / 3.3) + 1;
  return Array.from({ length: Math.max(0, count) }, (_, level) => 6.85 + level * 3.3);
}

export function buildDistrictBuildings(world) {
  const group = new THREE.Group(), materials = new Set(), geometries = new Set(), textures = [];
  const box = new THREE.BoxGeometry(1, 1, 1); geometries.add(box);
  const pane = new THREE.PlaneGeometry(1, 1); geometries.add(pane);
  const disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 14); geometries.add(disc);
  const lobe = new THREE.IcosahedronGeometry(0.5, 1); geometries.add(lobe);
  const stone = cutStone();
  const dark = new THREE.MeshStandardMaterial({ color: RETRO.deepTeal, metalness: 0.58, roughness: 0.35 });
  const bronzeFrame = new THREE.MeshStandardMaterial({ color: RETRO.brass, metalness: 0.7, roughness: 0.3 });
  const glass = thinStorefrontGlass();
  const upperGlass = new THREE.MeshPhysicalMaterial({ color:RETRO.teal,metalness:0.35,roughness:0.08,envMapIntensity:1.6,clearcoat:0.6,clearcoatRoughness:0.08 });
  const bulkhead = new THREE.MeshPhysicalMaterial({ color:RETRO.deepTeal,metalness:0.05,roughness:0.28,clearcoat:0.35,clearcoatRoughness:0.2 });
  const reveal = new THREE.MeshStandardMaterial({ color: '#1e2120', roughness: 0.85 });
  const interior = displayRoomSurface();
  const floor = displayRoomSurface({ floor: true });
  textures.push(interior.aoMap, interior.emissiveMap, floor.aoMap, floor.emissiveMap);
  const display = new THREE.MeshStandardMaterial({color:'#e8ddc6',roughness:0.5,emissive:'#ddbe86',emissiveIntensity:0.12});
  const light = new THREE.MeshStandardMaterial({color:'#fff2d5',emissive:'#ffddb0',emissiveIntensity:2.5,roughness:0.3});
  const spot = new THREE.MeshStandardMaterial({color:'#fff6e4',emissive:'#ffe6c0',emissiveIntensity:3.2,roughness:0.4});
  const roof = physicalSurface('asphalt', { tileSize: 5, normalScale: new THREE.Vector2(0.15, 0.15), color: '#c9c7bf', roughness: 0.95 });
  const plant = new THREE.MeshStandardMaterial({ color: '#b9bab6', roughness: 0.55, metalness: 0.3 });
  const gold = new THREE.MeshStandardMaterial({ color: '#a68d62', roughness: 0.35, metalness: 0.75 });
  const navy = new THREE.MeshStandardMaterial({ color:RETRO.deepTeal,roughness:0.62 });
  const canvas = new THREE.MeshStandardMaterial({ color:RETRO.teal,roughness:0.92 });
  const wood = new THREE.MeshStandardMaterial({ color:'#71543a',roughness:0.72 });
  const hedge = new THREE.MeshStandardMaterial({ color:'#31543d',roughness:0.93 });
  const velvet = new THREE.MeshStandardMaterial({color:RETRO.rose,roughness:0.96});
  const furniture = new THREE.MeshStandardMaterial({color:'#775c40',roughness:0.65});
  const planter = new THREE.MeshStandardMaterial({color:RETRO.porcelain,roughness:0.8});
  for (const [name, material] of Object.entries({ stone, dark, bronzeFrame, glass, upperGlass, bulkhead, reveal, interior, floor, display, light, spot, roof, plant, gold, navy, canvas, wood, hedge, velvet, furniture, planter })) { material.name = `facade-${name}`; materials.add(material); }
  const interiors = createRetailInteriors();
  interiors.materials.forEach(material => materials.add(material));
  // Walk-in rooms replace the shallow alcoves wherever a boutique plan covers a bay.
  const rooms = storeRoomsFor(world), roomById = new Map(rooms.map(room => [room.storeId, room])), doors = [];
  const displays=[];
  const batches = new Map();
  const part = (material, position, scale, yaw = 0, buildingIndex = -1, pitch = 0, geometry = box) => {
    const key = material === glass ? material : geometry === box ? material : `${geometry.uuid}:${material.uuid}`;
    if (!batches.has(key)) batches.set(key, { material, geometry: material === glass ? pane : geometry, parts: [] });
    batches.get(key).parts.push({ position, scale, yaw, pitch, buildingIndex });
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
    const levels = building.kind === 'parking' ? [] : upperWindowLevels(building.size[2]);
    // Rooftop plant and a stair bulkhead, placed inside the footprint by pulling
    // each mapped corner toward the centroid; a membrane roof is never bare.
    const corners = ring.slice(0, -1), centroid = corners.reduce((sum, [x, y]) => [sum[0] + x / corners.length, sum[1] + y / corners.length], [0, 0]);
    const roofTop = building.center[2] + building.size[2];
    corners.forEach(([x, y], corner) => {
      const f = corner % 2 ? 0.42 : 0.3, px = centroid[0] + (x - centroid[0]) * f, py = centroid[1] + (y - centroid[1]) * f;
      part(plant, [px, roofTop + 0.6, -py], corner % 2 ? [2.4, 1.2, 1.4] : [1.6, 1.0, 1.6], corner * 0.35, index);
    });
    part(stone, [centroid[0] + (corners[0][0] - centroid[0]) * 0.12, roofTop + 1.3, -(centroid[1] + (corners[0][1] - centroid[1]) * 0.12)], [3.2, 2.6, 3.2], 0, index);
    part(stone, [centroid[0], roofTop + 0.16, -centroid[1]], [0.1, 0.1, 0.1], 0, index);
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i-1], b = ring[i], dx = b[0]-a[0], dy = b[1]-a[1], length = Math.hypot(dx, dy);
      if (length < 1) continue;
      const yaw = Math.atan2(dy, dx), cx = (a[0]+b[0])/2, cz = -(a[1]+b[1])/2, base = building.center[2];
      const nxEdge=winding*dy/length, nzEdge=winding*dx/length;
      const edgeAt=(depth,height)=>[cx-nxEdge*depth,base+height,cz-nzEdge*depth];
      const material = stone;
      // Fascia above the shopfronts, with a shadow reveal beneath it and a
      // stepped cornice at the parapet: the horizontals that read as masonry.
      part(bulkhead, edgeAt(-0.06, 4.72), [length, 0.86, 0.28], yaw, index);
      // Continuous enamel fascia and brass speed lines tie every block into
      // the space-age palette, including facades without a named storefront.
      for(const height of [4.38,4.51,5.02])part(bronzeFrame,edgeAt(-.22,height),[length,.035,.035],yaw,index);
      part(stone,edgeAt(-.28,5.12),[length+.12,.11,.64],yaw,index);
      part(reveal, edgeAt(0.02, 4.2), [length, 0.18, 0.12], yaw, index);
      part(stone, edgeAt(-0.02, 0.18), [length, 0.36, 0.30], yaw, index);
      part(bulkhead, edgeAt(-0.1, building.size[2] - 0.15), [length + 0.2, 0.3, 0.36], yaw, index);
      part(stone, edgeAt(-0.05, building.size[2] - 0.5), [length + 0.1, 0.12, 0.26], yaw, index);
      for (const level of levels) part(stone, edgeAt(-0.02, level - 1.25), [length, 0.14, 0.2], yaw, index);
      const bays = Math.floor(length / 3.2), span = length / Math.max(1, bays);
      const entries=world.stores.filter(store=>store.building_id===building.id).map(store=>{
        const sx=store.facade[0]-a[0],sy=store.facade[1]-a[1];
        return {storeId:store.id,along:(sx*dx+sy*dy)/length,distance:Math.abs(sx*dy-sy*dx)/length,name:store.name};
      }).filter(entry=>entry.distance<0.2 && entry.along>=0 && entry.along<=length);
      const entryAt=offset=>entries.some(entry=>Math.abs(entry.along-offset)<1.15);
      for (let k = 0; k < bays; k++) {
        const t = (k+0.5)/bays, x = a[0]+dx*t, z = -(a[1]+dy*t);
        const nx=winding*dy/length, nz=winding*dx/length;
        const at=(depth,height)=>[x-nx*depth,base+height,z-nz*depth];
        const along=(point,offset)=>{ const p=[...point]; p[0]+=dx/length*offset; p[2]-=dy/length*offset; return p; };
        // A boutique room behind this bay: its own storefront keeps the glazing;
        // a room fronting another edge turns this bay into solid party wall.
        const inE = -nx, inN = nz;
        const bay0 = [a[0]+dx*k/bays+inE*1.4, a[1]+dy*k/bays+inN*1.4], bay1 = [a[0]+dx*(k+1)/bays+inE*1.4, a[1]+dy*(k+1)/bays+inN*1.4];
        const open = retailHeight ? uncoveredBay(rooms, bay0, bay1) : [0, 1];
        const cover = retailHeight && (!open || open[0] > 0 || open[1] < 1) ? coveringRoom(rooms, bay0, bay1) : null;
        const fronting = !cover || entries.some(entry => entry.storeId === cover.storeId);
        const shifted = (depth, height, fraction) => { const p = at(depth, height); const offset = (fraction - 0.5) * span; p[0] += dx / length * offset; p[2] -= dy / length * offset; return p; };
        // Cut the entry out of this single outward-facing sheet, so the door
        // does not reflect twice through a second pane behind its opening.
        let intervals = [[k * span + 0.19, (k + 1) * span - 0.19]];
        for (const entry of entries) intervals = intervals.flatMap(([left, right]) => {
          const lo = entry.along - 0.85, hi = entry.along + 0.85;
          if (hi <= left || lo >= right) return [[left, right]];
          return [[left, Math.min(right, lo)], [Math.max(left, hi), right]].filter(([a, b]) => b - a > 0.05);
        });
        if (!fronting) {
          const [t0, t1] = open ?? [0, 0];
          const solid = [[0, t0], [t1, 1]].filter(([p, q]) => q - p > 0.01);
          for (const [p, q] of solid) if (span * (q - p) > 0.1) part(stone, shifted(0.15, 2.25, (p + q) / 2), [span * (q - p) + 0.02, 3.8, 0.3], yaw, index);
          intervals = intervals.flatMap(([left, right]) => {
            const lo = k * span + t0 * span, hi = k * span + t1 * span;
            const kept = [[Math.max(left, lo), Math.min(right, hi)]].filter(([a, b]) => b - a > 0.05);
            return kept;
          });
        }
        for (const [left, right] of intervals) {
          const offset = (left + right) / 2 - t * length, width = right - left;
          // Honed stone bulkhead, glazing sheet, and a bronze frame with real
          // stiles, head and sill so the pane reads as a fitted unit.
          part(bulkhead, along(at(0.06, 0.34), offset), [width + 0.06, 0.32, 0.22], yaw, index);
          part(glass, along(at(0.11, 2.27), offset), [width, 3.55, 1], yaw + (winding < 0 ? Math.PI : 0), index);
          part(bronzeFrame, along(at(0.10, 4.06), offset), [width + 0.04, 0.06, 0.12], yaw, index);
          part(bronzeFrame, along(at(0.10, 0.52), offset), [width + 0.04, 0.05, 0.12], yaw, index);
          for (const side of [-1, 1]) part(bronzeFrame, along(at(0.10, 2.29), offset + side * width / 2), [0.05, 3.6, 0.12], yaw, index);
        }
        const solidCenter = !fronting && (!open || open[0] > 0.5 || open[1] < 0.5);
        if(!entryAt(t*length) && !solidCenter) part(dark, [x, base+2.29, z], [0.045, 3.55, 0.16], yaw, index);
        if(!solidCenter) part(dark, at(0.10,3.5), [span-0.3, 0.05, 0.16], yaw, index);
        if(!entryAt(k*span)) {
          part(material, [a[0]+dx*k/bays, base+2.25, -(a[1]+dy*k/bays)], [0.3, 4.1, 0.54], yaw, index);
          part(reveal, [a[0]+dx*k/bays, base+2.25, -(a[1]+dy*k/bays)], [0.36, 4.1, 0.02], yaw, index);
        }
        // Recessed downlights in the fascia soffit wash the display glass at dusk.
        if(!solidCenter) for (const offset of [-span * 0.28, span * 0.28]) part(spot, along(at(0.26, 4.085), offset), [0.11, 0.015, 0.11], yaw, index, 0, disc);
        if (retailHeight) {
          if (open) {
            const [t0, t1] = open, width = Math.max(0.2, span*(t1-t0)), shift = ((t0+t1)/2-0.5)*span;
            const atc=(depth,height)=>{const p=at(depth,height);p[0]+=dx/length*shift;p[2]-=dy/length*shift;return p;};
            const nearest=world.stores.filter(store=>store.building_id===building.id).sort((left,right)=>Math.hypot(left.facade[0]-x,left.facade[1]+z)-Math.hypot(right.facade[0]-x,right.facade[1]+z))[0];
            part(floor,atc(1.35,0.28),[width,0.10,2.7],yaw,index);
            part(interiors.forCategory(nearest?.category),atc(2.7,2.25),[width,4.0,0.12],yaw,index);
            part(interior,atc(1.35,4.16),[width,0.12,2.7],yaw,index);
            // Warm display strips, ceiling spots and plinths reveal depth through recessed glass.
            part(light,atc(1.35,3.98),[Math.max(0.3,width-0.5),0.025,0.06],yaw,index);
            for (const offset of (width > 2.4 ? [-width * 0.3, 0, width * 0.3] : [0])) part(spot, along(atc(1.6, 4.09), offset), [0.12, 0.02, 0.12], yaw, index, 0, disc);
            if(!entryAt(t*length) && width>1.8) {
              if(['restaurant','ice_cream'].includes(nearest?.category)) {
                part(furniture,atc(1.85,1.04),[1.1,0.055,0.72],yaw,index);
                part(dark,atc(1.85,0.65),[0.06,0.75,0.52],yaw,index);
                for(const side of [-1,1]) {
                  const seat=atc(1.85,0.74);seat[0]+=dx/length*0.8*side;seat[2]-=dy/length*0.8*side;
                  part(furniture,seat,[0.43,0.06,0.43],yaw,index);
                  const back=[...seat];back[0]+=dx/length*0.2*side;back[2]-=dy/length*0.2*side;back[1]+=0.25;
                  part(furniture,back,[0.05,0.5,0.43],yaw,index);
                  const leg=[...seat];leg[1]-=0.23;part(dark,leg,[0.04,0.46,0.35],yaw,index);
                }
              } else {
                part(display,atc(1.75,0.86),[0.8,1.05,0.75],yaw,index);
                displays.push({position:atc(1.75,1.4),yaw:yaw+(winding<0?Math.PI:0),category:nearest?.category,jewelry:['jewelry','fashion_accessories'].includes(nearest?.category)});
              }
            }
            for(const side of [-1,1]) {
              if(entryAt((k+(side>0?1:0))*span)) continue;
              // A room wall already closes the side that borders a boutique.
              if(side<0 ? t0>0.001 : t1<0.999) continue;
              const p=at(1.35,2.2);p[0]+=dx/length*span/2*side;p[2]-=dy/length*span/2*side;
              part(interior,p,[0.08,4.0,2.7],yaw,index);
            }
          }
        }
        // Upper storeys: punched windows with a projecting limestone surround,
        // a deeper sill, a dark reveal frame and divided reflective glazing.
        const width = Math.min(2.2, span - 1.0), height = 1.6;
        // The ceramic diamond field above Van Cleef & Arpels needs blank stone behind it.
        const ceramicField = entries.some(entry => entry.name === 'Van Cleef & Arpels' && Math.abs(entry.along - t * length) < 4.4);
        for (const level of levels) {
          if (ceramicField && level === levels[0]) continue;
          part(upperGlass, at(-0.03, level), [width, height, 0.04], yaw, index);
          part(reveal, at(-0.05, level + height / 2 + 0.02), [width + 0.1, 0.05, 0.08], yaw, index);
          part(reveal, at(-0.05, level - height / 2 - 0.02), [width + 0.1, 0.05, 0.08], yaw, index);
          for (const side of [-1, 1]) part(reveal, along(at(-0.05, level), side * (width / 2 + 0.02)), [0.05, height + 0.1, 0.08], yaw, index);
          part(dark, at(-0.06, level), [0.045, height, 0.05], yaw, index);
          part(dark, at(-0.06, level + height * 0.18), [width, 0.04, 0.05], yaw, index);
          part(stone, at(-0.08, level + height / 2 + 0.16), [width + 0.5, 0.2, 0.16], yaw, index);
          for (const side of [-1, 1]) part(stone, along(at(-0.07, level), side * (width / 2 + 0.16)), [0.2, height + 0.12, 0.14], yaw, index);
          part(stone, at(-0.14, level - height / 2 - 0.12), [width + 0.6, 0.12, 0.3], yaw, index);
        }
      }
    }
  });
  for (const store of world.stores) {
    const [x, north, base] = store.facade, [nx, ny] = store.outward;
    const yaw = Math.atan2(nx, -ny);
    const isDior = store.name === 'Dior', isCartier = store.name === 'Cartier', isVanCleef = store.name === 'Van Cleef & Arpels';
    const isHarry = store.name === 'Harry Winston', isSteak = store.name === 'Steak 48', isColonial = store.name === 'Le Colonial';
    const dining = ['restaurant','ice_cream'].includes(store.category), home = store.category === 'home';
    const material = sign(store.name, isDior || isCartier || isVanCleef || isSteak || isColonial, home); materials.add(material); textures.push(material.map);
    const geometry = new THREE.PlaneGeometry(home ? 4.5 : isColonial ? 4.5 : store.name.length > 17 ? 9 : 7, home || isColonial ? 0.5 : 0.85); geometries.add(geometry);
    const label = new THREE.Mesh(geometry, material);
    label.position.set(x+nx*(isColonial ? 1.4 : 0.3), base+(home || isColonial ? 3.97 : isSteak ? 5.35 : 4.72), -north-ny*(isColonial ? 1.4 : 0.3)); label.rotation.y = yaw;
    label.userData.storeId = store.id; group.add(label);
    // Door hardware and source-specific frontage details provide pedestrian-scale cues.
    const entryFrame = isHarry ? stone : isCartier || isVanCleef ? gold : dark;
    for(const side of [-1,1]) part(entryFrame,[x+nx*0.15-ny*side*0.82,base+1.8,-north-ny*0.15-nx*side*0.82],[0.065,3.2,0.16],yaw);
    if (!isHarry) part(entryFrame,[x+nx*0.15,base+3.38,-north-ny*0.15],[1.7,0.06,0.16],yaw);
    const room = roomById.get(store.id);
    if (room) {
      // A single pivot leaf that swings inward as a visitor approaches, so the
      // walk-in room stays reachable while the closed door reflects the street.
      const pivot = new THREE.Group();
      pivot.position.set(x+ny*0.85+nx*0.2, base, -north+nx*0.85-ny*0.2); pivot.rotation.y = yaw;
      const leaf = new THREE.Mesh(pane, glass); leaf.position.set(0.85, 1.8, 0); leaf.scale.set(1.7, 3.0, 1); leaf.userData.storeId = store.id; leaf.userData.breakableGlass = true; leaf.userData.breakableGlassDynamic = true;
      const pull = new THREE.Mesh(box, isCartier || isVanCleef ? gold : dark); pull.position.set(1.52, 1.45, 0.06); pull.scale.set(0.03, 0.9, 0.03); pull.userData.storeId = store.id;
      const rail = new THREE.Mesh(box, isCartier || isVanCleef ? gold : dark); rail.position.set(0.85, 0.32, 0); rail.scale.set(1.68, 0.06, 0.05); rail.userData.storeId = store.id;
      pivot.add(leaf, pull, rail); pivot.userData.storeId = store.id; group.add(pivot);
      doors.push({ pivot, yaw, angle: 0, hinge: new THREE.Vector3(x+nx*0.2, base+1.2, -north-ny*0.2) });
    } else {
      part(glass, [x+nx*0.26, base+1.8, -north-ny*0.26], [1.5, 3.0, 0.09], yaw);
      part(entryFrame, [x+nx*0.24, base+1.8, -north-ny*0.24], [0.04, 3.0, 0.08], yaw);
      for (const side of [-1, 1]) part(gold, [x+nx*0.36-ny*side*0.12, base+1.15, -north-ny*0.36-nx*side*0.12], [0.03, 0.9, 0.03], yaw);
    }
    // Threshold, entrance mat and a recessed downlight over every door.
    part(bulkhead, [x+nx*0.55, base+0.16, -north-ny*0.55], [1.9, 0.03, 0.9], yaw);
    part(velvet, [x+nx*1.25, base+0.165, -north-ny*1.25], [1.3, 0.012, 0.75], yaw);
    part(spot, [x+nx*0.45, base+4.11, -north-ny*0.45], [0.13, 0.015, 0.13], yaw, -1, 0, disc);
    if (!isDior && !isCartier && !isVanCleef && !isHarry && !isColonial && !dining && !home) {
      // A sloped fabric awning with a valance and tie rods; not a flat slab.
      const pitch = 0.32, run = 1.45, drop = Math.sin(pitch) * run / 2;
      part(canvas, [x+nx*(0.15+run/2*Math.cos(pitch)), base+4.0-drop, -north-ny*(0.15+run/2*Math.cos(pitch))], [4.6, 0.03, run], yaw, -1, pitch);
      part(canvas, [x+nx*(0.15+run*Math.cos(pitch)), base+4.0-drop*2-0.13, -north-ny*(0.15+run*Math.cos(pitch))], [4.62, 0.26, 0.03], yaw);
      for (const side of [-1, 1]) {
        const across = side * 2.2;
        part(dark, [x-ny*across+nx*(0.15+run/2*Math.cos(pitch)), base+4.0-drop, -north-nx*across-ny*(0.15+run/2*Math.cos(pitch))], [0.035, 0.035, run], yaw, -1, pitch);
        part(dark, [x-ny*across+nx*0.69, base+4.22, -north-nx*across-ny*0.69], [0.025, 0.025, 1.92], yaw, -1, 0.78);
      }
    }
    if (isColonial) part(navy, [x+nx*0.65, base+4.02, -north-ny*0.65], [4.6, 0.09, 1.4], yaw);
    if (!dining && !isColonial) for (const side of [-1, 1]) {
      // Clipped boxwood in limestone planters flank each boutique entrance.
      const across = side * 1.6;
      part(planter, [x-ny*across+nx*1.05, base+0.44, -north-nx*across-ny*1.05], [0.62, 0.56, 0.62], yaw);
      for (const [dx, dy, dz, scale, spin] of hedgeClusters(0.56, 0.56, 0.5, 11 + side)) part(hedge, [x-ny*(across+dx)+nx*(1.05+dz), base+0.98+dy, -north-nx*(across+dx)-ny*(1.05+dz)], scale, yaw + spin, -1, 0, lobe);
    }
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
  for (const { material, geometry, parts } of batches.values()) {
    const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
    mesh.name = `facade:${material.name}`;
    mesh.userData.breakableGlass = material === glass || material === upperGlass;
    mesh.userData.buildingIndices = parts.map(part => part.buildingIndex);
    parts.forEach((part, index) => { dummy.position.fromArray(part.position); dummy.scale.fromArray(part.scale); dummy.rotation.set(part.pitch, part.yaw, 0, 'YXZ'); dummy.updateMatrix(); mesh.setMatrixAt(index, dummy.matrix); });
    mesh.castShadow = material !== glass && material !== light && material !== spot; mesh.receiveShadow = true; mesh.userData.aoExclude = material === glass; group.add(mesh);
  }
  const reflectionMaterials = [glass, upperGlass];
  const interiorGroup = buildStoreInteriors(rooms, { atlas: interiors, reflectionMaterials });
  group.userData.reflectionMaterials = reflectionMaterials;
  const reflective = [];
  for (const root of [group, interiorGroup]) root.traverse(mesh => { if (mesh.material && reflectionMaterials.includes(mesh.material)) reflective.push(mesh); });
  group.userData.reflectionExclusions = reflective;
  group.userData.interiors = interiorGroup;
  group.userData.rooms = rooms;
  group.userData.updateDoors = (positions, delta) => {
    const step = 1 - Math.exp(-5 * Math.min(delta, 0.1));
    for (const door of doors) {
      const near = positions.some(position => position && position.distanceToSquared(door.hinge) < 2.8 * 2.8);
      door.angle += ((near ? 1.5 : 0) - door.angle) * step;
      door.pivot.rotation.y = door.yaw + door.angle;
    }
  };
  group.add(buildRetailDisplays(displays));
  group.userData.dispose = () => {
    interiorGroup.userData.dispose();
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

// A bench and lamp column beside every third storefront, on the pavement: the
// first of a few spots off the shopfront that clears every drawn road, lamp
// arm included. A storefront with no clear spot simply goes without.
export function storefrontBenchSpots(world) {
  const spots = [];
  world.stores.forEach((store, index) => {
    if (index % 3) return;
    const [nx, ny] = store.outward;
    const candidates = [];
    for (const out of [2.8, 1.8, 1.1]) for (const along of [4, -4, 6.5, -6.5, 9, -9]) candidates.push([out, along]);
    for (const [out, along] of candidates) {
      const x = store.visit[0] + nx * out + ny * along, north = store.visit[1] + ny * out - nx * along;
      const lamp = [x + nx * 1.2, north + ny * 1.2];
      if (clearOfRoads(world, x, -north, 1.2) && clearOfRoads(world, lamp[0], -lamp[1], 0.9)) { spots.push({ storeId: store.id, x, north, outward: [nx, ny] }); return; }
    }
  });
  return spots;
}

export function buildDistrictDetail(world) {
  const group = new THREE.Group(), objects = [];
  const dummy = new THREE.Object3D();
  const bronze = new THREE.MeshStandardMaterial({ color: RETRO.deepTeal, roughness: 0.55, metalness: 0.6 });
  const timber = new THREE.MeshStandardMaterial({ color: RETRO.ivory, roughness: 0.85 });
  const box = new THREE.BoxGeometry(1, 1, 1);
  for (const spot of storefrontBenchSpots(world)) {
    const { x, north, outward: [nx, ny] } = spot;
    const ground = groundSurfaceHeight(world,x,-north), yaw = Math.atan2(nx, -ny);
    for (let i = 0; i < 5; i++) objects.push({ material: timber, p: [x+nx*(i-2)*0.11, ground+0.5, -north-ny*(i-2)*0.11], s: [1.8, 0.06, 0.09], yaw });
    for (const side of [-1, 1]) objects.push({ material: bronze, p: [x+ny*side*0.65, ground+0.25, -north+nx*side*0.65], s: [0.1, 0.5, 0.5], yaw });
    objects.push({ material: bronze, p: [x+nx*1.2, ground+2.6, -north-ny*1.2], s: [0.1, 5.2, 0.1], yaw });
    objects.push({ material: bronze, p: [x+nx*1.2, ground+5.25, -north-ny*1.2], s: [0.55, 0.12, 0.65], yaw });
  }
  for (const material of [bronze, timber]) {
    const parts = objects.filter(p => p.material === material), mesh = new THREE.InstancedMesh(box, material, parts.length);
    parts.forEach((p,i) => { dummy.position.fromArray(p.p); dummy.scale.fromArray(p.s); dummy.rotation.set(0,p.yaw,0); dummy.updateMatrix(); mesh.setMatrixAt(i,dummy.matrix); });
    mesh.castShadow = mesh.receiveShadow = true; group.add(mesh);
  }
  return group;
}
