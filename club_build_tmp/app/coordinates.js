// CT Club surface coordinates (scratch tool, Val 2026-11-04).
// Exact world-space xyz (and facing normal + size) for every major surface so you
// can build on them precisely. Local frame: x=a across, z=-d inward, y up.
import { CLUB, DISCO_BALL, CLUB_SPOTS, CLUB_STROBES, SCREEN_WALLS } from '../../preview/src/ct-club-plan.js';

const W = CLUB.width, D = CLUB.depth, H = CLUB.height;

// Exact transform for a wall/surface screen (shared with the interior's math).
export function screenTransform(room, screen) {
  const nx = screen.nx ?? 0, ny = screen.ny ?? 0, nz = screen.nz ?? 1;
  return { x: screen.x, y: screen.y, z: screen.z, rotY: Math.atan2(nx, nz), normal: [nx, ny, nz] };
}

// Mount an object flush on ANY surface (used like a physical wall). `u` (0..1)
// is across the surface, `v` (0..1) is up the face (walls) or across the depth
// (top surfaces). Returns the world position + the surface normal.
export function surfaceMount(surface, u = 0.5, v = 0.5, offset = 0.02) {
  const [cx, cy, cz] = surface.center, [w, h, d] = surface.size, [nx, ny, nz] = surface.normal;
  const vertical = Math.abs(ny) < 0.5;
  if (vertical) {
    const alongX = Math.abs(nx) > 0.5;   // normal along x -> the wall runs along z
    const across = alongX ? d : w;        // metres along the wall face
    const depth = alongX ? w : d;         // thickness to reach the face
    const x = cx + nx * (depth / 2) + (u - 0.5) * across * (alongX ? 0 : 1) + nx * offset;
    const z = cz + nz * (depth / 2) + (u - 0.5) * across * (alongX ? 1 : 0) + nz * offset;
    const y = cy - h / 2 + v * h;
    return { x, y, z, nx, ny, nz };
  }
  const y = cy + h / 2 + offset;
  const x = cx + (u - 0.5) * w;
  const z = cz + (v - 0.5) * d;
  return { x, y, z, nx, ny, nz };
}

export function surfaceReference(room) {
  const surfaces = [];
  const add = (name, center, size, normal, top = null) => surfaces.push({ name, center, size, normal, top });

  // Walls
  add('wall back', [0, H / 2, -D], [W, H, 0.2], [0, 0, 1], [0, H, -D + 0.1]);
  add('wall front (left of door)', [-4.575, H / 2, 0], [6.85, H, 0.2], [0, 0, -1]);
  add('wall front (right of door)', [4.575, H / 2, 0], [6.85, H, 0.2], [0, 0, -1]);
  add('wall front (lintel over door)', [0, 4.15, 0], [2.3, 3.7, 0.2], [0, 0, -1]);
  add('wall left', [-W, H / 2, -D / 2], [0.2, H, D], [1, 0, 0], [-W + 0.1, H, -D / 2]);
  add('wall right', [W, H / 2, -D / 2], [0.2, H, D], [-1, 0, 0], [W - 0.1, H, -D / 2]);
  // Columns (8)
  for (const d of [8, 16, 24, 32]) for (const a of [-7.3, 7.3]) {
    add(`column ${a >= 0 ? 'R' : 'L'} @ d${d}`, [a, H / 2, -d], [0.7, H, 0.7], [a > 0 ? -1 : 1, 0, 0], [a, H, -d]);
  }
  const pos = (kind, nth, defA, defD) => { const f = room.fixtures.filter(x => x.kind === kind)[nth]; return f ? { a: f.a, d: f.d } : { a: defA, d: defD }; };
  const barP = pos('bar-counter', 0, -7.15, 14);
  const djP = pos('dj-booth', 0, 0, 33.7);
  // Bar
  add('bar counter', [barP.a, 0.56, -barP.d], [1.5, 1.12, 20], [0, 0, 1], [barP.a + 0.75, 1.145, -barP.d]);
  add('bar serving top', [barP.a + 0.15, 1.145, -barP.d], [1.7, 0.06, 20.2], [0, 1, 0], [barP.a + 0.15, 1.175, -barP.d]);
  // DJ booth + mixer
  add('DJ booth', [djP.a, 0.55, -djP.d], [5.2, 1.1, 1.4], [0, 0, 1], [djP.a, 1.1, -djP.d]);
  add('DJ mixer deck', [djP.a, 1.18, -(djP.d - 0.6)], [1.2, 0.05, 0.5], [0, 1, 0], [djP.a, 1.205, -(djP.d - 0.6)]);
  // Speakers
  const bankP = pos('speaker-bank', 0, 0, 37.0);
  add('speaker bank face', [bankP.a, 1.25, -(bankP.d - 2.26)], [6.8, 2.5, 0.04], [0, 0, 1], [bankP.a, 2.5, -(bankP.d - 2.26)]);
  for (const stackFix of room.fixtures.filter(x => x.kind === 'speaker-stack')) {
    add(`speaker stack @a${stackFix.a.toFixed(1)}`, [stackFix.a, 1.65, -stackFix.d], [4.2, 3.3, 4.6], [0, 0, 1], [stackFix.a, 3.3, -(stackFix.d - 2.26)]);
  }
  // Lounge
  for (const [n, f] of room.fixtures.filter(x => x.kind === 'lounge-couch').entries()) add(`couch ${n + 1}`, [f.a, 0.24, -f.d], [2.6, 0.48, 2.2], [0, 1, 0], [f.a, 0.48, -f.d]);
  for (const [n, f] of room.fixtures.filter(x => x.kind === 'lounge-chair').entries()) add(`chair ${n + 1}`, [f.a, 0.3, -f.d], [0.9, 0.6, 0.9], [0, 1, 0], [f.a, 0.6, -f.d]);
  for (const [n, f] of room.fixtures.filter(x => x.kind === 'lounge-table').entries()) add(`coffee table ${n + 1}`, [f.a, 0.21, -f.d], [1.0, 0.42, 1.4], [0, 1, 0], [f.a, 0.42, -f.d]);
  for (const [n, f] of room.fixtures.filter(x => x.kind === 'bar-stool').entries()) add(`stool ${n + 1}`, [f.a, 0.725, -f.d], [0.5, 0.1, 0.5], [0, 1, 0], [f.a, 0.775, -f.d]);
  // Ball + fixtures
  const ballP = pos('disco-ball', 0, DISCO_BALL.a, DISCO_BALL.d);
  add('disco ball', [ballP.a, DISCO_BALL.y, -ballP.d], [DISCO_BALL.radius * 2, DISCO_BALL.radius * 2, DISCO_BALL.radius * 2], [0, 1, 0], [ballP.a, DISCO_BALL.y, -ballP.d]);
  for (const s of CLUB_STROBES) add(`strobe @a${s.a.toFixed(1)} d${s.d}`, [s.a, s.y, -s.d], [0.3, 0.18, 0.3], [0, -1, 0]);
  for (const s of CLUB_SPOTS) add(`spot @a${s.a.toFixed(1)} d${s.d}`, [s.a, s.y, -s.d], [0.24, 0.12, 0.24], [0, -1, 0]);
  for (const s of room.screens) {
    const t = screenTransform(room, s);
    add(`screen ${s.id} (${s.wall})`, [t.x, t.y, t.z], [s.w, s.h, 0.02], t.normal, [t.x, t.y, t.z]);
  }
  return surfaces;
}