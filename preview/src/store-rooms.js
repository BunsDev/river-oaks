import { terrainHeight } from './geometry.js';
import { clearStandingStations } from './store-clearance.js';

// Walk-in boutique floor plans behind each mapped storefront. Rooms stay inside
// the OSM footprint ring, never overlap, and open through the mapped entrance.
// Everything here is an interpretation: real tenant layouts are not surveyed.
const THEMES = { clothes: 'fashion', bag: 'leather', fashion_accessories: 'leather', jewelry: 'jewelry', perfumery: 'perfumery', hairdresser: 'salon', wellness: 'wellness', restaurant: 'dining', ice_cream: 'gelato', cinema: 'cinema', art: 'gallery', optician: 'optician', home: 'home' };
export const THEME_LABELS = { fashion: 'Fashion boutique', leather: 'Leather goods & accessories', jewelry: 'Jewelry salon', perfumery: 'Perfumery', salon: 'Hair salon', wellness: 'Wellness club', dining: 'Dining room & bar', gelato: 'Gelato counter', cinema: 'Cinema lobby', gallery: 'Art gallery', optician: 'Eyewear studio', home: 'Furnished home lounge' };
export const DOOR_HALF_WIDTH = 0.85;
export const ROOM_HEIGHT = 3.9;

function inside(point, ring) {
  let result = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i], b = ring[j];
    if ((a[1] > point[1]) !== (b[1] > point[1]) && point[0] < (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
  }
  return result;
}

// Separating-axis test for two convex quadrilaterals (rooms may meet at any angle).
export function rectanglesOverlap(a, b, margin = 0) {
  for (const polygon of [a, b]) for (let i = 0; i < polygon.length; i++) {
    const p = polygon[i], q = polygon[(i + 1) % polygon.length], nx = -(q[1] - p[1]), ny = q[0] - p[0], length = Math.hypot(nx, ny) || 1;
    const project = points => points.reduce(([lo, hi], point) => { const v = (point[0] * nx + point[1] * ny) / length; return [Math.min(lo, v), Math.max(hi, v)]; }, [Infinity, -Infinity]);
    const [aLo, aHi] = project(a), [bLo, bHi] = project(b);
    if (aHi <= bLo + margin || bHi <= aLo + margin) return false;
  }
  return true;
}

const cache = new WeakMap();
export function storeRoomsFor(world) {
  if (!world || typeof world !== 'object') return [];
  if (!cache.has(world)) cache.set(world, planStoreRooms(world));
  return cache.get(world);
}

export function planStoreRooms(world) {
  if (!Array.isArray(world?.stores) || !Array.isArray(world?.buildings)) return [];
  const rooms = [];
  world.stores.forEach((store, index) => {
    const building = world.buildings.find(item => item.id === store.building_id);
    if (!building || building.kind === 'parking' || !Array.isArray(building.ring) || !store.outward || !store.facade) return;
    const [fx, fn] = store.facade, [ox, oy] = store.outward;
    const inward = [-ox, -oy], right = [-oy, ox];
    const toWorld = (a, d) => [fx + right[0] * a + inward[0] * d, fn + right[1] * a + inward[1] * d];
    const toLocal = (east, north) => [(east - fx) * right[0] + (north - fn) * right[1], (east - fx) * inward[0] + (north - fn) * inward[1]];
    const grid = facadeBayGrid(building, store);
    const others = world.stores.filter(other => other !== store && other.building_id === store.building_id);
    const overlapsDoor = (aMin, aMax) => others.some(other => { const [a, d] = toLocal(other.facade[0], other.facade[1]); return Math.abs(d) < 1.5 && a > aMin - 0.4 && a < aMax + 0.4; });
    const fits = (aMin, aMax, depth) => {
      const corners = [[aMin, 0.5], [aMax, 0.5], [aMin, depth], [aMax, depth], [(aMin + aMax) / 2, depth], [(aMin + aMax) / 2, depth / 2]];
      const footprint = [[aMin, 0], [aMax, 0], [aMax, depth], [aMin, depth]].map(([a, d]) => toWorld(a, d));
      return !overlapsDoor(aMin, aMax) && corners.every(([a, d]) => inside(toWorld(a, d), building.ring)) && !rooms.some(other => rectanglesOverlap(footprint, other.footprint, 0.001));
    };
    // Candidate spans: whole facade bays around the door when the frontage is
    // mapped, so party walls land on the existing pier grid.
    const spans = [];
    if (grid) {
      for (let count = Math.min(grid.bays, 4); count >= 1; count--) for (let shift = 0; shift < count; shift++) {
        const k0 = grid.doorBay - Math.floor((count - 1) / 2) + (shift % 2 ? Math.ceil(shift / 2) : -Math.ceil(shift / 2));
        if (k0 < 0 || k0 + count > grid.bays || grid.doorBay < k0 || grid.doorBay >= k0 + count) continue;
        const ends = [grid.sign * (k0 * grid.span - grid.along), grid.sign * ((k0 + count) * grid.span - grid.along)];
        spans.push({ aMin: Math.min(...ends), aMax: Math.max(...ends), bay: { buildingId: building.id, edgeIndex: grid.edgeIndex, k0, count } });
      }
    }
    const free = [];
    for (let width = 14; width >= 5; width -= 1) free.push({ aMin: -width / 2, aMax: width / 2, bay: null });
    const choose = candidates => {
      let best = null;
      for (const span of candidates) {
        const width = span.aMax - span.aMin;
        if (width < 3 || span.aMin > -0.35 || span.aMax < 0.35) continue;
        for (let depth = 9; depth >= 4.5; depth -= 0.5) {
          if (width * depth <= (best?.area ?? 0)) break;
          if (fits(span.aMin, span.aMax, depth)) { best = { ...span, width, depth, area: width * depth }; break; }
        }
      }
      return best;
    };
    // Bay-aligned spans win whenever one fits; symmetric spans are the fallback.
    const best = choose(spans) ?? choose(free);
    if (!best) return;
    const room = {
      id: store.id, storeId: store.id, buildingId: building.id, name: store.name, category: store.category, theme: THEMES[store.category] ?? 'fashion', index,
      facade: [fx, fn], outward: [ox, oy], inward, right, aMin: best.aMin, aMax: best.aMax, center: (best.aMin + best.aMax) / 2,
      width: best.width, depth: best.depth, height: ROOM_HEIGHT, bay: best.bay,
      floor: terrainHeight(world.terrain, fx, fn) + (world.walkSurfaceOffset ?? 0.2),
      toWorld, toLocal,
      contains(east, north, shrink = 0) {
        const [a, d] = toLocal(east, north);
        return a > best.aMin + shrink && a < best.aMax - shrink && d > shrink && d < best.depth - shrink;
      },
      footprint: [[best.aMin, 0], [best.aMax, 0], [best.aMax, best.depth], [best.aMin, best.depth]].map(([a, d]) => toWorld(a, d)),
      fixtures: [], obstacles: [], people: [], lights: [],
    };
    // The entrance throat extends 1.4 m outside the room footprint. Include
    // it so the broad phase never excludes a point accepted by roomAt().
    const entrance = [toWorld(-DOOR_HALF_WIDTH, -1.4), toWorld(DOOR_HALF_WIDTH, -1.4)];
    const bounds = [...room.footprint, ...entrance];
    room.lookupBounds = [
      Math.min(...bounds.map(point => point[0])), Math.min(...bounds.map(point => point[1])),
      Math.max(...bounds.map(point => point[0])), Math.max(...bounds.map(point => point[1])),
    ];
    layoutRoom(room);
    rooms.push(room);
  });
  return rooms;
}

// Mirror the facade bay grid used by the district renderer: bays of ~3.2 m along
// the ring edge that carries this store's mapped entrance.
function facadeBayGrid(building, store) {
  const ring = building.ring, [fx, fn] = store.facade, right = [-store.outward[1], store.outward[0]];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
    if (length < 1) continue;
    const sx = fx - a[0], sy = fn - a[1], along = (sx * dx + sy * dy) / length, distance = Math.abs(sx * dy - sy * dx) / length;
    if (distance >= 0.2 || along < 0 || along > length) continue;
    const bays = Math.max(1, Math.floor(length / 3.2)), span = length / bays;
    return { edgeIndex: i, along, span, bays, doorBay: Math.min(bays - 1, Math.floor(along / span)), sign: Math.sign((dx * right[0] + dy * right[1]) / length) || 1 };
  }
  return null;
}

// Fixture footprints double as walking obstacles inside the room.
function block(room, kind, a, d, w, l, extra = {}) {
  room.fixtures.push({ kind, a, d, w, l, ...extra });
  if (extra.walkable) return;
  room.obstacles.push({ a0: a - w / 2, a1: a + w / 2, d0: d - l / 2, d1: d + l / 2 });
}
function wall(room, kind, side, d0, d1, extra = {}) {
  const a = side * (room.width / 2 - 0.24);
  room.fixtures.push({ kind, side, a, d0, d1, ...extra });
  room.obstacles.push({ a0: Math.min(a - 0.3, a + 0.3), a1: Math.max(a - 0.3, a + 0.3), d0, d1 });
  if(kind==='bar')room.obstacles.push({a0:a-side*0.5-0.36,a1:a-side*0.5+0.36,d0:d0-0.02,d1:d1+0.02});
}
function person(room, role, pose, a, d, facing, extra = {}) {
  room.people.push({ role, pose, a, d, facing, ...extra });
}
function downlights(room, columns) {
  for (let d = 1.3; d < room.depth - 0.6; d += 2.2) for (const a of columns) room.lights.push({ a, d, y: room.height - 0.02, accent: false });
}
function guests(room, count, spots) {
  spots.slice(0, count).forEach(([a, d, facing, pose = 'browse'], i) => person(room, 'guest', pose, a, d, facing, { seed: room.index * 7 + i }));
}

function layoutRoom(room) {
  const W = room.width, D = room.depth, half = W / 2, back = D - 0.9;
  const columns = W > 9.5 ? [-W / 3, 0, W / 3] : [-W / 4, W / 4];
  downlights(room, columns);
  const lay = LAYOUTS[room.theme] ?? LAYOUTS.fashion;
  lay(room, { W, D, half, back });
  // Layouts are authored around the room centre; the door sits at a = 0.
  for (const item of [...room.fixtures, ...room.people, ...room.lights]) { if ('a' in item) item.a += room.center; }
  for (const item of room.obstacles) { item.a0 += room.center; item.a1 += room.center; }
  // Keep the entrance clear of fixtures so the doorway is always walkable.
  room.obstacles = room.obstacles.filter(o => !(o.d0 < 1.4 && o.a1 > -DOOR_HALF_WIDTH - 0.5 && o.a0 < DOOR_HALF_WIDTH + 0.5));
  clearStandingStations(room);
  room.summary = {
    label: THEME_LABELS[room.theme],
    staff: room.people.filter(p => p.role === 'staff').length,
    guests: room.people.filter(p => p.role === 'guest').length,
    mannequins: room.people.filter(p => p.role === 'mannequin').length,
    highlights: [...new Set(room.fixtures.map(f => HIGHLIGHTS[f.kind]).filter(Boolean))].slice(0, 4),
  };
}

const HIGHLIGHTS = { rail: 'garment rails', table: 'display tables', coffeeTable: 'coffee table', counter: 'cash wrap', vitrine: 'glass vitrines', shelves: 'lit shelving', bookshelf: 'bookshelves', sofa: 'sofa', niche: 'jewelry niches', mirror: 'mirrors', bench: 'seating', bar: 'back bar', dining: 'tables', pendant: 'pendant lamps', station: 'styling stations', basin: 'wash basins', reception: 'reception desk', gelato: 'gelato case', lightbox: 'poster light boxes', concession: 'concession counter', popcorn: 'popcorn machine', artwork: 'framed canvases', plinth: 'sculpture plinths', eyewear: 'eyewear walls', desk: 'consultation desk', plant: 'greenery', towels: 'towel shelves', rope: 'velvet ropes' };

const LAYOUTS = {
  home(room, { W, D, half }) {
    // A living room leaves a clear central path from the door to the back wall.
    wall(room, 'bookshelf', -1, 1.5, D - 1.2);
    block(room, 'sofa', 0, D - 0.62, Math.min(2.7, W - 1.6), 0.8);
    block(room, 'coffeeTable', W * 0.27, D - 1.65, 0.9, 0.55);
    block(room, 'chair', -W * 0.28, D - 1.65, 0.6, 0.6, { style: 'armchair', yaw: Math.PI });
    block(room, 'plant', half - 0.55, D - 0.65, 0.5, 0.5);
    room.fixtures.push({ kind: 'artwork', wall: 'back', a: 0, d: D - 0.18, w: Math.min(2.3, W - 1.4), h: 1.15, y: 2.15, seed: room.index + 29 });
    room.fixtures.push({ kind: 'artwork', side: 1, a: half - 0.18, d: 1.65, w: 1.1, h: 0.9, y: 1.6, seed: room.index + 43 });
    person(room, 'guest', 'seated', -0.45, D - 0.62, [0, -1], { seat: 0.46, seed: room.index * 7 });
    person(room, 'guest', 'stand', half - 0.9, Math.max(1.7, D - 2.7), [-1, 0], { seed: room.index * 7 + 1 });
  },
  fashion(room, { W, D, half, back }) {
    const narrow = W < 5.5;
    for (const side of [-1, 1]) wall(room, 'rail', side, 1.6, D - 2.4, { shelf: true });
    for (const side of [-1, 1]) wall(room, 'shelves', side, D - 2.2, D - 1.0, { contents: 'shoes' });
    if (narrow) block(room, 'table', 0, D * 0.5, 1.2, 0.7, { contents: 'folded' });
    else {
      block(room, 'table', -W * 0.18, D * 0.36, 1.7, 0.85, { contents: 'folded' });
      block(room, 'table', W * 0.18, D * 0.62, 1.7, 0.85, { contents: 'folded' });
      block(room, 'bench', 0, D * 0.5, 1.4, 0.5);
    }
    block(room, 'counter', 0, back, 2.6, 0.65, { style: 'cashwrap' });
    room.fixtures.push({ kind: 'feature', quadrant: 0, a: 0, d: D - 0.22, w: Math.min(5, W - 1.2), h: 2.6 });
    block(room, 'mirror', -half + 0.26, D - 1.6, 0.06, 0.9, { side: -1 });
    for (const side of narrow ? [1] : [-1, 1]) { block(room, 'plinth', side * W * 0.3, 1.1, 0.7, 0.7, { style: 'low' }); person(room, 'mannequin', 'pose', side * W * 0.3, 1.1, [side * 0.35, -1]); }
    person(room, 'staff', 'attend', 0, back + 0.7, [0, -1]);
    if (!narrow) person(room, 'staff', 'greet', W * 0.3, D * 0.5, [-1, -0.3]);
    guests(room, narrow ? 2 : 3, [[-half + 0.95, D * 0.42, [-1, 0]], [half - 0.95, D * 0.7, [1, 0]], [-W * 0.18, D * 0.36 - 0.9, [0, 1]]]);
  },
  leather(room, { W, D, half, back }) {
    for (const side of [-1, 1]) wall(room, 'shelves', side, 1.4, D - 1.4, { contents: 'bags' });
    block(room, 'table', 0, D * 0.42, 2.2, 0.9, { contents: 'smallgoods' });
    block(room, 'bench', 0, D * 0.68, 1.3, 0.5);
    block(room, 'counter', 0, back, 2.4, 0.65, { style: 'cashwrap' });
    room.fixtures.push({ kind: 'feature', quadrant: 0, a: 0, d: D - 0.22, w: Math.min(5, W - 1.2), h: 2.6 });
    block(room, 'plinth', W * 0.28, 1.1, 0.7, 0.7, { style: 'low' }); person(room, 'mannequin', 'pose', W * 0.28, 1.1, [0.3, -1]);
    person(room, 'staff', 'attend', 0, back + 0.7, [0, -1]);
    guests(room, 2, [[-half + 0.95, D * 0.5, [-1, 0]], [0.3, D * 0.42 - 0.95, [0, 1]]]);
  },
  jewelry(room, { W, D, half, back }) {
    for (const side of [-1, 1]) wall(room, 'niche', side, 1.4, D - 1.8);
    const rows = D > 7 ? [D * 0.32, D * 0.55] : [D * 0.4], sides = W < 5.5 ? [0] : [-1, 1];
    for (const d of rows) for (const side of sides) block(room, 'vitrine', side * Math.min(1.6, W * 0.18), d, 1.3, 0.62);
    block(room, 'desk', 0, back - 0.1, 1.6, 0.8, { style: 'consultation' });
    block(room, 'chair', -0.5, back - 1.0, 0.5, 0.5, { style: 'armchair', yaw: Math.PI });
    block(room, 'chair', 0.5, back - 1.0, 0.5, 0.5, { style: 'armchair', yaw: Math.PI });
    room.fixtures.push({ kind: 'feature', quadrant: 1, a: 0, d: D - 0.22, w: Math.min(4.6, W - 1.2), h: 2.6 });
    person(room, 'staff', 'attend', 0, back + 0.75, [0, -1]);
    person(room, 'staff', 'attend', -Math.min(1.6, W * 0.18), rows[0] + 0.85, [0, -1]);
    guests(room, 2, [[Math.min(1.6, W * 0.18), rows[0] - 0.85, [0, 1], 'browse'], [half - 0.95, D * 0.6, [1, 0], 'browse']]);
  },
  perfumery(room, { W, D, half, back }) {
    for (const side of [-1, 1]) wall(room, 'shelves', side, 1.3, D - 1.6, { contents: 'bottles', lit: true });
    block(room, 'table', 0, D * 0.45, 2.0, 0.9, { contents: 'bottles' });
    block(room, 'counter', 0, back, 2.4, 0.65, { style: 'cashwrap' });
    room.fixtures.push({ kind: 'feature', quadrant: 3, a: 0, d: D - 0.22, w: Math.min(5, W - 1.2), h: 2.6 });
    block(room, 'plant', -half + 0.6, D - 1.5, 0.5, 0.5);
    person(room, 'staff', 'attend', 0, back + 0.7, [0, -1]);
    person(room, 'staff', 'greet', -W * 0.2, D * 0.3, [1, -0.4]);
    guests(room, 2, [[half - 0.95, D * 0.45, [1, 0]], [0.4, D * 0.45 - 0.95, [0, 1]]]);
  },
  salon(room, { W, D, half, back }) {
    const stations = Math.max(2, Math.min(4, Math.floor((D - 3) / 1.7)));
    for (let i = 0; i < stations; i++) {
      const d = 2.2 + i * 1.7;
      wall(room, 'station', -1, d - 0.5, d + 0.5);
      block(room, 'chair', -half + 1.15, d, 0.6, 0.6, { style: 'salon', yaw: Math.PI / 2, walkable: true });
      person(room, i % 2 ? 'guest' : 'guest', 'seated', -half + 1.15, d, [1, 0], { seat: 0.48, seed: room.index * 5 + i });
      if (i < 2) person(room, 'staff', 'style', -half + 1.95, d + 0.1, [-1, 0]);
    }
    for (let i = 0; i < 2; i++) block(room, 'basin', W * 0.25 + i * 0.9, back, 0.7, 0.9);
    wall(room, 'shelves', 1, 1.4, D - 2.2, { contents: 'bottles' });
    block(room, 'reception', 0.4, 1.3, 1.6, 0.6);
    person(room, 'staff', 'attend', 0.4, 2.0, [0, -1]);
    block(room, 'plant', half - 0.6, D - 1.4, 0.5, 0.5);
  },
  wellness(room, { W, D, half, back }) {
    block(room, 'reception', 0, 1.9, 2.4, 0.7);
    person(room, 'staff', 'attend', 0, 2.6, [0, -1]);
    for (const side of [-1, 1]) wall(room, 'towels', side, 1.2, D - 1.6);
    block(room, 'bench', -W * 0.22, D * 0.62, 1.5, 0.5);
    block(room, 'bench', W * 0.22, D * 0.62, 1.5, 0.5);
    block(room, 'plant', -half + 0.6, back, 0.5, 0.5);
    block(room, 'plant', half - 0.6, back, 0.5, 0.5);
    block(room, 'plinth', 0, back, 0.6, 0.6, { style: 'water' });
    room.fixtures.push({ kind: 'feature', quadrant: 3, a: 0, d: D - 0.22, w: Math.min(4.5, W - 1.2), h: 2.4 });
    guests(room, 2, [[-half + 0.95, D * 0.4, [-1, 0], 'stand'], [W * 0.22, D * 0.62 - 0.6, [0, 1], 'stand']]);
    person(room, 'staff', 'greet', W * 0.3, D * 0.35, [-1, -0.2]);
  },
  dining(room, { W, D, half, back }) {
    if (W > 5.5) {
      wall(room, 'bar', 1, 1.6, Math.min(D - 1.2, 7.5));
      for (let i = 0; i < 3; i++) block(room, 'stool', half - 1.35, 2.4 + i * 1.1, 0.4, 0.4, { walkable: true });
    }
    room.fixtures.push({ kind: 'feature', quadrant: 2, a: 0, d: D - 0.22, w: Math.min(5, W - 1.2), h: 2.6 });
    block(room, 'reception', -W * 0.28, 1.2, 0.6, 0.45, { style: 'host' });
    person(room, 'staff', 'attend', -W * 0.28, 1.8, [0, -1]);
    const cols = W > 9 ? [-W * 0.32, -W * 0.05] : W > 5.5 ? [-W * 0.22] : [-W * 0.12];
    let seatIndex = 0;
    for (const a of cols) for (let d = 3.0; d < back - 0.4; d += 2.1) {
      block(room, 'dining', a, d, 0.95, 0.95);
      room.fixtures.push({ kind: 'pendant', a, d, y: room.height - 0.9 });
      for (const [da, dd, fa, fd] of [[-0.75, 0, 1, 0], [0.75, 0, -1, 0]]) {
        block(room, 'chair', a + da, d + dd, 0.48, 0.48, { style: 'dining', yaw: Math.atan2(fa, fd), walkable: true });
        if (seatIndex % 3 !== 2) person(room, 'guest', 'seated', a + da, d + dd, [fa, fd], { seat: 0.46, seed: room.index * 11 + seatIndex });
        seatIndex++;
      }
    }
    person(room, 'staff', 'carry', W * 0.05, D * 0.55, [0, -1]);
    if (W > 5.5) {
      // The bar has no rear service aisle. Staff work at its open end.
      person(room, 'staff', 'attend', half - 0.74, Math.min(D - 1.2, 7.5) + 0.42, [0, -1]);
      person(room, 'guest', 'seated', half - 1.35, 3.5, [1, 0], { seat: 0.74, seed: room.index * 13 });
    }
  },
  gelato(room, { W, D, half, back }) {
    const caseDepth = Math.min(3.4, D * 0.45);
    block(room, 'gelato', 0, caseDepth, Math.min(W - 2.2, 5.2), 0.95);
    room.fixtures.push({ kind: 'lightbox', wall: 'back', a: 0, d: D - 0.2, w: Math.min(4.2, W - 1.4), h: 1.0, y: 2.3, style: 'menu' });
    wall(room, 'shelves', 1, caseDepth + 1.2, D - 0.8, { contents: 'cones' });
    for (let i = 0; i < 2; i++) {
      const a = -half + 1.1 + i * 1.5, d = caseDepth + 2.6;
      if (d > D - 0.8) continue;
      block(room, 'dining', a, d, 0.65, 0.65, { style: 'cafe' });
      block(room, 'chair', a, d - 0.6, 0.42, 0.42, { style: 'cafe', yaw: Math.PI, walkable: true });
      block(room, 'chair', a, d + 0.6, 0.42, 0.42, { style: 'cafe', yaw: 0, walkable: true });
    }
    person(room, 'staff', 'attend', -0.9, caseDepth + 0.8, [0, -1]);
    person(room, 'staff', 'attend', 0.9, caseDepth + 0.8, [0, -1]);
    guests(room, 3, [[-0.3, caseDepth - 0.95, [0, 1], 'stand'], [0.9, caseDepth - 1.9, [0, 1], 'stand'], [1.6, caseDepth - 0.95, [0, 1], 'browse']]);
  },
  cinema(room, { W, D, half, back }) {
    for (const side of [-1, 1]) for (let d = 1.6; d < D - 2.6; d += 2.2) room.fixtures.push({ kind: 'lightbox', side, a: side * (half - 0.2), d, w: 1.1, h: 1.6, y: 1.9, style: 'poster' });
    block(room, 'concession', 0, back, Math.min(W - 2, 5), 0.8);
    block(room, 'popcorn', Math.min(W - 2, 5) / 2 - 0.5, back - 0.05, 0.6, 0.6, { walkable: true });
    room.fixtures.push({ kind: 'lightbox', wall: 'back', a: 0, d: D - 0.2, w: Math.min(4.6, W - 1.4), h: 0.9, y: 2.6, style: 'menu' });
    for (const side of [-1, 1]) block(room, 'rope', side * 0.9, D * 0.5, 0.1, D * 0.4, { walkable: true });
    person(room, 'staff', 'attend', -0.8, back + 0.7, [0, -1]);
    person(room, 'staff', 'attend', 0.9, back + 0.7, [0, -1]);
    guests(room, 3, [[0, back - 1.0, [0, 1], 'stand'], [0.2, back - 2.1, [0, 1], 'stand'], [-half + 1.3, 2.7, [-1, 0], 'browse']]);
  },
  gallery(room, { W, D, half, back }) {
    let seed = room.index;
    for (const side of [-1, 1]) for (let d = 1.8; d < D - 1.2; d += 2.3) room.fixtures.push({ kind: 'artwork', side, a: side * (half - 0.2), d, w: 1.2 + (seed++ % 3) * 0.3, h: 1.0 + (seed % 2) * 0.5, y: 1.55, seed });
    room.fixtures.push({ kind: 'artwork', wall: 'back', a: 0, d: D - 0.2, w: 2.4, h: 1.6, y: 1.7, seed: seed + 3 });
    block(room, 'plinth', -W * 0.2, D * 0.4, 0.5, 0.5, { style: 'sculpture', seed: 1 });
    block(room, 'plinth', W * 0.2, D * 0.65, 0.5, 0.5, { style: 'sculpture', seed: 2 });
    block(room, 'desk', W * 0.3, back, 1.5, 0.7, { style: 'gallery' });
    block(room, 'bench', 0, D * 0.52, 1.2, 0.45, { style: 'gallery' });
    person(room, 'staff', 'attend', W * 0.3, back + 0.7, [0, -1]);
    guests(room, 2, [[-half + 1.1, 1.8, [-1, 0], 'browse'], [half - 1.1, 4.1, [1, 0], 'browse']]);
  },
  optician(room, { W, D, half, back }) {
    for (const side of [-1, 1]) wall(room, 'eyewear', side, 1.3, D - 2.0);
    block(room, 'desk', 0, D * 0.5, 1.5, 0.75, { style: 'fitting' });
    block(room, 'chair', -0.5, D * 0.5 - 0.85, 0.5, 0.5, { style: 'armchair', yaw: 0, walkable: true });
    block(room, 'chair', 0.5, D * 0.5 - 0.85, 0.5, 0.5, { style: 'armchair', yaw: 0, walkable: true });
    block(room, 'counter', 0, back, 2.2, 0.65, { style: 'cashwrap' });
    room.fixtures.push({ kind: 'feature', quadrant: 1, a: 0, d: D - 0.22, w: Math.min(4.2, W - 1.2), h: 2.4 });
    person(room, 'staff', 'attend', 0, back + 0.7, [0, -1]);
    person(room, 'staff', 'attend', 0.6, D * 0.5 + 0.75, [0, -1]);
    person(room, 'guest', 'seated', -0.5, D * 0.5 - 0.85, [0, 1], { seat: 0.46, seed: room.index * 3 });
    guests(room, 1, [[half - 0.95, D * 0.35, [1, 0], 'browse']]);
  },
};

// Walking support: rooms are free zones inside otherwise solid footprints.
export function roomAt(rooms, east, north, shrink = 0) {
  for (const room of rooms) {
    const bounds = room.lookupBounds;
    if (shrink >= 0 && bounds && (east < bounds[0] || north < bounds[1] || east > bounds[2] || north > bounds[3])) continue;
    const [a, d] = room.toLocal(east, north);
    if (a <= room.aMin + shrink || a >= room.aMax - shrink || d >= room.depth - shrink) continue;
    if (d > shrink + 0.02) return room;
    if (d > -1.4 && Math.abs(a) < DOOR_HALF_WIDTH - shrink) return room;
  }
  return null;
}

export function roomBlocked(room, east, north, radius) {
  const [a, d] = room.toLocal(east, north);
  return room.obstacles.some(o => a > o.a0 - radius && a < o.a1 + radius && d > o.d0 - radius && d < o.d1 + radius);
}

// For the facade renderer: which part of a bay (world points a -> b, pushed
// inside the wall) is not covered by a room. Returns [t0, t1] fractions.
export function uncoveredBay(rooms, a, b) {
  const at = t => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const covered = t => Boolean(roomAt(rooms, ...at(t), 0));
  const start = covered(0), end = covered(1);
  if (start && end) return null;
  if (!start && !end) return covered(0.5) ? null : [0, 1];
  let lo = 0, hi = 1;
  for (let i = 0; i < 14; i++) { const mid = (lo + hi) / 2; if (covered(mid) === start) lo = mid; else hi = mid; }
  // Slivers narrower than ~5% of a bay would become degenerate geometry (zero
  // scale, NaN normals); treat them as fully covered instead.
  const open = start ? [hi, 1] : [0, lo];
  return open[1] - open[0] < 0.05 ? null : open;
}

// The room (if any) that covers a bay between world points a and b.
export function coveringRoom(rooms, a, b) {
  for (const t of [0.5, 0.15, 0.85]) {
    const room = roomAt(rooms, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 0);
    if (room) return room;
  }
  return null;
}
