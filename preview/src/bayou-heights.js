import * as THREE from 'three';
import { commonsBaseLayout } from '../../shared/bayou-heights.js';
import { RETRO } from './retro-palette.js';
import { buildCityKit } from './city-kit/render.js';
import { buildEastGardenCommons } from './east-garden-commons.js';

export { attachBayouHeights, detachBayouHeights } from './bayou-heights-world.js';

// A neighborhood beyond this distance from the camera is not drawn at all; nearer,
// the kit's own block detail and tree levels apply. The landmarks always draw.
export const HEIGHTS_VISIBLE_METRES = 300;
const distanceToRect = ([w, s, e, n], east, north) => Math.hypot(Math.max(w - east, 0, east - e), Math.max(s - north, 0, north - n));

/**
 * Bayou Market Commons with the footbridge opening, plus Bayou Heights: its kit
 * neighborhoods (layout.heights.plans) and the authored footbridge, bandstand and
 * Heights Hall. The scene contract matches buildEastGardenCommons.
 */
export function buildBayouHeights(layout) {
  const group = new THREE.Group(); group.name = 'Bayou Heights';
  const { heights, ground } = layout;
  const commons = buildEastGardenCommons({ ...commonsBaseLayout(layout), destination: layout.destination });
  group.add(commons);
  const parts = heights.plans.map(plan => {
    const kit = buildCityKit(plan, { groundAt: () => ground, ground });
    kit.name = `bayou-heights/${plan.id}`; group.add(kit);
    return { kit, site: plan.site };
  });
  const landmarks = buildLandmarks(layout); group.add(landmarks);
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return; disposed = true;
    commons.userData.dispose(); for (const { kit } of parts) kit.userData.dispose(); landmarks.userData.dispose(); group.clear();
  };
  group.userData.update = position => {
    commons.userData.update(position);
    for (const part of parts) {
      part.kit.visible = distanceToRect(part.site, position.x, -position.z) < HEIGHTS_VISIBLE_METRES;
      if (part.kit.visible) part.kit.userData.update(position);
    }
  };
  group.userData.shadowProxies = [...commons.userData.shadowProxies, ...parts.flatMap(({ kit }) => kit.userData.shadowProxies)];
  group.userData.setLanterns = (lit, complete) => commons.userData.setLanterns(lit, complete);
  group.userData.lanterns = commons.userData.lanterns;
  group.userData.stats = () => {
    const all = [commons.userData.stats(), ...parts.map(({ kit }) => kit.userData.stats())].filter(Boolean);
    return { meshes: all.reduce((n, item) => n + item.meshes, 0), triangles: all.reduce((n, item) => n + item.triangles, 0),
      materials: all.reduce((n, item) => n + item.materials, 0), neighborhoods: parts.length, drawn: parts.filter(({ kit }) => kit.visible).length };
  };
  group.userData.layout = layout;
  return group;
}

// The footbridge deck structure under the kit paving, the bayou beneath it, the
// bandstand on the green and Heights Hall's clock tower, in the Commons materials.
function buildLandmarks(layout) {
  const group = new THREE.Group(); group.name = 'bayou-heights/landmarks';
  const { heights, ground } = layout, geometries = [], materials = {
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
  const add = (name, geometry, material, east, up, north, yaw = 0) => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material); mesh.name = `bayou-heights/${name}`;
    mesh.position.set(east, up, -north); mesh.rotation.y = yaw; mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh);
    return mesh;
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
    const clock = add(`hall-clock-${dx}${dy}`, new THREE.CircleGeometry(1.35, 32), materials.face, towerX + dx * (half + .02), top - 8, towerY + dy * (half + .02), yaw);
    clock.castShadow = false;
  }
  add('hall-spire', new THREE.ConeGeometry(half * 1.15, 3, 4), materials.roof, towerX, top - 1.5, towerY, Math.PI / 4);

  group.userData.dispose = () => { for (const geometry of geometries) geometry.dispose(); for (const material of Object.values(materials)) material.dispose(); group.clear(); };
  return group;
}
