// Graybox of the penthouse layout (#361): the geometry a visitor sees until #362's assets
// and #363's integration replace it. Every mesh comes from the same plan the server
// moves visitors through (office-layouts.js) and is tagged with the plan zone it occupies,
// so tests can hold the art to the collision: nothing solid stands where a body may walk,
// and the arrival doorway on the entrance wall stays open. Units are metres in the office
// frame (x across, d inward, y up); Three.js uses [x, y, -d].
import { OFFICE_LAYOUT_LEGACY, officeLayout, officeSeat } from './office-layouts.js';
import { thinStorefrontGlass } from './storefront-materials.js';

const COLORS = {
  travertine: '#e9dfd0', terrace: '#cbbfae', wall: '#efe7dc', ceiling: '#f6f1ea', walnut: '#6b4a33',
  blush: '#e7b7b2', bronze: '#b08d57', glass: '#cfe3ea', stone: '#d9c7b4',
};
const HEIGHTS = { 'reading-side-table': 0.55, 'bookcase-1': 2.6, 'bookcase-2': 2.6 };
const BACK = 0.5; // a chair back above the plan's seat height (#363), on the side away from where it faces
const DOOR = { halfWidth: 0.85, height: 2.6 }, SHELL = 0.2;
// Curtain wall: pane thickness, the solid arrival core's half-width (it hides the cabin and lobby
// that rise with the office), the transom underside over the terrace portals, mullion size.
const GLASS = 0.025, CORE = 3, TRANSOM = 3, MULLION = { width: 0.07, depth: 0.1 }, BAND = 0.08;

export function buildPenthouseOffice(THREE, layout) {
  const object = new THREE.Group(), geometries = [], materials = new Map();
  object.name = `office:${layout.id}`;
  const material = name => {
    if (!materials.has(name)) materials.set(name, new THREE.MeshStandardMaterial({
      color: COLORS[name], roughness: name === 'glass' ? 0.1 : name === 'bronze' ? 0.4 : 0.8, metalness: name === 'bronze' ? 0.6 : 0,
      ...(name === 'glass' ? { transparent: true, opacity: 0.35 } : {}),
    }));
    return materials.get(name);
  };
  const box = (zone, name, { x0, x1, d0, d1 }, y0, y1, finish) => {
    const geometry = new THREE.BoxGeometry(x1 - x0, y1 - y0, d1 - d0); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material(finish));
    mesh.position.set((x0 + x1) / 2, (y0 + y1) / 2, -(d0 + d1) / 2);
    Object.assign(mesh, { name }); mesh.userData.zone = zone; object.add(mesh);
    return mesh;
  };
  const [ground, upper] = layout.levels, main = ground.rooms.find(room => room.kind === 'primary');

  // Floors: the main floor and terrace slabs, and the mezzanine slab (its underside leaves the plan's headroom).
  for (const room of ground.rooms) box(`floor:${room.id}`, `${room.kind} floor`, room, ground.floorElevation - 0.1, ground.floorElevation, room.kind === 'terrace' ? 'terrace' : 'travertine');
  for (const room of upper.rooms) box('mezzanine', 'mezzanine slab', room, ground.floorElevation + main.clearUnderMezzanine, upper.floorElevation, 'stone');

  // Collision obstacles, drawn exactly on their footprints: the stair, mezzanine furniture, and the
  // terrace walls, which the curtain wall below glazes.
  const glazedWalls = [], desks = [];
  for (const level of layout.levels) for (const o of level.obstacles) {
    if (o.kind === 'stair') {
      const { rise, risers } = layout.stair, run = (o.d1 - o.d0) / risers;
      for (let i = 0; i < risers; i++) box(`obstacle:${o.id}`, `stair tread ${i + 1}`, { x0: o.x0, x1: o.x1, d0: o.d0 + i * run, d1: o.d0 + (i + 1) * run }, level.floorElevation, level.floorElevation + rise * (i + 1) / risers, 'stone');
    } else if (o.kind === 'wall') glazedWalls.push({ ...o, y0: level.floorElevation, y1: level.floorElevation + level.clearHeight });
    else if (o.kind === 'desk') desks.push({ ...o, y0: level.floorElevation, y1: level.floorElevation + o.height });
    else if (officeSeat(layout, o.id)) {
      // A reading chair: its seat at the plan's seat height, its back toward the bookcases (+d).
      const seat = officeSeat(layout, o.id), y = level.floorElevation + seat.height;
      box(`obstacle:${o.id}`, o.id, o, level.floorElevation, y, 'blush');
      box(`obstacle:${o.id}`, `${o.id} back`, { ...o, d0: o.d1 - 0.15 }, y, y + BACK, 'blush');
    } else box(`obstacle:${o.id}`, o.id, o, level.floorElevation, level.floorElevation + (HEIGHTS[o.id] ?? 0.75), o.id.startsWith('bookcase') || o.id.includes('table') ? 'walnut' : 'blush');
  }
  // The imported desks (R19) share one draw; each instance keeps its own plan zone.
  if (desks.length) {
    const geometry = new THREE.BoxGeometry(1, 1, 1); geometries.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, material('walnut'), desks.length), matrix = new THREE.Matrix4();
    desks.forEach((o, i) => mesh.setMatrixAt(i, matrix.compose(new THREE.Vector3((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2, -(o.d0 + o.d1) / 2), new THREE.Quaternion(), new THREE.Vector3(o.x1 - o.x0, o.y1 - o.y0, o.d1 - o.d0))));
    mesh.name = 'desks'; mesh.userData.zones = desks.map(o => `obstacle:${o.id}`); object.add(mesh);
  }
  // Desk chairs are collision at the plan's seats, facing the imported desks. The seat top is the
  // plan's seat height, so a seated visitor sits on it; the back is on the approach side.
  for (const chair of ground.chairs) {
    const [x, d] = chair.position, height = officeSeat(layout, chair.id)?.height ?? 0.5, geometry = new THREE.CylinderGeometry(0.35, 0.35, height, 20); geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material('blush'));
    mesh.position.set(x, ground.floorElevation + height / 2, -d); mesh.name = chair.id; mesh.userData.zone = `chair:${chair.id}`; object.add(mesh);
    box(`chair:${chair.id}`, `${chair.id} back`, { x0: x - 0.3, x1: x + 0.3, d0: d - 0.34, d1: d - 0.26 }, ground.floorElevation + height, ground.floorElevation + height + BACK, 'blush');
  }

  // The mezzanine's glass guard runs its whole d 14 edge, with a bronze top rail.
  const edge = upper.bounds;
  box('guard', 'mezzanine guard', { x0: edge.x0, x1: edge.x1, d0: edge.d0 - 0.03, d1: edge.d0 + 0.03 }, upper.floorElevation, upper.floorElevation + 1.05, 'glass');
  box('guard', 'mezzanine guard rail', { x0: edge.x0, x1: edge.x1, d0: edge.d0 - 0.05, d1: edge.d0 + 0.05 }, upper.floorElevation + 1.05, upper.floorElevation + 1.12, 'bronze');

  // The lift is a fixed-endpoint transition: a platform at each floor and an overhead frame, nothing to walk into.
  for (const level of layout.levels) {
    const lift = level.portals.find(item => item.kind === 'lift'); if (!lift) continue;
    const [x, d] = lift.position, footprint = { x0: x - 0.8, x1: x + 0.8, d0: d - 0.8, d1: d + 0.8 };
    box('lift', `lift platform ${level.id}`, footprint, level.floorElevation, level.floorElevation + 0.02, 'bronze');
    box('lift', `lift frame ${level.id}`, footprint, level.floorElevation + 2.55, level.floorElevation + 2.65, 'bronze');
  }

  // Shell: a solid arrival core around the doorway at x 0 and a solid back wall; terrace rails, ceiling.
  const b = ground.bounds, top = ground.floorElevation + ground.clearHeight;
  box('shell', 'arrival core west', { x0: -CORE, x1: -DOOR.halfWidth, d0: b.d0 - SHELL, d1: b.d0 }, 0, top, 'wall');
  box('shell', 'arrival core east', { x0: DOOR.halfWidth, x1: CORE, d0: b.d0 - SHELL, d1: b.d0 }, 0, top, 'wall');
  box('shell', 'entrance header', { x0: -DOOR.halfWidth, x1: DOOR.halfWidth, d0: b.d0 - SHELL, d1: b.d0 }, DOOR.height, top, 'wall');
  box('shell', 'back wall', { x0: main.x0, x1: main.x1, d0: b.d1, d1: b.d1 + SHELL }, 0, top, 'wall');
  glazeCurtainWall(THREE, { object, geometries, materials, bronze: material('bronze'), ground, main, walls: glazedWalls });
  const terrace = ground.rooms.find(room => room.kind === 'terrace');
  if (terrace) {
    box('shell', 'terrace rail south', { x0: terrace.x0, x1: terrace.x1, d0: b.d0 - SHELL, d1: b.d0 }, 0, 1.1, 'glass');
    box('shell', 'terrace rail west', { x0: b.x0 - SHELL, x1: b.x0, d0: b.d0, d1: b.d1 }, 0, 1.1, 'glass');
    box('shell', 'terrace rail north', { x0: terrace.x0, x1: terrace.x1, d0: b.d1, d1: b.d1 + SHELL }, 0, 1.1, 'glass');
  }
  box('shell:ceiling', 'ceiling', main, top, top + 0.15, 'ceiling');

  // Authored lights; the shared-world scene moves them into its existing light pool.
  for (const [x, y, d, intensity] of [[0, 6, 5, 70], [0, 6, 12, 70], [-8, 6, 8, 60], [8, 6, 8, 60], [0, upper.floorElevation + 2.8, 17, 45]]) {
    const light = new THREE.PointLight('#fff1df', intensity, 16, 2); light.position.set(x, y, -d); object.add(light);
  }
  return {
    object,
    get lights() { return object.children.filter(node => node.isPointLight); },
    update() {},
    dispose() { for (const geometry of geometries) geometry.dispose(); for (const finish of materials.values()) finish.dispose(); },
  };
}

// The kit blockout's curtain wall (#363): full-height glass with bronze mullions, sills and head
// bands on the street front either side of the arrival core, the east side, and the terrace side.
// There the plan's walls keep their collision and transoms close each portal above head height,
// so the portals stay walkable. Panes and frames are one instanced batch each (two draws); every
// instance keeps its own plan zone. The glass is the district's thin storefront glazing, kept out
// of the AO depth pass the same way.
function glazeCurtainWall(THREE, { object, geometries, materials, bronze, ground, main, walls }) {
  const b = ground.bounds, top = ground.floorElevation + ground.clearHeight, floor = ground.floorElevation;
  const frontD = b.d0 - SHELL / 2, eastX = main.x1 + SHELL / 2, terraceX = main.x0, panes = [], frames = [];
  const part = (list, zone, x0, x1, d0, d1, y0, y1) => list.push({ zone, x0, x1, d0, d1, y0, y1 });
  const across = (list, zone, x0, x1, y0, y1, depth) => part(list, zone, x0, x1, frontD - depth / 2, frontD + depth / 2, y0, y1);
  const along = (list, zone, x, d0, d1, y0, y1, depth) => part(list, zone, x - depth / 2, x + depth / 2, d0, d1, y0, y1);
  // Street front: glass from each side of the core to the corners, a mullion every 3 m, sill and head.
  for (const [x0, x1] of [[main.x0, -CORE], [CORE, eastX]]) {
    across(panes, 'shell', x0, x1, floor, top, GLASS);
    for (const y of [floor, top - BAND]) across(frames, 'shell', x0, x1, y, y + BAND, MULLION.depth);
  }
  for (let x = main.x0; x <= main.x1 + 1e-9; x += 3) if (Math.abs(x) >= CORE - 1e-9) across(frames, 'shell', x - MULLION.width / 2, x + MULLION.width / 2, floor, top, MULLION.depth);
  // East side: glass from the front corner to the back wall, a mullion every 2 m.
  along(panes, 'shell', eastX, frontD, b.d1, floor, top, GLASS);
  for (const y of [floor, top - BAND]) along(frames, 'shell', eastX, frontD, b.d1, y, y + BAND, MULLION.depth);
  for (let d = 2; d <= b.d1 + 1e-9; d += 2) along(frames, 'shell', eastX, d - MULLION.width / 2, d + MULLION.width / 2, floor, top, MULLION.depth);
  // Terrace side: each plan wall glazed in its own footprint; a transom over each gap between walls.
  const sorted = [...walls].sort((a, c) => a.d0 - c.d0), within = d => sorted.find(w => d >= w.d0 - 1e-9 && d <= w.d1 + 1e-9);
  for (const w of sorted) {
    along(panes, `obstacle:${w.id}`, terraceX, w.d0, w.d1, w.y0, w.y1, GLASS);
    along(frames, `obstacle:${w.id}`, terraceX, w.d0, w.d1, w.y0, w.y0 + BAND, MULLION.depth);
  }
  sorted.slice(1).forEach((w, i) => {
    const d0 = sorted[i].d1, d1 = w.d0; if (d1 - d0 < 1e-6) return;
    along(panes, 'transom', terraceX, d0, d1, floor + TRANSOM, top, GLASS);
    along(frames, 'transom', terraceX, d0, d1, floor + TRANSOM - BAND, floor + TRANSOM, MULLION.depth);
  });
  along(frames, 'transom', terraceX, b.d0, b.d1, top - BAND, top, MULLION.depth);
  // Mullions at every wall edge and on the 2 m rhythm; over a portal they stop at the transom.
  const stations = new Set(sorted.flatMap(w => [w.d0, w.d1]));
  for (let d = 0; d <= b.d1 + 1e-9; d += 2) if ([...stations].every(s => Math.abs(s - d) >= 0.5)) stations.add(d);
  for (const d of stations) {
    const w = within(d), d0 = Math.max(d - MULLION.width / 2, w?.d0 ?? -Infinity), d1 = Math.min(d + MULLION.width / 2, w?.d1 ?? Infinity);
    if (w) along(frames, `obstacle:${w.id}`, terraceX, d0, d1, w.y0, w.y1, MULLION.depth);
    else along(frames, 'transom', terraceX, d0, d1, floor + TRANSOM, top, MULLION.depth);
  }
  const unit = new THREE.BoxGeometry(1, 1, 1); geometries.push(unit);
  if (!materials.has('curtain glass')) materials.set('curtain glass', thinStorefrontGlass());
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), scale = new THREE.Vector3(), turn = new THREE.Quaternion();
  for (const [name, list, finish] of [['curtain wall panes', panes, materials.get('curtain glass')], ['curtain wall frames', frames, bronze]]) {
    const mesh = new THREE.InstancedMesh(unit, finish, list.length);
    list.forEach((p, i) => mesh.setMatrixAt(i, matrix.compose(position.set((p.x0 + p.x1) / 2, (p.y0 + p.y1) / 2, -(p.d0 + p.d1) / 2), turn, scale.set(p.x1 - p.x0, p.y1 - p.y0, p.d1 - p.d0))));
    mesh.name = name; mesh.userData.zone = 'shell'; mesh.userData.zones = list.map(p => p.zone);
    if (finish !== bronze) { mesh.userData.aoExclude = true; mesh.castShadow = false; }
    object.add(mesh);
  }
}

// The geometry for a visit's admitted layout. An unknown layout fails rather than falling
// back to another plan's geometry, which would disagree with the server's collision.
export function buildOfficeGeometry(THREE, layoutId, { buildLegacy }) {
  if (layoutId === OFFICE_LAYOUT_LEGACY) return buildLegacy();
  const layout = officeLayout(layoutId);
  if (!layout) throw new Error(`Unknown office layout ${layoutId}`);
  return buildPenthouseOffice(THREE, layout);
}
