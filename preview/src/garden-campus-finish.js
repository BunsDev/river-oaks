// The Gardens' finish pass (#511): slab bands, bronze fins, stone plinths and copings,
// timber headhouses, soffits and entrance canopies, terrace troughs, west green walls and
// the emissive luminaires that light the campus at dusk. Pure campus-metre geometry from
// #506's contract (shared/garden-campus-layout.js); garden-campus.js draws it.
//
// Nothing here moves a contract dimension. Every part sits in one of four places:
// - inside a tower plate (between the glazing line and the plate edge, or at ceiling
//   height above the 2.75 m body clearance);
// - inside a published obstacle rect (guards, parapets, planters, posts, headhouses);
// - in the air outside the building, above the body clearance of anything below it;
// - flush with the ground, at most FINISH.groundcover high.
// garden-campus-finish.test.js checks those rules against campusLevels().
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, rectsOverlap } from '../../shared/garden-campus-layout.js';

export const FINISH = Object.freeze({
  glassInset: 0.1, // the shell's glazing line inside each plate edge
  fasciaProud: 0.03, fasciaDrop: 0.07, // slab band: 3 cm proud of the plate, lapping 7 cm over the glass head
  finEvery: 2, finWidth: 0.06, // every second 1.5 m mullion deepens into a fin to the plate edge
  plinth: 0.4, coping: 0.07,
  cove: { inset: 0.8, width: 0.12, depth: 0.04 }, // perimeter ceiling light, 0.8 m inside the glazing
  canopy: { depth: 1.6, half: 1.4, z: 3.3, thickness: 0.15 },
  soffit: 0.08, // timber soffit inside the bottom of each skywalk slab
  trough: { depth: 0.3, below: 0.5, above: 0.05 }, // planted trough hung outside a terrace guard
  greenWall: 0.25, // planted depth outside a west service wall
  groundcover: 0.04,
  toeLight: 0.015, // a planter's open face sits this far back behind its toe light
  clearance: CAMPUS.body.height + CAMPUS.body.headroom,
});

const EPS = 1e-9;
const slabOf = layout => layout.bridges[0].slab;

// A run [lo, hi] minus the spans that cut it (both sorted or not).
export function freeRuns(lo, hi, cuts, min = 0.02) {
  let free = [[lo, hi]];
  for (const [c0, c1] of cuts) free = free.flatMap(([a, b]) => [[a, Math.min(b, c0)], [Math.max(a, c1), b]].filter(([x, y]) => y - x > min));
  return free;
}

// Bands that express each occupied storey: the edge of the slab above every floor, as a
// stone fascia 3 cm proud of the plate, cut where a skywalk deck meets it. One band level
// per occupied floor; the top band is the roof slab under the parapet.
export function slabBands(layout = CAMPUS) {
  const { fasciaProud: p, fasciaDrop: drop } = FINISH, slab = slabOf(layout), bands = [];
  for (const tower of layout.towers) for (const floor of tower.levels) {
    const [u0, v0, u1, v1] = floor.rect, za = floor.z1 - slab - drop, zb = floor.z1;
    const sides = [
      ['south', [u0 - p, v0 - p, u1 + p, v0]], ['north', [u0 - p, v1, u1 + p, v1 + p]],
      ['west', [u0 - p, v0, u0, v1]], ['east', [u1, v0, u1 + p, v1]],
    ];
    for (const [side, rect] of sides) {
      const horizontal = side === 'south' || side === 'north';
      const decks = layout.bridges.filter(bridge => zb > bridge.underside + EPS && za < bridge.deckZ - EPS && rectsOverlap(rect, bridge.rect));
      const cuts = decks.map(bridge => horizontal ? [bridge.rect[0], bridge.rect[2]] : [bridge.rect[1], bridge.rect[3]]);
      for (const [a, b] of freeRuns(horizontal ? rect[0] : rect[1], horizontal ? rect[2] : rect[3], cuts))
        bands.push({ tower: tower.id, floor: floor.id, level: floor.level, side, z: zb, box: horizontal ? [a, rect[1], b, rect[3], za, zb] : [rect[0], a, rect[2], b, za, zb] });
    }
  }
  return bands;
}

// The service riser zone between each west facade and its core (the contract's
// `<floor>-core-west` residual) is solid above the ground floor: a planted wall
// instead of glass. Ground-floor halls stay glazed.
export function greenWalls(layout = CAMPUS) {
  const walls = [];
  for (const tower of layout.towers) for (const floor of tower.levels) {
    if (floor.level === 1) continue;
    const zone = floor.residual.find(item => item.id === `${floor.id}-core-west`);
    if (!zone) continue;
    walls.push({ tower: tower.id, floor: floor.id, side: 'west', u: floor.rect[0], span: [zone.rect[1], zone.rect[3]], z0: floor.z0, z1: floor.z1 - slabOf(layout) });
  }
  return walls;
}

// Entrance canopies over each hall door and the café door: timber with a bronze edge,
// at FINISH.canopy.z, well above the 2.75 m body clearance of the approach below.
export function entranceCanopies(layout = CAMPUS) {
  const { depth, half, z, thickness } = FINISH.canopy, out = [];
  for (const tower of layout.towers) {
    const hall = tower.levels[0].hall, [u, v] = hall.door.position;
    out.push({ id: `${tower.id}-canopy`, rect: [u, v - half, u + depth, v + half], z0: z, z1: z + thickness });
  }
  for (const item of layout.groundBuildings.filter(b => b.kind === 'cafe' && b.door)) {
    const [u, v] = item.door, top = Math.min(z, item.height - 1.4);
    out.push({ id: `${item.id}-canopy`, rect: [u, v - half, u + depth, v + half], z0: top, z1: top + thickness });
  }
  return out;
}

// Planted troughs hung outside every terrace guard, on the slab edge, so a terrace keeps
// its whole published surface and still reads planted from inside and below.
export function terraceTroughs(levels = campusLevels(CAMPUS), layout = CAMPUS) {
  const { depth, below, above } = FINISH.trough, troughs = [];
  for (const level of levels) for (const obstacle of level.obstacles) {
    const match = /^(.+)\/(\d+)\/guard-\d+$/.exec(obstacle.id);
    if (obstacle.kind !== 'guard' || !match) continue;
    const terrace = layout.towers.flatMap(tower => tower.terraces).find(item => item.id === match[1]);
    if (!terrace) continue;
    const part = terrace.parts[Number(match[2])], [a0, b0, a1, b1] = obstacle.rect, thinU = a1 - a0 < b1 - b0;
    const centre = thinU ? (part[0] + part[2]) / 2 : (part[1] + part[3]) / 2, edge = thinU ? (a0 + a1) / 2 : (b0 + b1) / 2, out = Math.sign(edge - centre);
    const rect = thinU ? (out > 0 ? [a1, b0, a1 + depth, b1] : [a0 - depth, b0, a0, b1]) : (out > 0 ? [a0, b1, a1, b1 + depth] : [a0, b0 - depth, a1, b0]);
    // No trough over a skywalk: its route keeps the open sky above the guard line.
    const cuts = layout.bridges.filter(bridge => rectsOverlap(rect, bridge.rect)).map(bridge => thinU ? [bridge.rect[1], bridge.rect[3]] : [bridge.rect[0], bridge.rect[2]]);
    for (const [s0, s1] of freeRuns(thinU ? rect[1] : rect[0], thinU ? rect[3] : rect[2], cuts, 0.5)) {
      const piece = thinU ? [rect[0], s0, rect[2], s1] : [s0, rect[1], s1, rect[3]];
      troughs.push({ id: `${obstacle.id}/trough${cuts.length ? `-${s0.toFixed(1)}` : ''}`, terrace: terrace.id, tower: terrace.tower, z: terrace.z, rect: piece, outward: thinU ? [out, 0] : [0, out], z0: terrace.z - below, z1: terrace.z + above });
    }
  }
  return troughs;
}

// The side of a planter that faces its walking surface: away from a guard or parapet running
// along it within 0.6 m (a roof bed keeps a 0.5 m edge zone). null for a free-standing planter.
export function planterOpenSide([u0, v0, u1, v1], level) {
  const alongV = v1 - v0 >= u1 - u0, near = (a, b) => Math.abs(a - b) < 0.6;
  const guards = level.obstacles.filter(item => item.kind === 'guard');
  const touches = side => guards.some(({ rect: [g0, h0, g1, h1] }) => alongV
    ? (side === 'west' ? near(g1, u0) : near(g0, u1)) && h1 > v0 && h0 < v1
    : (side === 'south' ? near(h1, v0) : near(h0, v1)) && g1 > u0 && g0 < u1);
  const [a, b] = alongV ? ['west', 'east'] : ['south', 'north'];
  return touches(a) && !touches(b) ? b : touches(b) && !touches(a) ? a : null;
}

// Furniture the contract publishes (#506 `furnishings`, proposed by #511): a `seat` is a timber
// bench on bronze legs filling its rect; a `table` is a meeting table with four chairs on a
// flush timber pad that marks its whole footprint, so its collision is never invisible.
export function campusFurniture(levels = campusLevels(CAMPUS)) {
  const parts = [], push = (finish, rect, z0, z1) => parts.push({ finish, box: [...rect, z0, z1] });
  for (const level of levels) for (const item of level.obstacles) {
    const [u0, v0, u1, v1] = item.rect, z = level.z, alongV = v1 - v0 >= u1 - u0;
    if (item.kind === 'seat') {
      push('timber', [u0, v0, u1, v1], z + 0.4, z + 0.46);
      for (const end of [0.12, 0.88]) {
        const s = alongV ? v0 + (v1 - v0) * end : u0 + (u1 - u0) * end;
        push('bronze', alongV ? [u0 + 0.06, s - 0.03, u1 - 0.06, s + 0.03] : [s - 0.03, v0 + 0.06, s + 0.03, v1 - 0.06], z, z + 0.4);
      }
    } else if (item.kind === 'table') {
      push('timber', [u0, v0, u1, v1], z, z + 0.03);
      const c = [(u0 + u1) / 2, (v0 + v1) / 2], [w, d] = alongV ? [0.8, 1.4] : [1.4, 0.8];
      push('timber', [c[0] - w / 2, c[1] - d / 2, c[0] + w / 2, c[1] + d / 2], z + 0.72, z + 0.76);
      push('bronze', [c[0] - 0.05, c[1] - 0.05, c[0] + 0.05, c[1] + 0.05], z, z + 0.72);
      for (const [du, dv] of alongV ? [[-1, -0.35], [-1, 0.35], [1, -0.35], [1, 0.35]] : [[-0.35, -1], [0.35, -1], [-0.35, 1], [0.35, 1]]) {
        // Two chairs on each long side of the table, 0.32 m out from its edge.
        const cu = c[0] + du * (alongV ? w / 2 + 0.32 : w), cv = c[1] + dv * (alongV ? d : d / 2 + 0.32);
        const chair = [Math.max(u0, cu - 0.22), Math.max(v0, cv - 0.22), Math.min(u1, cu + 0.22), Math.min(v1, cv + 0.22)];
        push('timber', chair, z + 0.42, z + 0.46);push('bronze', [chair[0] + 0.05, chair[1] + 0.05, chair[2] - 0.05, chair[3] - 0.05], z, z + 0.42);
      }
    }
  }
  return parts;
}

// Emissive luminaires. They add no light to the scene: glazing, decks and paths read lit at
// dusk through emissive surfaces alone, which the time of day scales (garden-campus.js).
export function luminaires(levels = campusLevels(CAMPUS), layout = CAMPUS) {
  const { inset, width, depth } = FINISH.cove, slab = slabOf(layout), out = [];
  const push = (kind, rect, z0, z1, extra = {}) => out.push({ kind, rect, z0, z1, ...extra });
  for (const tower of layout.towers) for (const floor of tower.levels) {
    // A perimeter cove under each ceiling, inside the glazing: one ring per occupied floor.
    const [u0, v0, u1, v1] = floor.rect, g = FINISH.glassInset + inset, ceiling = floor.z1 - slab;
    for (const rect of [[u0 + g, v0 + g, u1 - g, v0 + g + width], [u0 + g, v1 - g - width, u1 - g, v1 - g],
      [u0 + g, v0 + g + width, u0 + g + width, v1 - g - width], [u1 - g - width, v0 + g + width, u1 - g, v1 - g - width]])
      push('cove', rect, ceiling - depth, ceiling, { tower: tower.id, floor: floor.id, level: floor.level });
    // The core lobby ceiling, which the stair and lift landings share.
    const [l0, c0, l1, c1] = tower.core.lobby.rect;
    push('lobby', [l0 + 0.25, c0 + 0.5, l1 - 0.25, c1 - 0.5], ceiling - depth, ceiling, { tower: tower.id, floor: floor.id, level: floor.level });
  }
  for (const level of levels) for (const obstacle of level.obstacles) {
    const [a0, b0, a1, b1] = obstacle.rect, thinU = a1 - a0 < b1 - b0;
    if (obstacle.kind === 'guard' && /\/edge-(west|east)$/.test(obstacle.id)) {
      // Skywalk: a step light on the inner face of each planted edge, washing the deck.
      const inner = obstacle.id.endsWith('west') ? [a1 - 0.02, b0, a1, b1] : [a0, b0, a0 + 0.02, b1];
      push('deck', inner, level.z + 0.3, level.z + 0.33);
    } else if (obstacle.kind === 'guard' && obstacle.id.includes('/parapet-')) {
      continue; // parapets stay solid stone; the roof reads lit from its beds and headhouse
    } else if (obstacle.kind === 'guard') {
      // Terrace guard: a strip under the handrail.
      push('guard', obstacle.rect, level.z + 1.0, level.z + 1.03);
    } else if (obstacle.kind === 'planter') {
      // Beds: a toe light along the face that meets the walking surface, inside the bed's rect.
      const t = FINISH.toeLight, open = planterOpenSide(obstacle.rect, level), strip = { east: [a1 - t, b0 + 0.3, a1, b1 - 0.3], west: [a0, b0 + 0.3, a0 + t, b1 - 0.3],
        north: [a0 + 0.3, b1 - t, a1 - 0.3, b1], south: [a0 + 0.3, b0, a1 - 0.3, b0 + t] }[open];
      if (strip) push('bed', strip, level.z + 0.06, level.z + 0.09);
    }
  }
  // Paths: flush in-ground lines along the promenade and both cross-routes, cut where other
  // paths join (they stay below FINISH.groundcover, so nothing is stepped over).
  for (const id of ['P1', 'P2', 'P5']) {
    const path = layout.paths.find(item => item.id === id), [u0, v0, u1, v1] = path.rect, alongV = v1 - v0 > u1 - u0;
    const others = layout.paths.filter(item => item !== path);
    for (const edge of alongV ? [u0 + 0.15, u1 - 0.15] : [v0 + 0.15, v1 - 0.15]) {
      const line = alongV ? [edge - 0.03, v0, edge + 0.03, v1] : [u0, edge - 0.03, u1, edge + 0.03];
      const cuts = others.filter(item => rectsOverlap(item.rect, line)).map(item => alongV ? [item.rect[1] - 0.6, item.rect[3] + 0.6] : [item.rect[0] - 0.6, item.rect[2] + 0.6]);
      for (const [a, b] of freeRuns(alongV ? v0 + 0.6 : u0 + 0.6, alongV ? v1 - 0.6 : u1 - 0.6, cuts, 1))
        push('path', alongV ? [line[0], a, line[2], b] : [a, line[1], b, line[3]], 0.012, 0.03);
    }
  }
  // Pergola: a strip under each long edge beam, overhead.
  for (const item of layout.groundBuildings.filter(b => b.kind === 'pergola')) {
    const [u0, v0, u1, v1] = item.rect;
    for (const v of [v0 + 0.15, v1 - 0.15]) push('pergola', [u0 + 0.3, v - 0.04, u1 - 0.3, v + 0.04], item.height - 0.43, item.height - 0.4);
  }
  for (const canopy of entranceCanopies(layout)) {
    const [u0, v0, u1, v1] = canopy.rect;
    push('canopy', [u0 + 0.2, v0 + 0.2, u1 - 0.2, v1 - 0.2], canopy.z0 - 0.02, canopy.z0);
  }
  for (const item of layout.groundBuildings.filter(b => b.kind === 'cafe')) {
    const [u0, v0, u1, v1] = item.rect;
    push('cafe', [u0 + 1, v0 + 1, u1 - 1, v1 - 1], item.height - 0.36, item.height - 0.32);
  }
  return out;
}

// The finished storey count per tower, read from the bands themselves: distinct band
// heights. A finish must never add a band (a false storey) or drop one.
export function expressedStoreys(bands = slabBands()) {
  const byTower = {};
  for (const band of bands) (byTower[band.tower] ??= new Set()).add(band.z);
  return Object.fromEntries(Object.entries(byTower).map(([id, set]) => [id, [...set].sort((a, b) => a - b)]));
}
