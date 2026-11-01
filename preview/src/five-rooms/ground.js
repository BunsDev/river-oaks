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

// [{ id, triangles: [[[x, y, z] x3], ...] }] in scene coordinates ([east, height, -north]).
export function fiveRoomsGroundPieces(plan, { groundAt, step = PAVING_STEP, lift = PAVING_LIFT } = {}) {
  if (typeof groundAt !== 'function') throw new Error('fiveRoomsGroundPieces needs groundAt(x, north)');
  const vertex = (x, north) => [x, groundAt(x, north) + lift, -north];
  return [...plan.paving, ...plan.courts].map(piece => {
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
export function buildFiveRoomsGround(plan, { groundAt, material = new THREE.MeshStandardMaterial({ color: '#c9c0b1', roughness: 0.9 }) } = {}) {
  const group = new THREE.Group(); group.name = 'Five Rooms paving';
  const pieces = fiveRoomsGroundPieces(plan, { groundAt });
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
