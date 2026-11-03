import * as THREE from 'three';

// Five Rooms ground (#840): the walkable surfaces the landscape adds (entrance aprons and, once
// decided, the Shade Garden court floor), as triangles that follow the ground they pave. The
// mesh is in the shape registerGroundSurfaces (world-surface.js) reads, so Integration (#841)
// registers it with the District's other supports and walking, the camera and placement agree
// with what is drawn. Nothing here is registered by itself.
//
// Each piece is a convex ring in source metres (x east, y north). It is fanned into triangles,
// each split on a grid no coarser than PAVING_STEP, and every vertex is set on `groundAt` plus a
// small lift, so the paving neither floats over a slope nor dips under it.
export const PAVING_STEP = 0.5, PAVING_LIFT = 0.008;
// An 8 mm lift alone fights the street from a distance. Pull the paving ahead of the street's
// own layers (-1, -1), and behind the furniture that lies flush on the ground (-3, -3).
const PAVING_OFFSET = Object.freeze({ polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

const area = ring => Math.abs(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[2] - q[0] * p[2]; }, 0)) / 2;
const clip = (ring, side) => {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i], b = ring[(i + 1) % ring.length], da = side(a), db = side(b);
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) { const t = da / (da - db); out.push(a.map((v, j) => v + (b[j] - v) * t)); }
  }
  return out.length >= 3 && area(out) > 1e-8 ? out : [];
};
const edges = ring => {
  const winding = Math.sign(ring.reduce((sum, p, i) => { const q = ring[(i + 1) % ring.length]; return sum + p[0] * q[2] - q[0] * p[2]; }, 0));
  return ring.map((a, i) => { const b = ring[(i + 1) % ring.length]; return p => winding * ((b[0] - a[0]) * (p[2] - a[2]) - (b[2] - a[2]) * (p[0] - a[0])); });
};
const plane = ([a, b, c]) => {
  const ux = b[0] - a[0], uz = b[2] - a[2], vx = c[0] - a[0], vz = c[2] - a[2], det = ux * vz - uz * vx;
  if (Math.abs(det) < 1e-9) return null;
  return p => a[1] + ((p[0] - a[0]) * vz - (p[2] - a[2]) * vx) / det * (b[1] - a[1])
    + (ux * (p[2] - a[2]) - uz * (p[0] - a[0])) / det * (c[1] - a[1]);
};
// Keep only the upper envelope of the actual registered street triangles. Sampling a curb on
// a half-metre grid bridges its edge and can bury the apron under the street between samples.
// Convex clipping retains the street's own edges, slopes and height discontinuities instead.
function supportedPiece(piece, surfaces, lift) {
  const boundary = edges(piece.ring.map(([x, north]) => [x, 0, -north]));
  const candidates = surfaces.map(input => { const triangle = input.triangle ?? input; return { triangle, priority: input.priority ?? 0, height: plane(triangle) }; }).filter(s => s.height)
    .map(s => ({ ...s, ring: boundary.reduce((r, side) => clip(r, side), s.triangle) })).filter(s => s.ring.length);
  const triangles = [];
  candidates.forEach((surface, index) => {
    let fragments = [surface.ring];
    candidates.forEach((other, otherIndex) => {
      if (index === otherIndex || !fragments.length) return;
      if (other.priority < surface.priority) return;
      // Ties belong to the earlier triangle, so coplanar supports never draw duplicate paving.
      const sides = edges(other.triangle);
      if (other.priority === surface.priority) sides.push(p => other.height(p) - surface.height(p) + (otherIndex < index ? 1e-7 : -1e-7));
      fragments = fragments.flatMap(ring => {
        if (!sides.reduce((r, side) => clip(r, side), ring).length) return [ring];
        const outside = [];
        for (const side of sides) { const part = clip(ring, p => -side(p)); if (part.length) outside.push(part); ring = clip(ring, side); if (!ring.length) break; }
        return outside;
      });
    });
    for (const ring of fragments) for (let i = 1; i < ring.length - 1; i++) triangles.push([ring[0], ring[i], ring[i + 1]].map(([x, y, z]) => [x, y + lift, z]));
  });
  // At District coordinates a sub-millimetre clipping sliver can collapse in the actual
  // Float32 vertex buffer. Such a triangle has no drawn area and cannot support a body.
  return triangles.map(t => t.map(p => p.map(Math.fround))).filter(t => area(t) > 1e-8);
}

// [{ id, triangles: [[[x, y, z] x3], ...] }] in scene coordinates ([east, height, -north]).
export function fiveRoomsGroundPieces(plan, { groundAt, step = PAVING_STEP, lift = PAVING_LIFT, supportTriangles = null } = {}) {
  if (typeof groundAt !== 'function') throw new Error('fiveRoomsGroundPieces needs groundAt(x, north)');
  const vertex = (x, north) => [x, groundAt(x, north) + lift, -north];
  return [...plan.paving, ...plan.courts].map(piece => {
    const surfaces = supportTriangles?.(piece);
    if (surfaces?.length) {
      const triangles = supportedPiece(piece, surfaces, lift);
      // Every triangle uses the same upward winding as the sampled fallback below.
      for (const t of triangles) { const [a, b, c] = t; if ((b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]) < 0) t.reverse(); }
      return { id: piece.id, triangles };
    }
    const ring = piece.ring, triangles = [];
    for (let k = 1; k < ring.length - 1; k++) {
      const a = ring[0], b = ring[k], c = ring[k + 1];
      const n = Math.max(1, Math.ceil(Math.max(Math.hypot(b[0] - a[0], b[1] - a[1]), Math.hypot(c[0] - b[0], c[1] - b[1]), Math.hypot(a[0] - c[0], a[1] - c[1])) / step));
      const at = (i, j) => { const u = i / n, v = j / n; return vertex(a[0] + (b[0] - a[0]) * u + (c[0] - a[0]) * v, a[1] + (b[1] - a[1]) * u + (c[1] - a[1]) * v); };
      for (let i = 0; i < n; i++) for (let j = 0; j < n - i; j++) {
        triangles.push([at(i, j), at(i + 1, j), at(i, j + 1)]);
        if (i + j < n - 1) triangles.push([at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
      }
    }
    // Face up: a source ring wound either way becomes counter-clockwise seen from above.
    for (const t of triangles) {
      const [p, q, r] = t, up = (q[2] - p[2]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[2] - p[2]);
      if (up < 0) t.reverse();
    }
    return { id: piece.id, triangles };
  });
}

// One mesh, one material: every apron and court in a single draw call.
export function buildFiveRoomsGround(plan, { groundAt, supportTriangles, material = new THREE.MeshStandardMaterial({ color: '#c9c0b1', roughness: 0.9, ...PAVING_OFFSET }) } = {}) {
  const group = new THREE.Group(); group.name = 'Five Rooms paving';
  const pieces = fiveRoomsGroundPieces(plan, { groundAt, supportTriangles });
  const positions = pieces.flatMap(piece => piece.triangles.flat(2));
  group.userData.pieces = pieces.map(piece => ({ id: piece.id, triangles: piece.triangles.length }));
  if (!positions.length) return group;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  material.name = 'five-rooms-paving';
  const mesh = new THREE.Mesh(geometry, material); mesh.name = 'Five Rooms paving'; mesh.receiveShadow = true;
  group.add(mesh);
  return group;
}
