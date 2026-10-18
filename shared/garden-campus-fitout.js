// The Gardens' fit-out (#510): measured furniture and seats for every advertised suite
// and for the public ground rooms, placed from #506's contract. Pure data for the
// browser and the Node service.
//
// Suites (campus levels l1+, consumed by #508's level movement): every suite has its
// tenant's private desk against the far wall, facing it, with the chair between the desk
// and the door and a stand point beyond the chair, as the penthouse desks are measured.
// Wider suites take up to four desks, so invited guests have their own workstation. Large
// suites add a two-seat meeting table. Furniture is collision on its level (chairs too,
// as in the penthouse), every stand point is on the suite's own support, and nothing
// enters the door threshold, a public spine or any keepClear rect.
//
// Public ground rooms (street level, the halls and café of #507): tables, counters and
// workbenches are room obstacles; their chairs are street seat sites (world-interactions
// benchSeats), shared by residents and players like the IPIC lounge. Seats marked
// `workstation` open the sitter's own private desk; nothing of anyone's work is shown in
// public.
import { CAMPUS_BODY, GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, rectContains, rectsOverlap } from './garden-campus-layout.js';

export const FITOUT_VERSION = 1;
// Furniture finish sizes (metres). Desk height matches the penthouse desks.
export const CAMPUS_DESK = Object.freeze({ width: 1.6, depth: 0.8, height: 0.76 });
const CHAIR = 0.6, WALL_GAP = 0.3, SEAT_SETBACK = 0.55, STAND_SETBACK = 1.35, DESK_GAP = 0.8, SEAT_HEIGHT = 0.5;
const TABLE = 1.0, MEETING_SEAT = 0.95, MEETING_STAND = 1.35, STREET_BODY = 0.36;
const R = CAMPUS_BODY.turningRadius, EPS = 1e-9;
const round = value => Math.round(value * 1e6) / 1e6;
const box = (u, v, du, dv) => [round(u - du / 2), round(v - dv / 2), round(u + du / 2), round(v + dv / 2)];

// One suite: desks along the far wall, then a meeting table when the suite has room
// for it and every route the plan checks stays open (candidates that fail are dropped).
// A taken seat keeps 2.158 m clear (turning radius + seated radius), which in a shallow
// suite spans its whole depth, so a shallow suite takes one desk on each side of its
// door's axis and no desk ever stands between the door and another.
const OCCUPIED = CAMPUS_BODY.turningRadius + CAMPUS_BODY.seatedRadius, DEEP = WALL_GAP + CAMPUS_DESK.depth + SEAT_SETBACK + OCCUPIED + 2 * R;
function deskPlan(suite, levelId, vs) {
  const [u0, , u1] = suite.rect, doorEast = Math.abs(suite.door.position[0] - u1) < EPS, far = doorEast ? u0 : u1, inward = doorEast ? 1 : -1;
  const at = d => far + inward * d, obstacles = [], seats = [];
  vs.forEach((v, i) => {
    const id = `${suite.id}/desk-${i + 1}`, seatU = at(WALL_GAP + CAMPUS_DESK.depth + SEAT_SETBACK);
    obstacles.push({ id, unitId: suite.id, kind: 'desk', rect: box(at(WALL_GAP + CAMPUS_DESK.depth / 2), v, CAMPUS_DESK.depth, CAMPUS_DESK.width), height: CAMPUS_DESK.height });
    obstacles.push({ id: `${id}-chair`, unitId: suite.id, kind: 'chair', rect: box(seatU, v, CHAIR, CHAIR), height: 0.9, seatId: `${id}-chair` });
    seats.push({ id: `${id}-chair`, unitId: suite.id, levelId, kind: 'desk', position: [round(seatU), round(v)], facing: [-inward, 0], height: SEAT_HEIGHT,
      stand: [round(at(WALL_GAP + CAMPUS_DESK.depth + SEAT_SETBACK + STAND_SETBACK)), round(v)], workstation: id, primary: i === 0 });
  });
  return { obstacles, seats, far, inward, at };
}
function suiteFitout(suite, levelId) {
  const [u0, v0, u1, v1] = suite.rect, depth = u1 - u0, length = v1 - v0, doorV = suite.door.position[1];
  const margin = CAMPUS_DESK.width / 2 + R, fits = v => v - margin >= v0 - EPS && v + margin <= v1 + EPS;
  let vs;
  if (depth >= DEEP) {
    const count = Math.max(1, Math.min(4, Math.floor((length - 2 * margin + CAMPUS_DESK.width + DESK_GAP) / (CAMPUS_DESK.width + DESK_GAP))));
    const pitch = CAMPUS_DESK.width + DESK_GAP, first = (v0 + v1) / 2 - (count - 1) * pitch / 2;
    vs = Array.from({ length: count }, (_, i) => first + i * pitch);
  } else {
    // Beside the door's axis, far enough that walking in past one sitter stays clear of them.
    const side = Math.sqrt(Math.max(0, OCCUPIED ** 2 - (depth - R - (WALL_GAP + CAMPUS_DESK.depth + SEAT_SETBACK)) ** 2)) + 0.1;
    vs = [doorV - side - CAMPUS_DESK.width / 2, doorV + side + CAMPUS_DESK.width / 2].filter(fits);
    if (!vs.length) vs = [(v0 + v1) / 2];
  }
  const plan = deskPlan(suite, levelId, vs);
  // A meeting table, chairs either side of it along the suite, standing toward the door. In a
  // suite of three or more desks it takes the place of the end desk beside it.
  const deskZone = WALL_GAP + CAMPUS_DESK.depth + SEAT_SETBACK + STAND_SETBACK + R, tableD = deskZone + 0.3 + TABLE / 2;
  for (const v of depth - tableD - TABLE / 2 >= STAND_SETBACK + R + 0.5 && vs.length >= 3 ? [v1 - R - MEETING_SEAT - 0.1, v0 + R + MEETING_SEAT + 0.1] : []) {
    const kept = deskPlan(suite, levelId, [...vs].sort((a, b) => Math.abs(b - v) - Math.abs(a - v)).slice(0, vs.length - 1).sort((a, b) => a - b));
    const id = `${suite.id}/meeting`, obstacles = [{ id, unitId: suite.id, kind: 'table', rect: box(plan.at(tableD), v, TABLE, TABLE), height: 0.74 }], seats = [];
    for (const sideIndex of [0, 1]) {
      const side = sideIndex ? 1 : -1, seatId = `${id}-chair-${sideIndex ? 'b' : 'a'}`, seatU = plan.at(tableD), seatV = v + side * MEETING_SEAT;
      obstacles.push({ id: seatId, unitId: suite.id, kind: 'chair', rect: box(seatU, seatV, CHAIR, CHAIR), height: 0.9, seatId });
      seats.push({ id: seatId, unitId: suite.id, levelId, kind: 'meeting', position: [round(seatU), round(seatV)], facing: [0, -side], height: SEAT_HEIGHT,
        stand: [round(plan.at(tableD + MEETING_STAND)), round(seatV)], workstation: seatId, primary: false });
    }
    const candidate = { obstacles: [...kept.obstacles, ...obstacles], seats: [...kept.seats, ...seats] };
    if (suitePasses(suite, levelId, candidate)) return candidate;
  }
  return { obstacles: plan.obstacles, seats: plan.seats };
}

// Public ground rooms: the furniture programme for each hall and the café, in campus metres.
// Every piece keeps a 3 m clear route from the door to the core lobby (along the door's
// axis) and stays out of the lobby; chairs are seat sites, not collision.
const HALL_PROGRAMME = {
  T1: { title: 'Shared work lounge', tables: [[19, 50.5], [19, 65.5]], bench: null, reception: [22.6, 52.3] },
  T2: { title: 'Collaboration and project review', tables: [[18.5, 94.5], [18.5, 111.5]], bench: [19, 99] },
  T3: { title: 'Atelier workbenches', tables: [[18.5, 131.5], [18.5, 146.5]], bench: [14.6, 146.8] },
};
const WORK_TABLE = { du: 3.2, dv: 1.6, height: 0.74 }, WORKBENCH = { du: 4, dv: 0.9, height: 0.9 };
function hallFitout(tower) {
  const plan = HALL_PROGRAMME[tower.id], hall = tower.levels[0].hall, obstacles = [], seats = [];
  plan.tables.forEach(([u, v], t) => {
    const id = `${hall.id}/table-${t + 1}`;
    obstacles.push({ id, kind: 'table', rect: box(u, v, WORK_TABLE.du, WORK_TABLE.dv), height: WORK_TABLE.height });
    // Two chairs on each long side, facing the table.
    for (const [side, offset] of [[-1, -0.8], [-1, 0.8], [1, -0.8], [1, 0.8]]) {
      const seatId = `${id}-chair-${seats.filter(seat => seat.table === id).length + 1}`, position = [round(u + offset), round(v + side * (WORK_TABLE.dv / 2 + 0.45))];
      seats.push({ id: seatId, table: id, kind: 'chair', title: `${plan.title} table`, position, facing: [0, -side], height: SEAT_HEIGHT,
        approach: [position[0], round(position[1] + side * 0.9)], workstation: seatId });
    }
  });
  if (plan.reception) obstacles.push({ id: `${hall.id}/reception`, kind: 'counter', rect: box(plan.reception[0], plan.reception[1], 2.4, 0.8), height: 1.05 });
  if (plan.bench) {
    const [u, v] = plan.bench, id = `${hall.id}/workbench`;
    obstacles.push({ id, kind: 'workbench', rect: box(u, v, WORKBENCH.du, WORKBENCH.dv), height: WORKBENCH.height });
    for (const offset of [-1.2, 0, 1.2]) {
      const position = [round(u + offset), round(v - WORKBENCH.dv / 2 - 0.45)], seatId = `${id}-stool-${seats.filter(seat => seat.table === id).length + 1}`;
      seats.push({ id: seatId, table: id, kind: 'stool', title: plan.title, position, facing: [0, 1], height: 0.65, approach: [position[0], round(position[1] - 0.9)], workstation: seatId });
    }
  }
  return { roomId: hall.id, obstacles, seats };
}
function cafeFitout() {
  const cafe = CAMPUS.groundBuildings.find(item => item.id === 'C'), obstacles = [], seats = [];
  [[8, 28.2], [8, 35.8], [12.2, 28.2], [12.2, 35.8]].forEach(([u, v], t) => {
    const id = `C-hall/table-${t + 1}`;
    obstacles.push({ id, kind: 'table', rect: box(u, v, 0.8, 0.8), height: 0.74 });
    for (const side of [-1, 1]) {
      const position = [round(u + side * 0.85), v], seatId = `${id}-chair-${side < 0 ? 'a' : 'b'}`;
      seats.push({ id: seatId, table: id, kind: 'chair', title: 'Garden café table', position, facing: [-side, 0], height: SEAT_HEIGHT,
        approach: [round(position[0] + side * 0.9), v], workstation: seatId });
    }
  });
  obstacles.push({ id: 'C-hall/counter', kind: 'counter', rect: box(5.2, 32, 0.8, 4), height: 1.05 });
  return { roomId: 'C-hall', obstacles, seats, rect: cafe.rect };
}

let cache = null;
/** The fit-out of every advertised suite (by campus level) and the public ground rooms. */
export function campusFitout(layout = CAMPUS) {
  if (layout === CAMPUS && cache) return cache;
  const levels = new Map(campusLevels(layout).map(level => [level.id, { levelId: level.id, obstacles: [], seats: [] }]));
  for (const tower of layout.towers) for (const floor of tower.levels) {
    const level = campusLevels(layout).find(item => item.z === floor.z0);
    for (const suite of floor.suites) {
      const { obstacles, seats } = suiteFitout(suite, level.id);
      levels.get(level.id).obstacles.push(...obstacles);levels.get(level.id).seats.push(...seats);
    }
  }
  const result = { version: FITOUT_VERSION, levels: [...levels.values()], ground: [...layout.towers.map(hallFitout), cafeFitout()] };
  if (layout === CAMPUS) cache = result;
  return result;
}
/** Fit-out obstacles on one campus level, for #508's registerCampusLevelObstacles. */
export const campusFitoutObstacles = levelId => campusFitout().levels.find(level => level.levelId === levelId)?.obstacles ?? [];
export const campusFitoutSeat = seatId => campusFitout().levels.flatMap(level => level.seats).find(seat => seat.id === seatId) ?? null;
export const campusUnitSeats = unitId => campusFitout().levels.flatMap(level => level.seats).filter(seat => seat.unitId === unitId);

function suitePasses(suite, levelId, fitout) {
  return validateCampusFitout(CAMPUS, { levels: [{ levelId, ...fitout }], ground: [] }).ok;
}

// ---- Validation --------------------------------------------------------------
// Every rule the fit-out promises, on the contract's own geometry: furniture inside its
// room and clear of keepClear/doors; each stand point on its suite's support with the
// turning body clear of walls and furniture; and from the door, every stand point
// reachable by the turning body with every other seat of the suite taken.
export function validateCampusFitout(layout = CAMPUS, fitout = campusFitout(layout)) {
  const findings = [], fail = (rule, id, message) => findings.push({ rule, id, message });
  const levels = new Map(campusLevels(layout).map(level => [level.id, level]));
  const suites = new Map(layout.towers.flatMap(tower => tower.levels.flatMap(floor => floor.suites)).map(suite => [suite.id, suite]));
  const occupied = 2.158;
  for (const entry of fitout.levels) {
    const level = levels.get(entry.levelId);
    for (const item of entry.obstacles) {
      const suite = suites.get(item.unitId);
      if (!suite || !rectInside(item.rect, suite.rect)) fail('support', item.id, 'furniture leaves its suite');
      for (const zone of level.keepClear) if (rectsOverlap(item.rect, zone.rect)) fail('blocked', `${item.id}/${zone.id}`, 'furniture in a clear public route');
      const door = suite?.door;
      if (door && distanceToRect(door.inside, item.rect) < R + 0.2) fail('door', item.id, 'furniture crowds the door threshold');
    }
    for (const seat of entry.seats) {
      const suite = suites.get(seat.unitId), at = surfaceAt(level, seat.stand);
      if (at?.id !== seat.unitId) fail('support', seat.id, 'stand point is not on its suite');
      const others = entry.obstacles.filter(item => item.unitId === seat.unitId && item.seatId !== seat.id);
      if (!clearPoint(seat.stand, suite.rect, others)) fail('clear', seat.id, 'turning body does not fit at the stand point');
    }
    // Reachability: from each suite door to each of its stand points, others' seats taken.
    for (const suite of [...suites.values()].filter(item => entry.seats.some(seat => seat.unitId === item.id))) {
      const seats = entry.seats.filter(seat => seat.unitId === suite.id), furniture = entry.obstacles.filter(item => item.unitId === suite.id);
      for (const seat of seats) {
        const blockers = seats.filter(other => other !== seat).map(other => ({ position: other.position, radius: occupied }));
        if (!reachable(suite.rect, suite.door.inside, seat.stand, furniture.filter(item => item.seatId !== seat.id), blockers)) fail('route', seat.id, 'not reachable from the door with the other seats taken');
      }
    }
  }
  for (const room of fitout.ground) {
    const rect = room.rect ?? layout.towers.find(tower => tower.levels[0].hall.id === room.roomId).levels[0].hall.rect;
    const tower = layout.towers.find(item => item.levels[0].hall.id === room.roomId), l0 = levels.get('garden-campus/l0');
    for (const item of room.obstacles) {
      if (!rectInside(item.rect, rect)) fail('support', item.id, 'furniture leaves its room');
      for (const zone of l0.keepClear) if (rectsOverlap(item.rect, zone.rect)) fail('blocked', `${item.id}/${zone.id}`, 'furniture in a clear public route');
      if (tower && rectsOverlap(item.rect, [tower.core.rect[2], tower.levels[0].hall.door.position[1] - 1.5, tower.levels[0].hall.door.position[0], tower.levels[0].hall.door.position[1] + 1.5]))
        fail('blocked', item.id, 'furniture in the door-to-lobby route');
      if (tower && rectsOverlap(item.rect, tower.core.rect)) fail('blocked', item.id, 'furniture in the core');
    }
    for (const seat of room.seats) {
      // A street seat must be free for the walking body (walking.js RADIUS 0.35), as sit requires.
      if (!clearPoint(seat.position, rect, room.obstacles, STREET_BODY)) fail('support', seat.id, 'seat is not on free floor');
      if (!clearPoint(seat.approach, rect, room.obstacles, 0.35)) fail('clear', seat.id, 'approach is not on free floor');
    }
  }
  return { ok: findings.length === 0, findings };
}
const rectInside = (inner, outer) => inner[0] >= outer[0] - EPS && inner[1] >= outer[1] - EPS && inner[2] <= outer[2] + EPS && inner[3] <= outer[3] + EPS;
const distanceToRect = ([u, v], [u0, v0, u1, v1]) => Math.hypot(Math.max(u0 - u, 0, u - u1), Math.max(v0 - v, 0, v - v1));
const surfaceAt = (level, point) => level.surfaces.filter(item => item.rect && rectContains(item.rect, point)).sort((a, b) => (a.rect[2] - a.rect[0]) * (a.rect[3] - a.rect[1]) - (b.rect[2] - b.rect[0]) * (b.rect[3] - b.rect[1]))[0] ?? null;
function clearPoint([u, v], [u0, v0, u1, v1], obstacles, radius = R) {
  if (u < u0 + radius - EPS || u > u1 - radius + EPS || v < v0 + radius - EPS || v > v1 - radius + EPS) return false;
  return obstacles.every(item => distanceToRect([u, v], item.rect) >= radius - EPS);
}
// A 0.1 m grid flood fill for the turning body inside one rect.
function reachable(rect, from, to, obstacles, bodies, step = 0.1) {
  const [u0, v0, u1, v1] = rect, cols = Math.ceil((u1 - u0) / step) + 1, rows = Math.ceil((v1 - v0) / step) + 1;
  const free = (i, j) => { const p = [u0 + i * step, v0 + j * step];return clearPoint(p, rect, obstacles) && bodies.every(body => Math.hypot(p[0] - body.position[0], p[1] - body.position[1]) >= body.radius - EPS); };
  const cell = ([u, v]) => [Math.round((u - u0) / step), Math.round((v - v0) / step)];
  // The door's inside point is within the wall clearance by design; start from the nearest free cell inward.
  let [si, sj] = cell(from);const target = cell(to), seen = new Uint8Array(cols * rows), queue = [];
  for (let k = 0; k < 20 && !free(si, sj); k++) si += Math.sign(cell([(u0 + u1) / 2, 0])[0] - si);
  if (!free(si, sj)) return false;
  seen[sj * cols + si] = 1;queue.push([si, sj]);
  while (queue.length) {
    const [i, j] = queue.pop();
    if (Math.abs(i - target[0]) <= 1 && Math.abs(j - target[1]) <= 1) return true;
    for (const [a, b] of [[i + 1, j], [i - 1, j], [i, j + 1], [i, j - 1]]) {
      if (a < 0 || b < 0 || a >= cols || b >= rows || seen[b * cols + a] || !free(a, b)) continue;
      seen[b * cols + a] = 1;queue.push([a, b]);
    }
  }
  return false;
}
