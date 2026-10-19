// The Gardens' interior walls on every upper level: each private suite and service room
// closed off from the public galleries, spines, spurs and lobbies, and from its neighbours,
// with a closed door in each suite's contract door opening. Pure geometry in campus metres
// from #506's contract (campusLevels surfaces and suite-door openings). The campus renderer
// (preview/src/garden-campus.js) draws it, and #510's fit-out keeps every seat's turning body
// clear of it. #508's level authority, not these walls, owns who crosses a suite door.
//
// A wall on a private/public boundary sits wholly inside the private room, so every public
// route keeps its contract clear width; a wall between two rooms is centred on their shared
// line. Facade edges (glazing) and the core shafts already close a room there.
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels } from './garden-campus-layout.js';

export const PARTITION_THICKNESS = 0.12, SUITE_DOOR_HEIGHT = 2.6;
const JAMB = 0.06, HEAD = 0.08, LEAF = 0.05, EPS = 1e-6;
const enclosed = surface => surface.access === 'private-suite' || surface.access === 'service';

// [lo, hi] minus each [a, b] in cuts.
const subtract = (spans, cuts) => cuts.reduce((free, [a, b]) => free.flatMap(([lo, hi]) => [[lo, Math.min(hi, a)], [Math.max(lo, b), hi]].filter(([x, y]) => y - x > 0.02)), spans);
// The part of rect's edge lying on the line axis = at (axis 0: u = at, running along v; axis 1: v = at, along u).
const along = (rect, axis, at) => {
  const [u0, v0, u1, v1] = rect;
  if (axis === 0 && (Math.abs(u0 - at) < EPS || Math.abs(u1 - at) < EPS)) return [v0, v1];
  if (axis === 1 && (Math.abs(v0 - at) < EPS || Math.abs(v1 - at) < EPS)) return [u0, u1];
  return null;
};
const overlap = ([a, b], [c, d]) => [Math.max(a, c), Math.min(b, d)];

/**
 * Walls and doors for every level: { walls: [{ levelId, room, rect, z0, z1 }], doors: [{ id, levelId,
 * room, axis, at, span, z0, head, headTop, jambs: [rect, rect], headRect, leaf }] }, rects as [u0, v0, u1, v1].
 */
export function campusPartitions(layout = CAMPUS) {
  const walls = [], doors = [], slab = layout.bridges[0].slab;
  for (const level of campusLevels(layout)) {
    const rooms = level.surfaces.filter(enclosed);
    if (!rooms.length) continue;
    const shafts = level.obstacles.filter(item => item.kind === 'lift' || item.kind === 'stair');
    const suiteDoors = level.openings.filter(opening => opening.kind === 'suite-door');
    for (const room of rooms) {
      const floor = layout.towers.find(tower => tower.id === room.tower).levels.find(item => item.z0 === level.z);
      const [p0, q0, p1, q1] = floor.rect, z0 = level.z, z1 = floor.z1 - slab;
      const [u0, v0, u1, v1] = room.rect;
      // A wall [c, d] across the line (axis 0: u, axis 1: v) and [a, b] along it, from `from` to the ceiling slab.
      const wall = (axis, c, d, a, b, from = z0) => ({ levelId: level.id, room: room.id, rect: axis === 0 ? [c, a, d, b] : [a, c, b, d], z0: from, z1 });
      // Each edge: the axis it is fixed on, its coordinate, which way is into the room, and its run.
      for (const [axis, at, inward, span, facade] of [[1, v0, 1, [u0, u1], q0], [1, v1, -1, [u0, u1], q1], [0, u0, 1, [v0, v1], p0], [0, u1, -1, [v0, v1], p1]]) {
        if (Math.abs(at - facade) < EPS) continue;
        // Closed already by a shaft; open where this suite's own door is.
        let free = subtract([span], shafts.map(shaft => along(shaft.rect, axis, at)).filter(Boolean));
        const own = suiteDoors.filter(door => door.to === room.id && Math.abs(door.position[axis] - at) < EPS);
        free = subtract(free, own.map(door => [door.position[1 - axis] - door.width / 2, door.position[1 - axis] + door.width / 2]));
        // A run shared with another room is one wall centred on the line, drawn by the room
        // with the lower id; the rest faces public ground and sits inside this room.
        const neighbours = rooms.filter(other => other !== room).map(other => ({ other, run: along(other.rect, axis, at) })).filter(item => item.run);
        for (const run of free) {
          const shared = neighbours.map(({ other, run: theirs }) => ({ other, run: overlap(run, theirs) })).filter(item => item.run[1] - item.run[0] > 0.02);
          for (const { other, run: [a, b] } of shared) if (room.id < other.id) walls.push(wall(axis, at - PARTITION_THICKNESS / 2, at + PARTITION_THICKNESS / 2, a, b));
          for (const [a, b] of subtract([run], shared.map(item => item.run))) {
            const [c, d] = inward > 0 ? [at, at + PARTITION_THICKNESS] : [at - PARTITION_THICKNESS, at];
            walls.push(wall(axis, c, d, a, b));
          }
        }
        for (const door of own) {
          const centre = door.position[1 - axis], half = door.width / 2, mid = at + inward * PARTITION_THICKNESS / 2;
          const across = [mid - PARTITION_THICKNESS / 2, mid + PARTITION_THICKNESS / 2], rect = (a, b, [c, d] = across) => axis === 0 ? [c, a, d, b] : [a, c, b, d];
          walls.push(wall(axis, ...across, centre - half, centre + half, z0 + SUITE_DOOR_HEIGHT + HEAD));
          doors.push({ id: door.id, levelId: level.id, room: room.id, axis, at, span: [centre - half, centre + half], z0, head: z0 + SUITE_DOOR_HEIGHT, headTop: z0 + SUITE_DOOR_HEIGHT + HEAD,
            jambs: [rect(centre - half - JAMB, centre - half), rect(centre + half, centre + half + JAMB)], headRect: rect(centre - half - JAMB, centre + half + JAMB),
            leaf: rect(centre - half, centre + half, [mid - LEAF / 2, mid + LEAF / 2]) });
        }
      }
    }
  }
  return { walls, doors };
}
