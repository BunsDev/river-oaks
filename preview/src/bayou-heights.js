import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';
import { RETRO } from './retro-palette.js';
import { buildCityKit, cityKitLandscape, cullPlanting, disposeLandscape } from './city-kit/render.js';
import { buildMatureTrees, buildPlanterPlanting } from './landscape-models.js';

// Heights street trees, and their sun shadows, draw only within the kit's block-detail
// distance. Each twelve-metre batch is a draw call at every distance, and from the
// District the hundreds beyond it cost CPU-rendered clients most of their frame rate.
export const HEIGHTS_TREE_METRES = KIT_CONVENTIONS.lod.detailMetres;
// Planted beds stand under a metre tall. Beyond the trees' middle detail level they are a
// few pixels, yet across Heights' 329 beds they are over a million triangles in each pass.
export const HEIGHTS_PLANTING_METRES = KIT_CONVENTIONS.lod.treeMetres[1];
const headless = typeof document === 'undefined';
const distanceToRect = ([w, s, e, n], east, north) => Math.hypot(Math.max(w - east, 0, east - e), Math.max(s - north, 0, north - n));
const near = (mesh, position) => position.distanceTo(mesh.boundingSphere.center) - mesh.boundingSphere.radius < HEIGHTS_TREE_METRES;

/**
 * One Bayou Heights neighborhood (a plan in layout.heights.plans), streamed as its own
 * chunk by heights-stream.js. Its street trees and planting draw in buildHeightsLandscape.
 */
export function buildHeightsNeighborhood(layout, plan) {
  const kit = buildCityKit(plan, { groundAt: () => layout.ground, ground: layout.ground, landscape: false });
  kit.name = `bayou-heights/${plan.id}`;
  return kit;
}

/**
 * What the Heights neighborhoods share, streamed as one chunk: the authored footbridge,
 * bandstand and Heights Hall, and every street tree and planted bed. Built once, the
 * tree and planting models are cloned once rather than in each neighborhood. A tree or
 * planting batch draws only while its neighborhood does, and only near the camera.
 */
export function buildHeightsLandscape(layout) {
  const group = new THREE.Group(); group.name = 'bayou-heights/landscape';
  const { heights, ground } = layout, trees = [], planters = [];
  for (const plan of heights.plans) {
    const placements = cityKitLandscape(plan, { groundAt: () => ground, ground });
    trees.push(...placements.trees); planters.push(...placements.planters);
  }
  // As in the kit, headless builds (Node tests) load no models and count placements only.
  const treeGroup = headless ? Object.assign(new THREE.Group(), { userData: { shadowProxies: [] } }) : buildMatureTrees({}, trees);
  treeGroup.name = 'bayou-heights trees'; treeGroup.userData.placements = trees.length; group.add(treeGroup);
  const planting = planters.length && !headless ? buildPlanterPlanting(planters) : new THREE.Group();
  planting.name = 'bayou-heights planting'; group.add(planting);
  const landmarks = buildLandmarks(layout); group.add(landmarks);
  group.userData.plantingModules = planters.length;
  group.userData.ready = Promise.all([treeGroup.userData.ready, planting.userData.ready]);
  // A batch belongs to the neighborhood whose site is nearest its centre; batches arrive after loading.
  const owners = new Map(), ownerOf = mesh => {
    if (!owners.has(mesh)) {
      const { x, z } = mesh.boundingSphere.center;
      owners.set(mesh, heights.plans.reduce((best, plan) => distanceToRect(plan.site, x, -z) < distanceToRect(best.site, x, -z) ? plan : best).id);
    }
    return owners.get(mesh);
  };
  // main.js reads this list for every shadow pass; update() rebuilds it from the near batches.
  const shadowProxies = [];
  let proxies = new Set();
  // `drawn` holds the ids of the neighborhoods attached now.
  group.userData.update = (position, drawn) => {
    shadowProxies.length = 0;
    treeGroup.userData.update?.(position);
    if (proxies.size !== treeGroup.userData.shadowProxies.length) proxies = new Set(treeGroup.userData.shadowProxies);
    // The trees have just chosen each batch's level; far batches, and unattached neighborhoods', are not drawn.
    for (const mesh of treeGroup.children) {
      if (!mesh.boundingSphere) continue;
      const shown = drawn.has(ownerOf(mesh)) && near(mesh, position);
      if (proxies.has(mesh)) { if (shown) shadowProxies.push(mesh); }
      else if (mesh.visible && !shown) mesh.visible = false;
    }
    cullPlanting(planting, position, HEIGHTS_PLANTING_METRES, mesh => drawn.has(ownerOf(mesh)));
  };
  group.userData.shadowProxies = shadowProxies;
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return; disposed = true;
    disposeLandscape([treeGroup, planting]);
    treeGroup.userData.shadowProxies.length = 0; shadowProxies.length = 0; owners.clear();
    landmarks.userData.dispose(); group.clear();
  };
  group.userData.stats = () => {
    let meshes = 0, triangles = 0;
    group.traverse(item => { if (item.isMesh && item.visible) { meshes++; triangles += (item.geometry.index?.count ?? item.geometry.attributes.position.count) / 3 * (item.count ?? 1); } });
    return { meshes, triangles: Math.round(triangles) };
  };
  return group;
}

// The footbridge deck structure under the kit paving, the bayou beneath it, the
// bandstand on the green and Heights Hall's clock tower, in the Commons materials.
// They always draw, so the parts merge into one mesh per material (and shadow choice).
function buildLandmarks(layout) {
  const group = new THREE.Group(); group.name = 'bayou-heights/landmarks';
  const { heights, ground } = layout, geometries = [], buckets = new Map(), materials = {
    stone: new THREE.MeshStandardMaterial({ color: RETRO.ivory, roughness: .85 }),
    rail: new THREE.MeshStandardMaterial({ color: RETRO.teal, roughness: .45, metalness: .35 }),
    brass: new THREE.MeshStandardMaterial({ color: RETRO.brass, roughness: .4, metalness: .6 }),
    water: new THREE.MeshPhysicalMaterial({ color: '#3e5f55', roughness: .12, metalness: .1, clearcoat: 1 }),
    bank: new THREE.MeshStandardMaterial({ color: '#6f8f58', roughness: 1 }),
    roof: new THREE.MeshStandardMaterial({ color: RETRO.deepTeal, roughness: .6 }),
    brick: new THREE.MeshStandardMaterial({ color: '#a9826e', roughness: .9 }),
    glass: new THREE.MeshStandardMaterial({ color: RETRO.glass, roughness: .2, metalness: .2 }),
    face: new THREE.MeshStandardMaterial({ color: RETRO.porcelain, roughness: .5, emissive: '#fff1d0', emissiveIntensity: .25 }),
  };
  for (const [name, material] of Object.entries(materials)) material.name = `bayou-heights/${name}`;
  const add = (name, geometry, material, east, up, north, yaw = 0, castShadow = true) => {
    geometry.rotateY(yaw).translate(east, up, -north);
    const key = `${material.name}${castShadow ? '' : '/no-shadow'}`;
    if (!buckets.has(key)) buckets.set(key, { material, castShadow, parts: [], names: [] });
    buckets.get(key).parts.push(geometry); buckets.get(key).names.push(`bayou-heights/${name}`);
  };
  const box = (name, [w, s, e, n], bottom, top, material) => add(name, new THREE.BoxGeometry(e - w, top - bottom, n - s), material, (w + e) / 2, (bottom + top) / 2, (s + n) / 2);

  // Lantern Footbridge: water and banks continue under the deck (the kit bayou parts there),
  // two abutments, a central pier, a girder deck and teal railings with brass caps.
  const [dw, ds, de, dn] = heights.footbridge.deck, mid = (dw + de) / 2;
  box('bayou-under-bridge', [dw + 3.2, ds, de - 6, dn], ground - 2.7, ground - 2.6, materials.water);
  box('near-bank-under-bridge', [dw + .2, ds, dw + 5, dn], ground - 2.8, ground - 1.35, materials.bank);
  box('far-bank-under-bridge', [de - 6, ds, de, dn], ground - 2.8, ground + .2 - .3, materials.bank);
  box('footbridge-deck', [dw, ds - .2, de, dn + .2], ground - .7, ground - .02, materials.stone);
  box('footbridge-abutment-w', [dw, ds - .6, dw + 3, dn + .6], ground - 2.8, ground - .7, materials.stone);
  box('footbridge-abutment-e', [de - 3, ds - .6, de, dn + .6], ground - 2.8, ground - .7, materials.stone);
  box('footbridge-pier', [mid - .8, ds + .4, mid + .8, dn - .4], ground - 2.9, ground - .7, materials.stone);
  for (const side of [ds - .05, dn + .05]) {
    const edge = [dw + .3, side - .06, de - .3, side + .06];
    box(`footbridge-rail-${side < 0 ? 's' : 'n'}`, edge, ground + 1.0, ground + 1.08, materials.rail);
    box(`footbridge-midrail-${side < 0 ? 's' : 'n'}`, edge, ground + .5, ground + .55, materials.rail);
    for (let x = dw + .3; x <= de - .3 + 1e-6; x += (de - dw - .6) / 16) box(`footbridge-post-${side < 0 ? 's' : 'n'}-${Math.round(x * 10)}`, [x - .05, side - .05, x + .05, side + .05], ground, ground + 1.0, materials.rail);
    for (const x of [dw + .3, de - .3]) {
      add(`footbridge-lamp-${side < 0 ? 's' : 'n'}-${x < mid ? 'w' : 'e'}`, new THREE.CylinderGeometry(.07, .09, 3.6, 10), materials.brass, x, ground + 1.8, side);
      add(`footbridge-lamp-glow-${side < 0 ? 's' : 'n'}-${x < mid ? 'w' : 'e'}`, new THREE.SphereGeometry(.26, 14, 10), materials.face, x, ground + 3.75, side);
    }
  }

  // Heights Bandstand: an octagonal stage with a south step, eight posts and a pyramid
  // roof with a cupola. Everything but the eave stays inside its solid footprint and height.
  const [bw, bs, be, bn] = heights.bandstand.rect, bx = (bw + be) / 2, by = (bs + bn) / 2, rise = 1.1, eave = rise + 3.4, oct = Math.PI / 8;
  const radius = (Math.min(be - bw, bn - bs) / 2 - .6) / Math.cos(oct), peak = ground + heights.bandstand.height;
  add('bandstand-stage', new THREE.CylinderGeometry(radius, radius, rise, 8), materials.stone, bx, ground + rise / 2, by, oct);
  add('bandstand-step', new THREE.BoxGeometry(2.4, .55, .6), materials.stone, bx, ground + .275, bs + .3);
  add('bandstand-trim', new THREE.CylinderGeometry(radius + .05, radius + .05, .1, 8), materials.brass, bx, ground + rise, by, oct);
  for (let i = 0; i < 8; i++) {
    const angle = oct + i * Math.PI / 4, r = radius - .45;
    add(`bandstand-post-${i}`, new THREE.CylinderGeometry(.11, .13, 3.4, 10), materials.stone, bx + Math.sin(angle) * r, ground + rise + 1.7, by + Math.cos(angle) * r);
  }
  add('bandstand-fascia', new THREE.CylinderGeometry(radius + .25, radius + .25, .35, 8, 1, true), materials.rail, bx, ground + eave + .15, by, oct);
  add('bandstand-roof', new THREE.ConeGeometry(radius + .55, 2.1, 8), materials.roof, bx, ground + eave + .3 + 1.05, by, oct);
  add('bandstand-cupola', new THREE.CylinderGeometry(.45, .45, .5, 8), materials.brass, bx, peak - .75, by, oct);
  add('bandstand-finial', new THREE.ConeGeometry(.3, .5, 8), materials.brass, bx, peak - .25, by, oct);

  // Heights Hall: a two-storey brick hall facing Nineteenth Street with a clock tower.
  const [hw, hs, he, hn] = heights.hall.rect, [tw, ts, te, tn] = heights.hall.tower;
  box('hall', [hw, hs, he, hn], ground - .5, ground + 9, materials.brick);
  box('hall-cornice', [hw - .2, hs - .2, he + .2, hn + .2], ground + 9, ground + 9.5, materials.stone);
  box('hall-entry', [hw - .08, -1.8 + (hs + hn) / 2, hw, 1.8 + (hs + hn) / 2], ground, ground + 3.6, materials.glass);
  for (const [side, north] of [['s', hs + 2.2], ['n', hn - 2.2]]) for (const [floor, level] of [[1, ground + 1.2], [2, ground + 5.2]]) box(`hall-window-${side}-${floor}`, [hw - .06, north - .9, hw, north + .9], level, level + 2.4, materials.glass);
  const top = ground + heights.hall.height;
  box('hall-tower', [tw, ts, te, tn], ground + 9, top - 5.5, materials.brick);
  box('hall-belfry', [tw + .3, ts + .3, te - .3, tn - .3], top - 5.5, top - 3, materials.stone);
  const towerX = (tw + te) / 2, towerY = (ts + tn) / 2, half = (te - tw) / 2;
  // A circle faces +z (south); each clock turns to face outward.
  for (const [dx, dy, yaw] of [[-1, 0, -Math.PI / 2], [1, 0, Math.PI / 2], [0, -1, 0], [0, 1, Math.PI]]) {
    add(`hall-clock-${dx}${dy}`, new THREE.CircleGeometry(1.35, 32), materials.face, towerX + dx * (half + .02), top - 8, towerY + dy * (half + .02), yaw, false);
  }
  add('hall-spire', new THREE.ConeGeometry(half * 1.15, 3, 4), materials.roof, towerX, top - 1.5, towerY, Math.PI / 4);

  for (const [key, { material, castShadow, parts, names }] of buckets) {
    const geometry = mergeGeometries(parts); parts.forEach(part => part.dispose()); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `bayou-heights/landmarks/${key.replace('bayou-heights/', '')}`;
    mesh.castShadow = castShadow; mesh.receiveShadow = true; mesh.userData.parts = names; group.add(mesh);
  }
  group.userData.parts = [...buckets.values()].flatMap(bucket => bucket.names);
  group.userData.dispose = () => { for (const geometry of geometries) geometry.dispose(); for (const material of Object.values(materials)) material.dispose(); group.clear(); };
  return group;
}
