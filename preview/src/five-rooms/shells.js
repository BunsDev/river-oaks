// Shared shell pieces for the Five Rooms venues (#825 M1, #839): the frontage frame each venue
// is built in, the pink-jet-age material family, and the rounded pieces (bullnosed slabs and
// pilasters, capsule plates, mint glazing) every builder draws with. Builders never place
// anything in world metres: every point comes from the venue's contract record
// (config/ribbon/five-rooms.json), so moving a contract point moves its shell.
//
// Frame: a venue's first entrance fixes it. Local x runs along the frontage, y is up from the
// contract floor height, z points out of the building through the door (the entrance's
// `outward`), so the bay lies at z < 0 and the street at z > 0. The local origin is the entrance
// centre on the floor. Scene axes are the District's: x east, y up, z = -north.
//
// Depth: the mapped building's wall stands on the footprint's frontage edge (local z = 0) and a
// retired tenant's storefront sits just in front of it, so every new face that looks out (+z)
// stands at least FRONT.glass in front of that edge, and nothing reaches past FRONT.reach,
// short of the Ribbon walk (2.3 m and more from every bay door in five-rooms-v2).
import * as THREE from 'three';
import { PINK_JET_AGE as P } from '../../../shared/city-kit/pink-jet-age.js';
import { roundedRectOutline, stadiumOutline } from '../../../shared/city-kit/jet-age-forms.js';
import { mergeJetAgeParts, prismGeometry } from '../jet-age-forms.js';

export const FRONT = Object.freeze({ glass: 0.3, frame: 0.55, sign: 0.62, reach: 1.2 });
export const SHELL_STOREY = Object.freeze({ fascia: 0.6, wall: 0.12, floor: 0.05, ceiling: 0.1 });

// One material family for all five rooms. `night` is the emissive intensity at full twilight:
// pink light only on usable things (doors that will open, display frames) and the landmarks
// (the Starlight marquee and the Overlook lanterns); porch lights burn warm white, never pink.
// By day every emissive is off and pink is only a material.
export const SHELL_MATERIALS = Object.freeze({
  ivory: Object.freeze({ color: P.ivory, roughness: 0.7, metalness: 0 }),
  pink: Object.freeze({ color: P.pink, roughness: 0.5, metalness: 0 }),
  chrome: Object.freeze({ color: P.chrome, roughness: 0.3, metalness: 0.9 }),
  ink: Object.freeze({ color: P.ink, roughness: 0.45, metalness: 0.3 }),
  glass: Object.freeze({ color: P.mintGlass, roughness: 0.06, metalness: 0.1, opacity: 0.55 }),
  'glow-usable': Object.freeze({ color: P.pink, roughness: 0.4, metalness: 0, emissive: P.pink, night: 1.4, role: 'usable' }),
  'glow-landmark': Object.freeze({ color: P.pink, roughness: 0.35, metalness: 0, emissive: P.pink, night: 2.2, role: 'landmark' }),
  'lamp-warm': Object.freeze({ color: '#f6e7c4', roughness: 0.25, metalness: 0, emissive: '#ffbf66', night: 1.6, role: 'lamp' }),
});

export function shellMaterials() {
  const made = new Map();
  for (const [key, spec] of Object.entries(SHELL_MATERIALS)) {
    const material = new THREE.MeshStandardMaterial({ color: spec.color, roughness: spec.roughness, metalness: spec.metalness });
    material.name = `five-rooms/${key}`;
    if (spec.opacity !== undefined) { material.transparent = true; material.opacity = spec.opacity; material.depthWrite = false; }
    if (spec.emissive) { material.emissive.set(spec.emissive); material.emissiveIntensity = 0; }
    material.userData.fiveRooms = { key, role: spec.role ?? 'material', night: spec.night ?? 0 };
    made.set(key, material);
  }
  return made;
}

// Every emissive in the family follows the atmosphere's twilight (atmosphere.js): 0 by day, its
// `night` intensity at dusk and after.
export function relightShellMaterials(materials, { twilight = 0 } = {}) {
  const level = Math.max(0, Math.min(1, Number(twilight) || 0));
  for (const material of materials.values()) {
    const { night } = material.userData.fiveRooms;
    if (night) material.emissiveIntensity = night * level;
  }
}

const unit = v => { const length = Math.hypot(v[0], v[1]) || 1; return [v[0] / length, v[1] / length]; };

// The frontage frame of a venue, from its first entrance.
export function venueFrame(venue) {
  const entrance = venue.entrances[0], origin = entrance.centre, n = unit(entrance.outward), t = [-n[1], n[0]], floor = venue.floor.height;
  const toLocal = ([east, north, up = floor]) => { const d = [east - origin[0], north - origin[1]]; return [d[0] * t[0] + d[1] * t[1], up - floor, d[0] * n[0] + d[1] * n[1]]; };
  // Columns: local x -> scene (t.e, 0, -t.n); y -> up; z -> scene (n.e, 0, -n.n). X x Y = Z.
  const matrix = new THREE.Matrix4().makeBasis(new THREE.Vector3(t[0], 0, -t[1]), new THREE.Vector3(0, 1, 0), new THREE.Vector3(n[0], 0, -n[1])).setPosition(origin[0], floor, -origin[1]);
  const footprint = venue.footprint.map(p => toLocal(p)), xs = footprint.map(p => p[0]), zs = footprint.map(p => p[2]);
  return {
    venue, entrance, origin, floor, matrix, toLocal,
    // Local yaw of a contract yaw (source: from east toward north) about local +y, so a part
    // built facing local +z faces the contract direction.
    yawOf: yaw => { const d = [Math.cos(yaw), Math.sin(yaw)], x = d[0] * t[0] + d[1] * t[1], z = d[0] * n[0] + d[1] * n[1]; return Math.atan2(x, z); },
    x0: Math.min(...xs), x1: Math.max(...xs), depth: -Math.min(...zs), front: Math.max(...zs),
    door: entrance.width, clear: venue.interior?.clearHeight ?? 3.6,
    interior: venue.interior ? venue.interior.floor.map(p => toLocal(p)) : null,
    attachments: new Map(venue.attachments.map(item => [item.role === 'lantern' ? item.id : item.role, item])),
  };
}

// Collects placed parts per material, records the venue's own bounds, and merges at the end.
export function createShellKit(materials) {
  const parts = [], venues = [];
  let current = null;
  const kit = {
    materials,
    begin(venue, frame, form) { current = { id: venue.id, label: venue.label, form, frame, parts: 0, bounds: new THREE.Box3() }; venues.push(current); return current; },
    // A geometry in the venue's local frame (or in scene metres with `scene: true`).
    add(material, geometry, { scene = false } = {}) {
      if (!materials.has(material)) throw new Error(`five rooms: unknown material ${material}`);
      if (!scene) geometry.applyMatrix4(current.frame.matrix);
      geometry.computeBoundingBox();
      current.bounds.union(geometry.boundingBox);
      current.parts++;
      parts.push({ material, geometry, venue: current.id });
    },
    finish() {
      const merged = mergeJetAgeParts(parts);
      return { merged, venues };
    },
  };
  return kit;
}

// ---- Local-frame pieces. Each returns a fresh geometry already in local coordinates. -------
const at = (geometry, x, y, z, ry = 0) => { if (ry) geometry.rotateY(ry); geometry.translate(x, y, z); return geometry; };

/** A box from x0..x1, y0..y1, z0..z1 (local). */
export function slab(x0, x1, y0, y1, z0, z1) {
  return at(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
}

/** A plan prism (outline in local x, z), y0..y1. */
export function planPrism(outline, y0, y1, holes = []) {
  // prismGeometry maps outline (u, v) to scene (u, -v): pass v = -z.
  const flip = ring => ring.map(([x, z]) => [x, -z]);
  return prismGeometry(flip(outline), y0, y1, holes.map(flip));
}

/** A bullnosed pilaster or slab edge: a rounded-rect plan of w (x) by d (z), centred at (x, z). */
export function roundedPrism(x, z, w, d, y0, y1, radius = Math.min(w, d) / 2) {
  return planPrism(roundedRectOutline(w, d, radius, 4).map(([px, pz]) => [x + px, z + pz]), y0, y1);
}

/** A plate standing in the local x-y plane: outline (x, y), extruded from z0 to z1. */
export function plate(outline, z0, z1, holes = []) {
  const shape = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const hole of holes) shape.holes.push(new THREE.Path(hole.map(([x, y]) => new THREE.Vector2(x, y))));
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: z1 - z0, bevelEnabled: false, curveSegments: 2 });
  geometry.translate(0, 0, z0);
  return geometry;
}

/** A capsule plate of w x h centred at (x, y), z0..z1. */
export const capsulePlate = (x, y, w, h, z0, z1) => plate(stadiumOutline(w, h, 6).map(([px, py]) => [x + px, y + py]), z0, z1);

/** A rod along local x from x0 to x1 at (y, z), radius r. */
export function rodX(x0, x1, y, z, r, radial = 8) {
  const geometry = new THREE.CylinderGeometry(r, r, x1 - x0, radial);
  geometry.rotateZ(Math.PI / 2);
  return at(geometry, (x0 + x1) / 2, y, z);
}

/** A rod standing from y0 to y1 at (x, z). */
export const rodY = (x, z, y0, y1, r, radial = 8) => at(new THREE.CylinderGeometry(r, r, y1 - y0, radial), x, (y0 + y1) / 2, z);

/** A rectangular frame (outer w x h, border b) centred at (x, y) in the x-y plane, z0..z1. */
export function framePlate(x, y, w, h, b, z0, z1) {
  const outer = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]].map(([px, py]) => [x + px, y + py]);
  const inner = [[-w / 2 + b, -h / 2 + b], [-w / 2 + b, h / 2 - b], [w / 2 - b, h / 2 - b], [w / 2 - b, -h / 2 + b]].map(([px, py]) => [x + px, y + py]);
  return plate(outer, z0, z1, [inner]);
}

// ---- Pieces every bay shares --------------------------------------------------------------

/** The blank interior envelope: floor slab, side and back walls on the interior ring, ceiling. */
export function interiorEnvelope(kit, frame, { ceiling = true } = {}) {
  const ring = frame.interior;
  if (!ring) return;
  const outline = ring.map(p => [p[0], p[2]]), { wall, floor } = SHELL_STOREY;
  kit.add('ivory', planPrism(outline, 0, floor));
  if (ceiling) kit.add('ivory', planPrism(outline, frame.clear, frame.clear + SHELL_STOREY.ceiling));
  // Walls stand just outside the interior ring on every edge but the frontage one (the edge
  // nearest the door), so the clear interior keeps its contract size.
  const centre = outline.reduce((s, p) => [s[0] + p[0] / outline.length, s[1] + p[1] / outline.length], [0, 0]);
  outline.forEach((a, i) => {
    const b = outline[(i + 1) % outline.length], mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    if (mid[1] > -0.5) return; // the frontage edge
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]), dir = [(b[0] - a[0]) / length, (b[1] - a[1]) / length];
    let out = [dir[1], -dir[0]];
    if ((mid[0] - centre[0]) * out[0] + (mid[1] - centre[1]) * out[1] < 0) out = [-out[0], -out[1]];
    const geometry = new THREE.BoxGeometry(length + wall * 2, frame.clear, wall);
    geometry.rotateY(-Math.atan2(dir[1], dir[0]));
    geometry.translate(mid[0] + out[0] * wall / 2, frame.clear / 2, mid[1] + out[1] * wall / 2);
    kit.add('ivory', geometry);
  });
}

/** Bullnosed pilasters at both ends of the frontage and the fascia band between them. */
export function frontageFrame(kit, frame, { fascia = 'ivory', fasciaTop = frame.clear + SHELL_STOREY.fascia } = {}) {
  const { x0, x1, clear } = frame, w = 0.5, d = FRONT.frame - FRONT.glass;
  // The pilasters rise past the fascia and bury its ends, so no face of one lies on the other's.
  for (const x of [x0 + w / 2 + 0.02, x1 - w / 2 - 0.02]) kit.add('ivory', roundedPrism(x, FRONT.glass + d / 2, w, d, 0, fasciaTop + 0.1, 0.12));
  kit.add(fascia, slab(x0 + 0.3, x1 - 0.3, clear, fasciaTop, FRONT.glass + 0.08, FRONT.frame - 0.08));
}

/** The glazing runs either side of the door, between the pilasters: [x0, x1] pairs. */
export function glazingRuns(frame, margin = 0.18) {
  const left = [frame.x0 + 0.54, -frame.door / 2 - margin], right = [frame.door / 2 + margin, frame.x1 - 0.54];
  return [left, right].filter(([a, b]) => b - a > 0.3);
}

/** Equal panes no wider than `max` across a run. */
export function panes([a, b], max) {
  const count = Math.max(1, Math.ceil((b - a) / max)), size = (b - a) / count;
  return Array.from({ length: count }, (_, i) => [a + i * size, a + (i + 1) * size]);
}

/** The capsule sign plate and the warm porch light, at their contract attachments. */
export function signAndPorch(kit, frame, { sign = 'pink', width = 2.4 } = {}) {
  const signAt = frame.attachments.get('sign');
  if (signAt) { const [x, y] = frame.toLocal(signAt.position); kit.add(sign, capsulePlate(x, y, width, 0.45, FRONT.sign, FRONT.sign + 0.06)); }
  const porch = frame.attachments.get('porch-light');
  if (porch) {
    const [x, y] = frame.toLocal(porch.position);
    kit.add('chrome', slab(x - 0.03, x + 0.03, y - 0.03, y + 0.03, FRONT.frame, 0.78));
    kit.add('lamp-warm', at(new THREE.SphereGeometry(0.12, 12, 8), x, y - 0.04, 0.84));
  }
}

/** A pink-lit door portal: two jambs and a head around the opening (a door that will open). */
export function doorJambs(kit, frame, { height = 2.7, material = 'glow-usable' } = {}) {
  const half = frame.door / 2;
  for (const x of [-half - 0.06, half + 0.06]) kit.add(material, slab(x - 0.06, x + 0.06, 0, height, FRONT.glass, FRONT.glass + 0.14));
  kit.add(material, slab(-half - 0.12, half + 0.12, height, height + 0.12, FRONT.glass, FRONT.glass + 0.14));
}

export { at as placeLocal };
