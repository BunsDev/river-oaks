import { buildRoofGrasses } from './roof-grasses.js';
import { roofFieldGeometry } from './roof-field-mesh.js';
import { hermesPavilionRing } from './hermes-roof-surface.js';
import * as THREE from 'three';
import { referencePlan, visibleRoofHeight } from './reference-facades.js';
import { plantingRandom, plantRecord, seedFromPosition } from './planting-palette.js';
import { buildProceduralPlants } from './procedural-plants.js';
import { physicalSurface } from './materials.js';
import { spatialInstanceBatches } from './spatial-instances.js';

// Authored scenery, deliberately independent of the observed vegetation inventory.
// Only reviewed roof surfaces participate. Other tiers are excluded, never guessed.
export const ROOF_TREATMENTS = Object.freeze({
  'osm-way-625330785': 'garden',
  'osm-way-625330792': 'islands',
  'osm-way-625330798': 'islands',
  'osm-way-625333009': 'groundcover',
});
const MARGIN = 1.5;
function inside([x, n], ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > n) !== (b[1] > n) && x < (b[0] - a[0]) * (n - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}
function edgeDistance(p, a, b) {
  const dx = b[0] - a[0], dn = b[1] - a[1], length = dx * dx + dn * dn;
  const t = length ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dn) / length)) : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dn);
}
const boundaryDistance = (p, ring) => Math.min(...ring.map((a, i) => edgeDistance(p, a, ring[(i + 1) % ring.length])));
// Testing the complete bounding disc against every boundary handles concavity
// and voids without corner-only containment or polygon clipping tolerances.
export function roofDiscFits(surface, point, radius) {
  return inside(point, surface.ring) && boundaryDistance(point, surface.ring) >= radius + MARGIN
    && surface.voids.every(ring => !inside(point, ring) && boundaryDistance(point, ring) >= radius + MARGIN)
    && surface.services.every(({ at, radius: reach }) => Math.hypot(point[0] - at[0], point[1] - at[1]) >= radius + reach);
}

// Mirrors the district renderer's equipment locations. Radius includes the rotated
// cabinet's whole footprint and a 1 m service route, not merely its centre.
export function roofServices(building, ring = building.ring) {
  const corners = ring.slice(0, -1), center = corners.reduce((sum, p) => [sum[0] + p[0] / corners.length, sum[1] + p[1] / corners.length], [0, 0]);
  return [
    ...corners.map(([x, n], i) => ({ at: [center[0] + (x - center[0]) * (i % 2 ? .42 : .3), center[1] + (n - center[1]) * (i % 2 ? .42 : .3)], radius: Math.hypot(...(i % 2 ? [1.2, .7] : [.8, .8])) + 1 })),
    { at: [center[0] + (corners[0][0] - center[0]) * .12, center[1] + (corners[0][1] - center[1]) * .12], radius: Math.hypot(1.6, 1.6) + 1 },
    { at: building.center.slice(0, 2), radius: 4 }, // existing dome/antenna
  ];
}
export function greenRoofPlan(world) {
  const plan = referencePlan(world), surfaces = [], exclusions = [];
  for (const building of world.buildings ?? []) {
    const treatment = ROOF_TREATMENTS[building.id], step = plan.steps.get(building.id);
    if (!treatment || (treatment === 'garden' && !step)) {
      exclusions.push({ id: building.id, reason: treatment ? 'Lower wing surface unavailable' : 'Surface not reviewed; preserve existing architecture' });
      continue;
    }
    const pavilion = building.id === 'osm-way-625330792' ? plan.frontages.find(f => f.kind === 'hermes') : null;
    if (building.id === 'osm-way-625330792' && !pavilion) { exclusions.push({ id: building.id, reason: 'Pavilion footprint unavailable' }); continue; }
    const height = step?.height ?? visibleRoofHeight(world, building);
    const surface = { id: building.id, treatment, ring: building.ring, voids: step ? [step.ring] : pavilion ? [hermesPavilionRing(pavilion)] : [], y: building.center[2] + height + .02,
      services: step ? [] : roofServices(building), fieldDepth: treatment === 'garden' ? .28 : .14, beds: [], fields: [], paths: [], seats: [] };
    const xs = surface.ring.map(p => p[0]), ns = surface.ring.map(p => p[1]);
    const rand = plantingRandom(seedFromPosition(...building.center)), spacing = treatment === 'groundcover' ? 5 : 7;
    // Staggered islands flank a continuous, gently winding maintenance path.
    const mid = (Math.min(...xs) + (step ? Math.min(...step.ring.map(p => p[0])) : Math.max(...xs))) / 2;
    const pathX = n => mid + Math.sin((n - Math.min(...ns)) / 13) * 2;
    const authored = {
      'osm-way-625330792': [[.22,.15,2.8],[.7,.15,3.1],[.72,.42,2.6],[.8,.66,2.6],[.8,.86,2.6]],
      'osm-way-625330798': [[.22,.12,3.2],[.78,.23,3.4],[.2,.4,3.0],[.8,.57,3.5],[.22,.75,3.1],[.78,.88,3.2]],
    }[building.id];
    const candidates = authored ? authored.map(([u,v,radius]) => ({ at: [Math.min(...xs)+u*(Math.max(...xs)-Math.min(...xs)), Math.min(...ns)+v*(Math.max(...ns)-Math.min(...ns))], radius })) : [];
    if (!authored) for (let n = Math.min(...ns)+3.5,row=0; n < Math.max(...ns)-3; n+=spacing,row++) {
      for (let x = Math.min(...xs)+3.5+(row%2)*spacing/2; x < Math.max(...xs)-3; x+=spacing) {
        const radius = treatment === 'groundcover' ? 1.8+rand()*.5 : 2+rand()*.8;
        if (Math.abs(x-pathX(n)) >= radius+1.2) candidates.push({at:[x,n],radius});
      }
    }
    surface.skippedIslands = [];
    for (const candidate of candidates) {
      if (!roofDiscFits(surface,candidate.at,candidate.radius)) { surface.skippedIslands.push({...candidate,reason:'Boundary, tier or service clearance'}); continue; }
      surface.beds.push({...candidate,depth:treatment === 'groundcover' ? .16 : .38,seed:Math.floor(rand()*4294967296)});
    }
    // Connected low planting fields fill the spaces between the larger islands.
    // Cell centres are fixed in world metres; every whole cell is validated.
    const cell = 1.4, reach = cell / Math.SQRT2;
    for (let n = Math.min(...ns) + 2; n < Math.max(...ns) - 2; n += cell) {
      for (let x = Math.min(...xs) + 2; x < Math.max(...xs) - 2; x += cell) {
        const outerRight = step ? Math.min(...step.ring.map(p => p[0])) : Math.max(...xs);
        if (x < Math.min(...xs)+2.4+.9*(1+Math.sin(n/5)) || x > outerRight-2.4-.9*(1+Math.sin(n/7))) continue;
        if (Math.abs(x - pathX(n)) < reach + 1.1 || !roofDiscFits(surface, [x,n], reach)) continue;
        surface.fields.push({ at: [x,n], size: cell, radius: reach });
      }
    }
    if (treatment === 'garden') for (const n of [Math.min(...ns)+5, Math.max(...ns)-5]) {
      const at = [pathX(n),n], radius = 1.3;
      if (roofDiscFits(surface,at,radius) && surface.beds.every(b => Math.hypot(at[0]-b.at[0],at[1]-b.at[1]) > radius+b.radius)) surface.seats.push({at,radius});
    }
    surface.fields = surface.fields.filter(f => surface.seats.every(s => Math.hypot(f.at[0]-s.at[0], f.at[1]-s.at[1]) > f.radius+s.radius));
    if (treatment === 'garden') for (let n = Math.min(...ns)+3; n < Math.max(...ns)-3; n += .35) {
      const at = [pathX(n),n];
      if (roofDiscFits(surface, at, 1.1)) surface.paths.push(at);
    }
    surfaces.push(surface);
  }
  return { surfaces, exclusions };
}

export function buildGreenRoofs(world) {
  const group = new THREE.Group(); group.name = 'Authored green roof gardens';
  const plan = greenRoofPlan(world); group.userData.roofPlan = plan;
  if (!plan.surfaces.some(surface => surface.beds.length || surface.fields.length)) return group;
  const box = new THREE.BoxGeometry(1,1,1), cylinder = new THREE.CylinderGeometry(1, 1, 1, 24), batches = new Map(), placements = [], grasses = [];
  const materials = {
    field: physicalSurface('grass', { instanced: true, tileSize: 1.8, color: '#b7cfa3', textureContrast: .35, normalScale: new THREE.Vector2(.3,.3), roughness: 1, variation: .1 }),
    path: physicalSurface('stone', { instanced: true, tileSize: 2, color: '#fff5df', textureContrast: .15, normalScale: new THREE.Vector2(.15,.15), roughness: .85 }),
    wood: new THREE.MeshStandardMaterial({ color: '#8b6948', roughness: .8 }),
    bronze: new THREE.MeshStandardMaterial({ color: '#756047', metalness: .55, roughness: .65 }),
    soil: new THREE.MeshStandardMaterial({ color: '#38382b', roughness: 1 }),
    cover: new THREE.MeshStandardMaterial({ color: '#536c40', roughness: 1 }),
  };
  const add = (kind, position, scale, color, yaw = 0) => {
    if (!batches.has(kind)) batches.set(kind, []);
    batches.get(kind).push({ position, scale, color, yaw });
  };
  for (const surface of plan.surfaces) {
    if (surface.fields.length) {
      const field = new THREE.Mesh(roofFieldGeometry(surface.fields, { depth: surface.fieldDepth }), materials.field);
      field.name = 'Roof field'; field.position.y = surface.y; field.receiveShadow = true;
      field.userData.roofSurface = surface.id; group.add(field);
    }
    if (surface.treatment === 'garden') {
      const south = Math.min(...surface.ring.map(p=>p[1])), west = Math.min(...surface.ring.map(p=>p[0]));
      // Two authored garden pockets, with grouped planting bands rather than
      // scatter over the whole roof. Keep their maintenance/seat gaps intact.
      for (const field of surface.fields) {
        const [x,n] = field.at, row = Math.round((n-south)/field.size), column = Math.round((x-west)/field.size);
        const pocket = [south+10,south+27].some(center=>Math.abs(n-center)<4.5);
        if (!pocket || row%2 || column%2) continue;
        const rand = plantingRandom(seedFromPosition(x,n)), origin = [x,surface.y+surface.fieldDepth+.02,-n];
        if (column%3 === 0) grasses.push({origin,seed:Math.floor(rand()*4294967296)});
        else {
          const species = row%6 === 0 ? 'agave' : column%3 === 1 ? 'mound-fern' : 'foxtail-fern';
          placements.push({plant:plantRecord(species,[0,0],rand,.55),origin,yaw:0});
        }
      }
    }
    for (let i = 1; i < surface.paths.length; i++) {
      const a = surface.paths[i-1], b = surface.paths[i], dx = b[0]-a[0], dn = b[1]-a[1], length = Math.hypot(dx,dn);
      if (length > .5) continue; // never bridge an unsupported gap
      add('path', [(a[0]+b[0])/2,surface.y+.05,-(a[1]+b[1])/2], [1.7,.1,length+.025], undefined, -Math.atan2(dx,dn));
    }
    for (const {at:[x,n]} of surface.seats) {
      add('wood',[x,surface.y+.48,-n],[2.2,.12,.55]);
      for (const side of [-1,1]) add('bronze',[x+side*.8,surface.y+.22,-n],[.1,.44,.4]);
    }
  }
  for (const surface of plan.surfaces) for (const bed of surface.beds) {
    const [x, n] = bed.at, y = surface.y, r = bed.radius, d = bed.depth, rand = plantingRandom(bed.seed);
    add('bronze', [x, y + d / 2, -n], [r, d, r]);
    add('soil', [x, y + d, -n], [r - .08, .035, r - .08]);
    add('cover', [x, y + d + .035, -n], [r - .14, .055, r - .14], new THREE.Color().setHSL(.25 + rand() * .07, .25, .24 + rand() * .09));
    if (surface.treatment === 'groundcover') continue;
    const count = Math.min(28, Math.ceil(r*r*3));
    for (let i = 0; i < count; i++) {
      const angle = i * 2.399963, distance = Math.sqrt(i / count) * (r - .6), species = i % 7 === 0 ? 'pentas' : i % 3 === 0 ? 'agave' : i % 2 ? 'mound-fern' : 'foxtail-fern';
      if (i % 4 === 1) {
        grasses.push({ origin: [x + Math.cos(angle)*distance, y+d+.07, -n + Math.sin(angle)*distance], seed: Math.floor(rand()*4294967296) });
        continue;
      }
      const plant = plantRecord(species, [0, 0], rand, .45);
      placements.push({ plant, origin: [x + Math.cos(angle) * distance, y + d + .07, -n + Math.sin(angle) * distance], yaw: angle });
    }
  }
  const dummy = new THREE.Object3D();
  for (const [kind, records] of batches) {
    const geometry = ['field','path','wood'].includes(kind) ? box : cylinder;
    const source = new THREE.InstancedMesh(geometry, materials[kind], records.length);
    source.name = `Roof ${kind}`; source.receiveShadow = true;
    records.forEach((record, i) => { dummy.position.fromArray(record.position); dummy.scale.fromArray(record.scale); dummy.rotation.set(0,record.yaw,0); dummy.updateMatrix(); source.setMatrixAt(i, dummy.matrix); if (record.color) source.setColorAt(i, record.color); });
    group.add(...spatialInstanceBatches(source, 32)); source.dispose();
  }
  // Broad fields remain at every distance. Fine leaves only submit near the
  // current camera, including each cubemap face, with no asset-loading race.
  for (const mesh of [...buildProceduralPlants(placements), ...buildRoofGrasses(grasses)]) {
    mesh.computeBoundingSphere();
    const center = mesh.boundingSphere.center.clone(), lod = new THREE.LOD();
    lod.name = 'Roof planting detail'; lod.position.copy(center); mesh.position.sub(center);
    lod.addLevel(mesh, 0); lod.addLevel(new THREE.Group(), 55); group.add(lod);
  }
  return group;
}
