// The Dior-Toulouse plaza furnished as an open-air salon under its grove of
// ten trees: a curved timber bench with dusty-pink cushions around a travertine
// coffee table, a round timber table and two travertine chess tables with café
// armchairs, travertine planters along the footway, smoked-bronze lantern posts,
// a small music stage near Toulouse, and string lights strung through the
// grove. Art direction follows Val's reference set (2026-10-12); everything is
// authored geometry, no image pixels.
//
// World data only, no THREE: the browser draws from this plan, and the walking
// model (browser, townspeople and the authoritative town) blocks the same
// footprints, so every process must import it rather than copy it. Furniture
// positions are fixed and independent of the tree data, so a town loaded with
// or without the vegetation dataset blocks and seats identically; only the
// string lights follow whichever trees the world has in the plaza. Positions are
// [east, north] metres; a heading follows the avatar convention
// atan2(dx, -dnorth), which is also the Three.js yaw of a model facing local +Z.
import { treeSupports } from './tree-placements.js';

const DIOR = 'osm-node-8172494958';
// The open paving between the Dior and Etro blocks.
const PLAZA = { west: -2809, east: -2776, south: -1305, north: -1291 };
const LIGHT_HEIGHT = 3.35, POST_HEIGHT = 3.1, MAX_STRAND = 9;

const heading = ([x, north], [tx, tn]) => Math.atan2(tx - x, -(tn - north));
const along = ([x, north], angle, distance) => [x + Math.sin(angle) * distance, north - Math.cos(angle) * distance];

// Chairs pulled up to a table: `angles` are the headings from the table to each chair.
function chairsAround(id, centre, distance, angles) {
  return angles.map((angle, index) => {
    const [x, north] = along(centre, angle, distance);
    return { id: `${id}-${index}`, x, north, heading: heading([x, north], centre) };
  });
}

// String lights: a minimum spanning web over the grove's trunks and the lantern
// posts (deterministic Prim's algorithm), so every anchor is lit and no strand
// crosses the plaza further than MAX_STRAND metres.
function lightWeb(anchors) {
  if (anchors.length < 2) return [];
  const joined = new Set([0]), strands = [];
  while (joined.size < anchors.length) {
    let best = null;
    for (const i of joined) anchors.forEach((to, j) => {
      if (joined.has(j)) return;
      const length = Math.hypot(to.x - anchors[i].x, to.north - anchors[i].north);
      if (length <= MAX_STRAND && (!best || length < best.length - 1e-9)) best = { i, j, length };
    });
    if (!best) break;
    joined.add(best.j); strands.push({ from: anchors[best.i], to: anchors[best.j] });
  }
  return strands;
}

export function plazaSalonPlan(world) {
  if (world?.scene !== 'district' || !world.stores?.some(store => store.id === DIOR)) return null;
  const round = { id: 'round', x: -2797.0, north: -1299.2, radius: 0.8 };
  const chess = [{ id: 'chess-west', x: -2793.0, north: -1301.4 }, { id: 'chess-east', x: -2786.4, north: -1300.4 }];
  // A walnut backgammon table in the open square between the grove's middle trunks.
  const backgammon = { id: 'backgammon', x: -2789.6, north: -1297.4 };
  // The bench backs onto the Etro block and opens north, to the grove and Dior.
  const bench = { id: 'bench', x: -2781.4, north: -1302.0, seatRadius: 1.42, backRadius: 2.02, opening: Math.PI, span: Math.PI * 1.18 };
  const chairs = [
    ...chairsAround('round', [round.x, round.north], 1.22, [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]),
    ...chess.flatMap(table => chairsAround(table.id, [table.x, table.north], 0.86, [Math.PI / 2, -Math.PI / 2])),
    ...chairsAround(backgammon.id, [backgammon.x, backgammon.north], 0.86, [Math.PI / 2, -Math.PI / 2]),
  ];
  // Long planters edge the footway between the grove's northern trunks; the
  // Dior entrance (east ≈ -2784.7) stays open.
  const planters = [-2802.9, -2793.0].map((x, index) => ({ id: `planter:${index}`, x, north: -1292.85, heading: 0 }));
  const stage = { id: 'stage', x: -2806.0, north: -1300.6, radius: 1.3 };
  stage.heading = heading([stage.x, stage.north], [round.x, round.north]);
  // The bike rack: a bronze bar along the north footway, east of the Dior
  // entrance (east ≈ -2784.7 stays open), with four bikes parked on its south
  // side so riders roll out onto the plaza paving.
  // `setback` is the bike centre south of the bar (the walking model pads the
  // bar's discs, so a frame-length of clearance keeps a parked bike rideable);
  // `approach` is the walk-up south of the bike.
  const rack = { id: 'plaza-salon-rack', x: -2781.0, north: -1294.0, heading: 0, slots: 4, pitch: 0.9, length: 3.2, setback: 1.1, approach: 0.9 };
  const lanterns = [[-2805.9, -1294.2], [-2778.7, -1295.8], [-2797.4, -1303.0], [-2786.6, -1303.4]]
    .map(([x, north], index) => ({ id: `lantern:${index}`, x, north, heading: heading([x, north], [-2792.5, -1298.5]), height: POST_HEIGHT }));
  const trees = treeSupports(world).filter(({ position: [x, north] }) => x > PLAZA.west && x < PLAZA.east && north > PLAZA.south && north < PLAZA.north)
    .map(({ position: [x, north] }) => ({ x, north, height: LIGHT_HEIGHT })).sort((a, b) => a.x - b.x || a.north - b.north);
  const strands = lightWeb([...trees, ...lanterns.map(({ x, north, height }) => ({ x, north, height }))]);
  return { round, chess, backgammon, bench, chairs, planters, lanterns, stage, rack, trees, strands, postHeight: POST_HEIGHT };
}

// Footprints the walking model blocks: [east, north, radius, height]. Chairs and
// the bench's seat strip stay open, as storefront benches are, because sitting
// and standing up must land on a free position (server/world.js sit()).
export function plazaSalonFootprints(world) {
  const plan = plazaSalonPlan(world);
  if (!plan) return [];
  const footprints = [
    [plan.round.x, plan.round.north, plan.round.radius, 0.76],
    ...plan.chess.map(table => [table.x, table.north, 0.42, 0.76]),
    [plan.backgammon.x, plan.backgammon.north, 0.46, 0.76],
    [plan.bench.x, plan.bench.north, 0.44, 0.42],
    ...plan.lanterns.map(post => [post.x, post.north, 0.16, plan.postHeight]),
    [plan.stage.x, plan.stage.north, plan.stage.radius, 0.24],
  ];
  // Planters and the bench back are long: a row of overlapping discs.
  for (const planter of plan.planters) for (const offset of [-0.62, 0, 0.62])
    footprints.push([planter.x + Math.cos(planter.heading) * offset, planter.north + Math.sin(planter.heading) * offset, 0.3, 0.6]);
  const { bench } = plan, back = bench.opening + Math.PI;
  for (let step = 0; step <= 10; step++) {
    const angle = back - bench.span / 2 + bench.span * step / 10;
    const [x, north] = along([bench.x, bench.north], angle, bench.backRadius);
    footprints.push([x, north, 0.17, 0.9]);
  }
  // The rack bar: discs every 0.4 m or less along its length (0.4 < 2 × 0.22, so they
  // overlap whatever the length); bikes and riders stand south of it.
  const steps = Math.ceil(plan.rack.length / 0.4);
  for (let step = 0; step <= steps; step++) {
    const offset = -plan.rack.length / 2 + plan.rack.length * step / steps;
    footprints.push([plan.rack.x + Math.cos(plan.rack.heading) * offset, plan.rack.north + Math.sin(plan.rack.heading) * offset, 0.22, 0.8]);
  }
  return footprints;
}

// Seats in the shared seating model: a bench place is 'bench:<id>' with one slot
// per place. The bench seats three facing its coffee table; each chair seats one.
export function plazaSalonSeats(world) {
  const plan = plazaSalonPlan(world);
  if (!plan) return [];
  const seats = [], { bench } = plan, back = bench.opening + Math.PI;
  [-0.42, 0, 0.42].forEach((share, slot) => {
    const angle = back + bench.span * share * 0.82;
    const [x, north] = along([bench.x, bench.north], angle, bench.seatRadius);
    const facing = heading([x, north], [bench.x, bench.north]);
    seats.push({ buildId: 'bench:plaza-salon-bench', slot, kind: 'bench', title: 'Curved bench', x, north, heading: facing, height: 0.53,
      approach: along([x, north], facing, 0.62) });
  });
  for (const chair of plan.chairs) seats.push({ buildId: `bench:plaza-salon-${chair.id}`, slot: 0, kind: 'bench',
    title: chair.id.startsWith('chess') ? 'Chess table' : chair.id.startsWith('backgammon') ? 'Backgammon table' : 'Café armchair', x: chair.x, north: chair.north, heading: chair.heading, height: 0.48,
    // Chairs face their table, so people step in from behind.
    approach: along([chair.x, chair.north], chair.heading, -0.82) });
  // Residents resting at Dior may take a plaza seat (resident-life groups seats by store).
  return seats.map(seat => ({ ...seat, storeId: DIOR, id: `${seat.buildId}:${seat.slot}` }));
}

// Bike slots on the rack, in the seat conventions: a slot is `${rackId}:${n}`,
// its position is where the bike stands (open paving), `approach` is where a
// rider walks up to it, and `heading` is the way the bike points. The server
// mounts a rider here; the browser draws a parked bike while the slot is free.
export function plazaSalonRack(world) {
  const plan = plazaSalonPlan(world);
  if (!plan) return [];
  const { rack } = plan, slots = [];
  for (let slot = 0; slot < rack.slots; slot++) {
    const across = -(rack.slots - 1) / 2 * rack.pitch + slot * rack.pitch;
    const [x, north] = [rack.x + Math.cos(rack.heading) * across, rack.north + Math.sin(rack.heading) * across];
    const [bx, bn] = along([x, north], rack.heading, rack.setback);
    slots.push({ id: `${rack.id}:${slot}`, rackId: rack.id, slot, x: bx, north: bn, heading: rack.heading, approach: along([bx, bn], rack.heading, rack.approach) });
  }
  return slots;
}

// Chess tables. Each inlay is 116 of its 128 texels across a 0.6 m slab: eight
// cells of 6.8 cm. A cell is (i, j): row j = 0 is the edge nearest chair 0 (east)
// and column i = 0 is on that player's left. Dark cells have (i + j) even, which
// puts a light square at each player's right hand, as on a real board, whichever
// chair white takes. Squares follow chess-rules.js: a1 = 0, h8 = 63.
export const CHESS_CELL_M = 0.6 * 116 / 128 / 8;
export const chessCellIsDark = (i, j) => ((i + j) & 1) === 0;
export function chessCell(square, whiteChair = 0) {
  const file = square & 7, rank = square >> 3;
  return whiteChair === 0 ? { i: file, j: rank } : { i: 7 - file, j: 7 - rank };
}
// A cell's centre in the board's own frame, [x, z] before the table's quarter turn.
export const chessCellOffset = ({ i, j }) => [(i - 3.5) * CHESS_CELL_M, (3.5 - j) * CHESS_CELL_M];
// The chess table and chair behind a plaza seat ('bench:plaza-salon-chess-west-1'), or null.
export function chessSeat(buildId) {
  const match = /^bench:plaza-salon-(chess-(?:west|east))-([01])$/.exec(buildId ?? '');
  return match ? { tableId: match[1], chair: Number(match[2]) } : null;
}
// A cell's centre as [east, north]. The slab turns a quarter (Three.js yaw π/2),
// so its local x runs north and its local z runs east.
export function chessCellPosition(table, cell) {
  const [x, z] = chessCellOffset(cell);
  return [table.x + z, table.north + x];
}

// The café table and dominoes. Its four armchairs sit at headings π/4 + n·π/2
// from the table (see chairsAround), so chair n of `bench:plaza-salon-round-<n>`.
export const CAFE_LINE_RADIUS = 0.4, DOMINO = { length: 0.05, width: 0.025, gap: 0.002 };
export const cafeChairAngle = chair => Math.PI / 4 + chair * Math.PI / 2;
export function cafeSeat(buildId) {
  const match = /^bench:plaza-salon-round-([0-3])$/.exec(buildId ?? '');
  return match ? { tableId: 'round', chair: Number(match[1]) } : null;
}
// The line of play as an arc around the centrepiece: the lead tile faces chair
// `facing`, tiles played on the right run anticlockwise and on the left clockwise.
// Doubles lie across the line. Returns each tile's centre angle and [east, north].
export function dominoLine(table, line, leadIndex, facing = 0) {
  const span = tile => (tile.left === tile.right ? DOMINO.width : DOMINO.length) / CAFE_LINE_RADIUS;
  const gap = DOMINO.gap / CAFE_LINE_RADIUS, angles = Array(line.length), start = cafeChairAngle(facing);
  if (!line.length) return [];
  angles[leadIndex] = start;
  for (let i = leadIndex + 1; i < line.length; i++) angles[i] = angles[i - 1] + span(line[i - 1]) / 2 + gap + span(line[i]) / 2;
  for (let i = leadIndex - 1; i >= 0; i--) angles[i] = angles[i + 1] - span(line[i + 1]) / 2 - gap - span(line[i]) / 2;
  return line.map((tile, i) => ({ ...tile, angle: angles[i], double: tile.left === tile.right, span: span(tile),
    position: [table.x + Math.sin(angles[i]) * CAFE_LINE_RADIUS, table.north - Math.cos(angles[i]) * CAFE_LINE_RADIUS] }));
}

// The backgammon table's two chairs: chair 0 east of the table, chair 1 west.
export function backgammonSeat(buildId) {
  const match = /^bench:plaza-salon-backgammon-([01])$/.exec(buildId ?? '');
  return match ? { tableId: 'backgammon', chair: Number(match[1]) } : null;
}

// The backgammon board: 0.62 m across (two halves of six points and a 4 cm bar)
// and 0.48 m deep. Point p is numbered from white's side: 1–12 along white's near
// edge (white's home, 1–6, on its right), 13–24 along the far edge. Checkers stack
// from the edge towards the middle, five to a layer. A spot is in the board's own
// frame [x across, z towards white] before the table's quarter turn, then [east, north].
export const BACKGAMMON = { width: 0.62, depth: 0.48, column: 0.045, bar: 0.04, radius: 0.019 };
export function backgammonSpot(table, place, slot, whiteChair = 0) {
  const { width, depth, column, bar, radius } = BACKGAMMON, layer = Math.floor(slot / 5), along = slot % 5;
  let x, z;
  if (place === 'bar-white' || place === 'bar-black') { x = 0; z = (place === 'bar-white' ? 1 : -1) * (0.05 + slot * 2 * radius); }
  else if (place === 'off-white' || place === 'off-black') { x = width / 2 + 0.05; z = (place === 'off-white' ? 1 : -1) * 0.12; }
  else {
    const near = place <= 12, col = near ? 12 - place : place - 13;
    x = (col - 5.5) * column + (col >= 6 ? bar / 2 : -bar / 2);
    z = (near ? 1 : -1) * (depth / 2 - 0.02 - radius - along * 2 * radius);
  }
  if (whiteChair === 1) { x = -x; z = -z; }
  const pile = place === 'off-white' || place === 'off-black';
  return { position: [table.x + z, table.north + x], layer: pile ? slot : (place === 'bar-white' || place === 'bar-black') ? 0 : layer };
}
