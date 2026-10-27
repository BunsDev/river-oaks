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
  if(world.eastGardenCommons){
    const {rect,tableId}=world.eastGardenCommons.activity;
    chess.push({id:tableId,x:(rect[0]+rect[2])/2,north:(rect[1]+rect[3])/2});
    // The Bayou Heights icehouse patio table (shared/bayou-heights.js).
    const icehouse=world.eastGardenCommons.heights?.icehouse;
    if(icehouse)chess.push({id:icehouse.tableId,x:icehouse.at[0],north:icehouse.at[1]});
  }
  // A walnut backgammon table in the open square between the grove's middle trunks.
  const backgammon = { id: 'backgammon', x: -2789.6, north: -1297.4 };
  // A long linen-topped table for wine pong, east–west between the café and the north
  // planters, played standing at either end.
  const winePong = { id: 'wine-pong', x: -2797.2, north: -1296.0, heading: 0 };
  // A small round grove table in the middle of the grove for mancala, with two chairs
  // east and west (chair 0 east).
  const grove = { id: 'grove', x: -2792.4, north: -1299.2 };
  // A dartboard on a post backed against the south (Etro) wall, facing north up a clear
  // lane to the throwing line 2.37 m away.
  const darts = { id: 'darts', x: -2791.0, north: -1303.5, heading: 0 };
  // The bench backs onto the Etro block and opens north, to the grove and Dior.
  const bench = { id: 'bench', x: -2781.4, north: -1302.0, seatRadius: 1.42, backRadius: 2.02, opening: Math.PI, span: Math.PI * 1.18 };
  const chairs = [
    ...chairsAround('round', [round.x, round.north], 1.22, [Math.PI / 4, Math.PI * 3 / 4, Math.PI * 5 / 4, Math.PI * 7 / 4]),
    ...chess.flatMap(table => chairsAround(table.id, [table.x, table.north], 0.86, [Math.PI / 2, -Math.PI / 2])),
    ...chairsAround(backgammon.id, [backgammon.x, backgammon.north], 0.86, [Math.PI / 2, -Math.PI / 2]),
    ...chairsAround(grove.id, [grove.x, grove.north], 0.82, [Math.PI / 2, -Math.PI / 2]),
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
  return { round, chess, backgammon, winePong, grove, darts, bench, chairs, planters, lanterns, stage, rack, trees, strands, postHeight: POST_HEIGHT };
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
    [plan.grove.x, plan.grove.north, 0.4, 0.74],
    [plan.darts.x, plan.darts.north, 0.22, 2.05],
    // The wine pong table is long: a row of overlapping discs (0.6 m apart, 0.36 m round).
    ...[-0.9, -0.3, 0.3, 0.9].map(u => [...winePongPoint(plan.winePong, [u, 0]), 0.36, 0.76]),
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
    title: chair.id.startsWith('chess-commons') ? 'Commons game table' : chair.id.startsWith('chess-icehouse') ? 'Icehouse game table' : chair.id.startsWith('chess') ? 'Chess table' : chair.id.startsWith('backgammon') ? 'Backgammon table' : chair.id.startsWith('grove') ? 'Grove table' : 'Café armchair', x: chair.x, north: chair.north, heading: chair.heading, height: 0.48,
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
  const match = /^bench:plaza-salon-(chess-(?:west|east|commons|icehouse))-([01])$/.exec(buildId ?? '');
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

// Jenga on the curved bench's travertine drum (0.42 m round, its top 0.4 m up), set
// clear of the lanterns and the bowl, toward the bench. Blocks are 12 × 4 × 2.4 cm.
// Level n's blocks run east–west when n is even and north–south when it is odd, so
// each level crosses the one below; slot 1 is the middle. A spot is [east, north],
// with the block's centre height above the paving and its yaw.
export const JENGA = { length: 0.12, width: 0.04, height: 0.024, gap: 0.0012, drumTop: 0.4, drumRadius: 0.42, offset: [0.1, -0.18] };
export function jengaBlock(bench, level, slot) {
  const { width, height, gap, drumTop, offset } = JENGA, across = (slot - 1) * (width + gap), even = level % 2 === 0;
  return { position: [bench.x + offset[0] + (even ? 0 : across), bench.north + offset[1] + (even ? across : 0)], height: drumTop + height * (level + 0.5), yaw: even ? 0 : Math.PI / 2 };
}

// The curved bench's three places: Jenga is played from any of them.
export function jengaSeat(sitting) {
  return sitting?.buildId === 'bench:plaza-salon-bench' && [0, 1, 2].includes(sitting.slot) ? { tableId: 'jenga', seat: sitting.slot } : null;
}

// Wine pong's table frame to [east, north]: u along the table (its west end -1.2), v across.
export function winePongPoint(table, [u, v]) {
  const c = Math.cos(table.heading), s = Math.sin(table.heading);
  return [table.x + u * c - v * s, table.north + u * s + v * c];
}
// Where each side stands to throw: just beyond its own end of the table.
export const WINE_PONG_STAND = 1.7, WINE_PONG_REACH = 0.9;
export const winePongStand = (table, side) => winePongPoint(table, [side === 0 ? -WINE_PONG_STAND : WINE_PONG_STAND, 0]);
// The side a standing visitor at [east, north] would play, or null when not at an end.
export function winePongSide(table, [east, north]) {
  for (const side of [0, 1]) { const [x, n] = winePongStand(table, side); if (Math.hypot(east - x, north - n) <= WINE_PONG_REACH) return side; }
  return null;
}
// Near enough to the table to keep a game open while repositioning: within this far of
// either end's throwing reach. Further away, the visitor has left the table.
export const WINE_PONG_LEAVE = 2.5;
export function winePongNear(table, [east, north]) {
  return [0, 1].some(side => { const [x, n] = winePongStand(table, side); return Math.hypot(east - x, north - n) <= WINE_PONG_REACH + WINE_PONG_LEAVE; });
}
// Preserve the actual standing point for the ball release. A launch must remain
// beyond the table end; the round interaction reach alone also includes its top.
export function winePongOrigin(table, side, point) {
  if (!table || ![0, 1].includes(side) || !point || winePongSide(table, point) !== side) return null;
  const east = point[0] - table.x, north = point[1] - table.north;
  const c = Math.cos(table.heading), s = Math.sin(table.heading);
  const u = east * c + north * s, v = -east * s + north * c;
  return Number.isFinite(u) && Number.isFinite(v) && (side === 0 ? -u : u) >= 1.35 ? [u, Math.abs(v) < 1e-9 ? 0 : v] : null;
}

// The grove table's two chairs: chair 0 east of the table, chair 1 west.
export function groveSeat(buildId) {
  const match = /^bench:plaza-salon-grove-([01])$/.exec(buildId ?? '');
  return match ? { tableId: 'grove', chair: Number(match[1]) } : null;
}
// The mancala board on the grove table: 0.56 m long and 0.2 m deep, running north–south
// across the table between the chairs. Pit p (0–13, as in mancala-rules.js) is a spot
// [east, north] for the player in chair `chair` (side 0 sits in chair 0 unless swapped).
export const MANCALA = { length: 0.56, depth: 0.2, pit: 0.072, top: 0.758 };
export function mancalaSpot(table, index, sideZeroChair = 0) {
  const { pit } = MANCALA;
  // Along the board: side 0's pits run from its left to its right, then its store at the right end.
  let along, across;
  if (index === 6) { along = 3.5 * pit; across = 0; }
  else if (index === 13) { along = -3.5 * pit; across = 0; }
  else if (index < 6) { along = (index - 2.5) * pit; across = 1; }
  else { along = (2.5 - (index - 7)) * pit; across = -1; }
  // Side 0 sits east (chair 0) facing west: its left is south, so along runs north; its row is the near (east) one.
  const flip = sideZeroChair === 0 ? 1 : -1, offset = 0.045 * across;
  return [table.x + flip * offset, table.north + flip * along];
}

// The goban on the grove table (when Go is the table's game): nine lines each way,
// 4.2 cm apart, its top 3 cm above the table. Point index (row * 9 + column, rows from
// black's side, column a on black's left) is a spot [east, north] for black in `blackChair`.
export const GO = { spacing: 0.042, board: 0.44, thick: 0.03 };
export function goSpot(table, index, blackChair = 0) {
  const row = Math.floor(index / 9), column = index % 9, flip = blackChair === 0 ? 1 : -1;
  // Black in chair 0 sits east facing west: row 1 nearest (east), column a on its left (south).
  return [table.x + flip * (4 - row) * GO.spacing, table.north + flip * (column - 4) * GO.spacing];
}
// The xiangqi board on the grove table (when it is the table's game): nine files by ten
// ranks of points 3.8 cm apart, on a board 2 cm thick. Point index (rank * 9 + file, rank 0
// on red's side, file a on red's left) is a spot [east, north] for red in `redChair`.
export const XIANGQI = { spacing: 0.038, width: 0.37, depth: 0.41, thick: 0.02, piece: 0.0165 };
export function xiangqiSpot(table, index, redChair = 0) {
  const rank = Math.floor(index / 9), file = index % 9, flip = redChair === 0 ? 1 : -1;
  // Red in chair 0 sits east facing west: rank 0 nearest (east), file a on its left (south).
  return [table.x + flip * (4.5 - rank) * XIANGQI.spacing, table.north + flip * (file - 4) * XIANGQI.spacing];
}
// Darts: the board's centre 1.73 m up on the post, facing along the board's heading
// (north), and the throwing line 2.37 m out in front. Standing within 0.8 m of the line
// plays. A dart's landing [x, y] in millimetres on the board maps to [east, north, height].
export const DARTS = { bull: 1.73, line: 2.37, reach: 0.8, radius: 0.2255 };
export const dartsStand = board => [board.x + Math.sin(board.heading) * DARTS.line, board.north + Math.cos(board.heading) * DARTS.line];
export function atDartsLine(board, [east, north]) {
  const [x, n] = dartsStand(board);
  return Math.hypot(east - x, north - n) <= DARTS.reach;
}
export function dartSpot(board, [x, y]) {
  // The thrower stands in front of the board looking at it: for a board facing north they
  // face south, so their right (+x on the board) is west.
  const right = [-Math.cos(board.heading), Math.sin(board.heading)], face = 0.035;
  return [board.x + right[0] * x / 1000 + Math.sin(board.heading) * face, board.north + right[1] * x / 1000 + Math.cos(board.heading) * face, DARTS.bull + y / 1000];
}
// The Chinese checkers star on the grove table (when it is the table's game): holes
// 3 cm apart on a round board 47 cm across, 2 cm thick. A hole [q, r] (axial, r growing
// toward the first player) is a spot [east, north] for the first player in `firstChair`:
// sitting east and facing west in chair 0, so r runs toward the east and q's rows run
// from their left (south) to their right.
export const STAR = { spacing: 0.03, board: 0.235, thick: 0.02 };
export function starSpot(table, [q, r], firstChair = 0) {
  const flip = firstChair === 0 ? 1 : -1, across = q + r / 2, toward = r * Math.sqrt(3) / 2;
  return [table.x + flip * toward * STAR.spacing, table.north + flip * across * STAR.spacing];
}
