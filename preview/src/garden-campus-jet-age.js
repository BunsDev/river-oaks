// Jet-Age architecture for the Gardens (#741 under #738): the form vocabulary
// (shared/city-kit/jet-age-forms.js) placed on the campus, so the Pink Jet-Age finish changes
// the buildings' shapes and not only their colours. Built only when the campus kit finish asks
// for forms (garden-campus-kit-finish.js); classic never calls this module.
//
// Every part keeps to the #511 finish rules (garden-campus-finish.js) and the source contract:
// inside a published obstacle or headhouse, in the air above body clearance, or inside a tower
// silhouette under its cap. Nothing changes a surface, support, collision rect, flight volume,
// opening, level or ID. preview/tests/garden-campus-jet-age.test.js checks every triangle.
//
// What changes, by place (campus metres; x = u, y = up, -z = v):
// - Roof headhouses: the limestone block becomes a rounded-corner ivory volume (its door bay
//   kept), banded in pink, under an elliptical saucer crown with a ring light beneath its rim.
// - Entrance canopies (three towers and the café): flat timber slabs become upswept boomerang
//   wings with a pink leading edge and a glow line beneath.
// - Skywalks B12 and B23: chrome jet-bridge hoops, legs in the edge zones, crowns overhead.
// - The social pergola: tapered chrome pilotis inside the post rects and a shallow chrome vault
//   of parabolic ribs, crown at the pergola's declared height.
// - Ground halls: a starburst chandelier inside each entrance and a field of ring lights.
// - Slab bands: a bullnose at every plate corner, so each storey reads streamlined.
//
// Where a form meets a classic box (slab, stone band, timber beam or door head, guard glass) it
// stops a few millimetres inside that box rather than flush with its face: two faces of
// different materials on one plane fight for depth and show through each other at a distance
// (depth-layer-audit.js; preview/e2e/depth-layers.js scans the town under each finish, #836).
// preview/tests/pink-jet-age-depth.test.js keeps every meeting buried or apart.
import * as THREE from 'three';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels } from '../../shared/garden-campus-layout.js';
import { roundedRectOutline } from '../../shared/city-kit/jet-age-forms.js';
import { FINISH, entranceCanopies } from './garden-campus-finish.js';
import { archGeometry, boomerangGeometry, columnGeometry, hoopGeometry, prismGeometry, ringGeometry, saucerGeometry, starburstGeometry, starburstTips, tubeGeometry } from './jet-age-forms.js';

export const CAMPUS_JET_AGE = Object.freeze({
  // The band sits `bandDrop` under the saucer's 2 cm reveal and `bandInset` inside the rect, so
  // across the door bay it is buried in the timber door head (whose top is the classic cap line).
  headhouse: { inset: 0.04, radius: 1.2, door: 0.85, saucer: { belly: 0.05, rim: 0.03, dome: 0.15 }, reach: 0.9, bedGap: 0.12, band: 0.08, bandDrop: 0.003, bandInset: 0.003 },
  canopy: { rise: 0.45, root: 0.2, tip: 0.06, edge: 0.035 },
  hoop: { edgeInset: 0.08, legHeight: 3.3, crownRise: 0.8, radius: 0.045, step: 2.4, faceGap: 1.5 },
  // A pilotis stops `columnRecess` short of the edge beam's top, its capital buried in the beam.
  pergola: { ribStep: 1.0, ribRadius: 0.05, columnFoot: 0.06, columnHead: 0.12, columnRecess: 0.003 },
  hall: { chandelierInset: 4, chandelierZ: 4.0, rayLength: 0.6, ringRadius: 0.9, ringTube: 0.025, ringStep: 4.5, ringMargin: 3, ringZ: 4.58 },
  // Each bullnose stops `bullnoseRecess` inside the slab above and the stone band below it.
  bullnose: 0.2, bullnoseRecess: 0.003,
});

// The parts a forms finish replaces in garden-campus.js, so the old box is not drawn under the new shape.
export const JET_AGE_REPLACES = Object.freeze(['headhouse', 'entrance-canopy', 'canopy-light', 'pergola-slats', 'pergola-posts']);

const at = (geometry, u, z, v, yaw = 0, scale = null) => {
  if (scale) geometry.scale(...scale);
  if (yaw) geometry.rotateY(yaw);
  geometry.translate(u, z, -v);
  return geometry;
};

/**
 * Every Jet-Age part for the campus as { id, place, material, geometry } with the geometry
 * already in campus space. Materials: 'ivory', 'chrome', 'pink' (the forms' own) and
 * 'luminaire' (the campus glow, so the time of day relights it).
 */
export function campusJetAgeParts(layout = CAMPUS, levels = campusLevels(layout)) {
  const parts = [], add = (id, place, material, geometry) => parts.push({ id, place, material, geometry });
  const H = CAMPUS_JET_AGE.headhouse, clear = FINISH.clearance;

  for (const tower of layout.towers) {
    // Roof headhouse: a rounded volume inside its rect, the door bay notched out of its east face.
    const head = tower.roof.headhouse, [h0, k0, h1, k1] = head.rect, cu = (h0 + h1) / 2, cv = (k0 + k1) / 2;
    const w = h1 - h0 - 2 * H.inset, d = k1 - k0 - 2 * H.inset, door = head.door[1] - cv, lobby = tower.core.lobby.rect[0] - cu;
    const rim = H.saucer.belly + H.saucer.rim + H.saucer.dome, base = tower.silhouette.headhouseTop - rim;
    const outline = roundedRectOutline(w, d, H.radius), split = outline.findIndex(([x, y]) => Math.abs(x - w / 2) < 1e-6 && y > door);
    const notched = [...outline.slice(0, split), [w / 2, door - H.door], [lobby, door - H.door], [lobby, door + H.door], [w / 2, door + H.door], ...outline.slice(split)];
    const shift = points => points.map(([x, y]) => [x + cu, y + cv]);
    add(`${tower.id}/headhouse`, 'roof', 'ivory', prismGeometry(shift(notched), tower.roof.z, base + 0.02));
    // A pink band round the top, above the door head, proud by the inset to just inside the rect.
    const bandTop = base - 0.02 - H.bandDrop, bandOut = H.inset - H.bandInset, outer = roundedRectOutline(w + 2 * bandOut, d + 2 * bandOut, H.radius + bandOut);
    add(`${tower.id}/headhouse-band`, 'roof', 'pink', prismGeometry(shift(outer), bandTop - H.band, bandTop, [shift(roundedRectOutline(w - 0.02, d - 0.02, H.radius - 0.01)).reverse()]));
    // The saucer: an ellipse reaching past the headhouse but never over a roof bed's planting.
    const beds = levels.find(level => level.z === tower.roof.z).obstacles.filter(item => item.kind === 'planter' && item.id.startsWith(`${tower.id}-`)).map(item => item.rect);
    const westBed = Math.max(...beds.filter(bed => bed[2] <= h0 + 1e-6).map(bed => bed[2]), -Infinity);
    const a = Math.min((h1 - h0) / 2 + H.reach, cu - westBed - H.bedGap), b = (k1 - k0) / 2 + H.reach;
    add(`${tower.id}/saucer`, 'roof', 'chrome', at(saucerGeometry({ radius: 1, ...H.saucer }), cu, base, cv, 0, [a, 1, b]));
    const ringZ = base + H.saucer.belly * 0.64 - 0.014;
    if (ringZ - 0.012 < tower.roof.z + clear) throw new Error(`${tower.id} saucer ring under body clearance`);
    // A unit ring scaled to 80 % of the saucer's axes; its tube stays about 12 mm thick.
    const k = 0.8 * Math.min(a, b);
    add(`${tower.id}/saucer-ring`, 'roof', 'luminaire', at(ringGeometry(1, 0.012 / k, 4, 48), cu, ringZ, cv, 0, [a * 0.8, k, b * 0.8]));

    // Ground hall: a starburst chandelier inside the entrance, ring lights over the hall.
    const hall = tower.levels[0].hall, slab = layout.bridges[0].slab, ceiling = tower.levels[0].z1 - slab, C = CAMPUS_JET_AGE.hall;
    const [du, dv] = hall.door.position;
    add(`${tower.id}/chandelier`, 'hall', 'chrome', at(starburstGeometry({ length: C.rayLength }), du - C.chandelierInset, C.chandelierZ, dv));
    for (const [x, y, z] of starburstTips({ length: C.rayLength })) add(`${tower.id}/chandelier-bead`, 'hall', 'luminaire', at(new THREE.SphereGeometry(0.035, 6, 4), du - C.chandelierInset + x, C.chandelierZ + y, dv - z));
    const core = tower.core.rect, [r0, s0, r1, s1] = hall.rect;
    for (let u = r0 + C.ringMargin; u <= r1 - C.ringMargin + 1e-6; u += C.ringStep) for (let v = s0 + C.ringMargin; v <= s1 - C.ringMargin + 1e-6; v += C.ringStep) {
      const pad = C.ringRadius + 0.6;
      if (u + pad > core[0] && u - pad < core[2] && v + pad > core[1] && v - pad < core[3]) continue;
      if (Math.hypot(u - (du - C.chandelierInset), v - dv) < 2.2) continue;
      add(`${tower.id}/ring-light`, 'hall', 'luminaire', at(ringGeometry(C.ringRadius, C.ringTube), u, Math.min(C.ringZ, ceiling - 0.05), v));
    }

    // Slab bands: a bullnose cylinder at each plate corner over the band's height.
    for (const floor of tower.levels) {
      const [u0, v0, u1, v1] = floor.rect, za = floor.z1 - slab - FINISH.fasciaDrop, zb = floor.z1;
      const recess = CAMPUS_JET_AGE.bullnoseRecess;
      for (const [u, v] of [[u0, v0], [u1, v0], [u1, v1], [u0, v1]]) add(`${floor.id}/bullnose`, 'band', 'ivory', at(new THREE.CylinderGeometry(CAMPUS_JET_AGE.bullnose, CAMPUS_JET_AGE.bullnose, zb - za - 2 * recess, 16, 1), u, (za + zb) / 2, v));
    }
  }

  // Entrance canopies: upswept wings over the same rects, rooted at the facade.
  const K = CAMPUS_JET_AGE.canopy;
  for (const canopy of entranceCanopies(layout)) {
    const [u0, v0, u1, v1] = canopy.rect, width = v1 - v0, depth = u1 - u0, v = (v0 + v1) / 2;
    add(`${canopy.id}/wing`, 'canopy', 'ivory', at(boomerangGeometry({ depth: depth - K.edge, rise: K.rise, root: K.root, tip: K.tip }, width), u0, canopy.z0, v));
    const noseZ = canopy.z0 + K.rise + K.tip / 2;
    add(`${canopy.id}/edge`, 'canopy', 'pink', tubeGeometry([[u1 - K.edge, noseZ, -v0], [u1 - K.edge, noseZ, -v1]], K.edge, 10));
    add(`${canopy.id}/glow`, 'canopy', 'luminaire', tubeGeometry([[u0 + 0.35, canopy.z0 + 0.01, -(v0 + 0.25)], [u0 + 0.35, canopy.z0 + 0.01, -(v1 - 0.25)]], 0.015, 6));
  }

  // Skywalks: hoops where the deck is clear of every tower plate, a face gap from each facade.
  const O = CAMPUS_JET_AGE.hoop;
  for (const bridge of layout.bridges) {
    const [u0, v0, u1, v1] = bridge.rect, plates = layout.towers.flatMap(tower => tower.levels).map(floor => floor.rect).filter(rect => rect[0] < u1 && rect[2] > u0);
    const free = [v0, v1];
    for (const [, p0, , p1] of plates) { if (p1 <= (v0 + v1) / 2) free[0] = Math.max(free[0], p1);else if (p0 >= (v0 + v1) / 2) free[1] = Math.min(free[1], p0); }
    const lo = free[0] + O.faceGap, hi = free[1] - O.faceGap, count = Math.max(2, Math.round((hi - lo) / O.step) + 1);
    for (let i = 0; i < count; i++) {
      const v = lo + (hi - lo) * i / (count - 1);
      add(`${bridge.id}/hoop`, 'skywalk', 'chrome', at(hoopGeometry({ width: u1 - u0 - 2 * O.edgeInset, legHeight: O.legHeight, crownRise: O.crownRise }, O.radius, 8), (u0 + u1) / 2, bridge.deckZ, v));
    }
  }

  // The social pergola: pilotis in the post rects up to the edge beams, and a shallow vault.
  const P = CAMPUS_JET_AGE.pergola;
  for (const item of layout.groundBuildings.filter(entry => entry.kind === 'pergola')) {
    // Pilotis rise to the top of the edge beams, where the ribs spring.
    const [u0, v0, u1, v1] = item.rect, spring = item.height - 0.22, beam = spring;
    for (const post of item.posts ?? []) {
      const [p0, q0, p1, q1] = post.rect, half = Math.min(p1 - p0, q1 - q0) / 2;
      add(`${post.id}/pilotis`, 'pergola', 'chrome', at(columnGeometry({ height: beam - P.columnRecess, foot: P.columnFoot, head: Math.min(P.columnHead, half - 0.03), capital: 0.04 }), (p0 + p1) / 2, 0, (q0 + q1) / 2));
    }
    for (let u = u0 + 0.6; u <= u1 - 0.6 + 1e-6; u += P.ribStep)
      add(`${item.id}/rib`, 'pergola', 'chrome', at(archGeometry({ span: v1 - v0 - 0.3, spring: spring + P.ribRadius, crown: item.height - P.ribRadius, segments: 12 }, P.ribRadius, 6), u, 0, (v0 + v1) / 2, Math.PI / 2));
  }
  return parts;
}
