// Coworking studio (fixture): a graybox room plan for the workplace slice.
// It is a labeled fixture site, not a place in the River Oaks district: no
// mapped tenant is displaced (#216). Units are metres in the room's own frame:
// x runs across the room (east), d runs inward from the entrance wall (north).
// The same plan drives the route tests and the rendered blockout.
import { DOOR_HALF_WIDTH, ROOM_HEIGHT } from './store-rooms.js';
import { STATION_IDS } from './workplace-contract.js';

export const FIXTURE_SITE = Object.freeze({id: 'coworking-studio-fixture', label: 'Coworking studio (fixture)'});
// Measured from all 22 shared appearances (docs/level-design/workplace-coworking-fixture/avatar-envelope.json).
export const AVATAR_ENVELOPE = Object.freeze({bodyHalfWidth: 0.505, turningRadius: 0.888, seatedRadius: 0.45});
export const CIRCULATION_WIDTH = 1.8;

const box = (id, kind, x, d, w, l, h) => ({id, kind, x0: x - w / 2, x1: x + w / 2, d0: d - l / 2, d1: d + l / 2, height: h});

export function planWorkplaceRoom({width = 9, depth = 7} = {}) {
  const half = width / 2;
  const desk = (station, d) => box(`desk-${station}`, 'desk', -half + 0.55, d, 0.75, 1.5, 0.74);
  const stationRows = [2.2, 4.6];
  const stations = STATION_IDS.map((id, index) => {
    const d = stationRows[index];
    // Seat faces the wall desk; the approach point leaves a full turning circle.
    return {id, desk: `desk-${id}`, seat: [-half + 1.35, d], approach: [-half + 2.45, d], exit: [-half + 2.45, d], facing: -Math.PI / 2};
  });
  const obstacles = [
    ...stations.map((station, index) => desk(station.id, stationRows[index])),
    box('review-table', 'review', half - 1.4, 3.4, 0.9, 1.6, 0.74),
    box('storage-wall', 'storage', 0, depth - 0.25, 3.2, 0.5, 2.1),
    box('planter-east', 'planter', half - 0.35, 0.6, 0.5, 0.5, 0.9),
  ];
  return {
    site: FIXTURE_SITE, width, depth, height: ROOM_HEIGHT, door: {x: 0, halfWidth: DOOR_HALF_WIDTH},
    stations, obstacles,
    review: {id: 'review', socket: [half - 2.85, 3.4], facing: Math.PI / 2},
    entrance: [0, 0.9], outside: [0, -1.2],
    cameras: {
      'CAM-01': {label: 'Entrance', position: [0, 1.65, -1.6], target: [0, 1.2, depth * 0.6]},
      'CAM-02': {label: 'Workbench', position: [1.2, 1.75, 1.1], target: [-half + 1.2, 0.9, 3.4]},
      'CAM-03': {label: 'Seated review', position: [0.2, 1.7, depth - 1.2], target: [-half + 2.2, 0.8, 2.6]},
      'CAM-04': {label: 'Return view', position: [0, 1.65, depth - 1.0], target: [0, 1.2, -2]},
    },
  };
}

// Outside the entrance wall is open ground (2.5 m deep); inside, the walls
// bound the room and the wall plane is crossable only through the door.
function free(room, point, r, blockers) {
  const [x, d] = point, inDoor = Math.abs(x - room.door.x) <= room.door.halfWidth - r;
  if (d < -2.5 || d > room.depth - r || Math.abs(x) > room.width / 2 - r) return false;
  if (d > -r && d < r && !inDoor) return false;
  for (const o of room.obstacles) {
    const nx = Math.max(o.x0, Math.min(x, o.x1)), nd = Math.max(o.d0, Math.min(d, o.d1));
    if (Math.hypot(x - nx, d - nd) < r) return false;
  }
  return blockers.every(([bx, bd, br]) => Math.hypot(x - bx, d - bd) >= r + br);
}

// Breadth-first search on a 0.1 m grid for a body of radius r, around seated
// occupants and other blockers. Returns waypoints or null when no route exists.
export function findRoute(room, from, to, {radius = AVATAR_ENVELOPE.bodyHalfWidth, blockers = [], step = 0.1} = {}) {
  const key = (i, j) => `${i},${j}`, toCell = ([x, d]) => [Math.round(x / step), Math.round(d / step)];
  const [si, sj] = toCell(from), [ti, tj] = toCell(to);
  const ok = (i, j) => free(room, [i * step, j * step], radius, blockers);
  if (!ok(si, sj) || !ok(ti, tj)) return null;
  const previous = new Map([[key(si, sj), null]]), queue = [[si, sj]];
  for (let head = 0; head < queue.length; head++) {
    const [i, j] = queue[head];
    if (i === ti && j === tj) {
      const path = [];
      for (let cell = key(i, j); cell; cell = previous.get(cell)) path.unshift(cell.split(',').map(value => Number(value) * step));
      return path;
    }
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const ni = i + di, nj = j + dj, next = key(ni, nj);
      if (previous.has(next) || !ok(ni, nj)) continue;
      previous.set(next, key(i, j));queue.push([ni, nj]);
    }
  }
  return null;
}

// Plan checks: everything inside the walls, unique stations, a full turning
// circle at every socket, and the entrance-desk-review-exit routes open while
// the other station is occupied.
export function validateRoomPlan(room, envelope = AVATAR_ENVELOPE) {
  const problems = [];
  for (const o of room.obstacles) if (o.x0 < -room.width / 2 || o.x1 > room.width / 2 || o.d0 < 0 || o.d1 > room.depth) problems.push(`${o.id} leaves the room`);
  if (new Set(room.stations.map(station => station.id)).size !== room.stations.length) problems.push('duplicate station');
  if (room.door.halfWidth * 2 < envelope.bodyHalfWidth * 2 + 0.2) problems.push('door narrower than the widest body');
  for (const point of [room.entrance, room.review.socket, ...room.stations.map(station => station.approach)])
    if (!free(room, point, envelope.turningRadius, [])) problems.push(`no turning circle at ${point.join(',')}`);
  for (const station of room.stations) {
    const others = room.stations.filter(other => other !== station).map(other => [...other.seat, envelope.seatedRadius]);
    for (const [a, b] of [[room.outside, station.approach], [station.exit, room.review.socket], [room.review.socket, room.outside]])
      if (!findRoute(room, a, b, {radius: envelope.bodyHalfWidth, blockers: others})) problems.push(`no route ${a.join(',')} -> ${b.join(',')} with ${station.id} in use`);
  }
  return problems;
}

// The graybox: honest blockout geometry with one neutral material family.
export function buildWorkplaceGraybox(THREE, room) {
  const object = new THREE.Group();object.name = room.site.label;
  const geometries = [], materials = [];
  const material = (color, roughness = 0.85) => { const m = new THREE.MeshStandardMaterial({color, roughness});materials.push(m);return m; };
  const floor = material('#bdb6ae'), wall = material('#d9d4cd'), block = material('#8f8a84', 0.7), accent = material('#f486a1', 0.6);
  const add = (geometry, mat, x, y, z) => { geometries.push(geometry);const mesh = new THREE.Mesh(geometry, mat);mesh.position.set(x, y, z);mesh.castShadow = mesh.receiveShadow = true;object.add(mesh);return mesh; };
  // Three.js frame: x east, y up, z = -north; the room's d axis maps to -z.
  add(new THREE.BoxGeometry(room.width, 0.05, room.depth), floor, 0, -0.025, -room.depth / 2);
  const t = 0.15, sideWall = (room.width - room.door.halfWidth * 2) / 2;
  add(new THREE.BoxGeometry(t, room.height, room.depth), wall, -room.width / 2 - t / 2, room.height / 2, -room.depth / 2);
  add(new THREE.BoxGeometry(t, room.height, room.depth), wall, room.width / 2 + t / 2, room.height / 2, -room.depth / 2);
  add(new THREE.BoxGeometry(room.width + 2 * t, room.height, t), wall, 0, room.height / 2, -room.depth - t / 2);
  for (const sign of [-1, 1]) add(new THREE.BoxGeometry(sideWall, room.height, t), wall, sign * (room.door.halfWidth + sideWall / 2), room.height / 2, t / 2);
  add(new THREE.BoxGeometry(room.door.halfWidth * 2, room.height - 2.4, t), wall, 0, 2.4 + (room.height - 2.4) / 2, t / 2);
  for (const o of room.obstacles) add(new THREE.BoxGeometry(o.x1 - o.x0, o.height, o.d1 - o.d0), o.kind === 'review' ? accent : block, (o.x0 + o.x1) / 2, o.height / 2, -(o.d0 + o.d1) / 2);
  for (const station of room.stations) add(new THREE.BoxGeometry(0.46, 0.45, 0.46), block, station.seat[0], 0.225, -station.seat[1]);
  return {object, dispose() { object.removeFromParent();for (const g of geometries) g.dispose();for (const m of materials) m.dispose(); }};
}
