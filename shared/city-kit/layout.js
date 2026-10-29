// Blocks derived from streets (#585 follow-through). A recipe's `layout` names
// quarters (style, depth/storey/bay ranges, a shop-name pool and a frontage policy)
// and reservations. The land that streets, plazas, reservations and authored
// blocks leave inside the site becomes blocks that face the streets bounding
// them: a cell with streets on opposite sides splits into two back-to-back
// blocks, a corner cell also faces its crossing street. Streets, plazas,
// landmarks, furniture, authored blocks, overrides and additions never move.
// The derivation is pure arithmetic on the recipe: no clock, no random stream,
// so the same recipe yields the same blocks in Node and in the browser.
import { KIT_CONVENTIONS, KIT_STYLES } from './catalog.js';

const MODULE = KIT_CONVENTIONS.module, EPS = 1e-6;
const mm = value => Math.round(value * 1000) / 1000;
const snap = value => Math.round(value / MODULE) * MODULE;
const rectOk = r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] < r[2] && r[1] < r[3];
const rangeOk = r => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[0] <= r[1];
const idOk = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(id);
const fail = message => { throw new Error(`Invalid neighborhood layout: ${message}`); };
const SIDES = ['north', 'south', 'east', 'west'];
const OPPOSITE = { north: 'south', south: 'north', east: 'west', west: 'east' };
const ACROSS = { north: ['east', 'west'], south: ['east', 'west'], east: ['north', 'south'], west: ['north', 'south'] };
const clip = (r, site) => [Math.max(r[0], site[0]), Math.max(r[1], site[1]), Math.min(r[2], site[2]), Math.min(r[3], site[3])];
const area = r => (r[2] - r[0]) * (r[3] - r[1]);
const contains = (r, x, y) => x > r[0] - EPS && x < r[2] + EPS && y > r[1] - EPS && y < r[3] + EPS;
const overlapLength = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));

// A street's corridor: lane plus both sidewalks, clipped to the site.
export function streetCorridor(street, site) {
  const outer = street.lane / 2 + street.sidewalk;
  const rect = street.from[1] === street.to[1]
    ? [street.from[0], street.from[1] - outer, street.to[0], street.to[1] + outer]
    : [street.from[0] - outer, street.from[1], street.to[0] + outer, street.to[1]];
  return clip(rect.map(mm), site);
}

export function validateLayout(recipe) {
  const layout = recipe.layout;
  if (layout === undefined || layout === null) return null;
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) fail('layout must be an object');
  for (const key of Object.keys(layout)) if (!['quarters', 'reserved'].includes(key)) fail(`unknown layout key ${key}`);
  const streets = new Set((recipe.streets ?? []).map(street => street.id)), ids = new Set();
  const quarters = layout.quarters ?? [];
  if (!Array.isArray(quarters) || !quarters.length) fail('layout needs at least one quarter');
  for (const quarter of quarters) {
    if (!quarter || typeof quarter !== 'object') fail('quarter');
    if (!idOk(quarter.id) || ids.has(quarter.id)) fail(`quarter id ${quarter.id}`);
    ids.add(quarter.id);
    for (const key of Object.keys(quarter)) if (!['id', 'rect', 'style', 'front', 'sides', 'depth', 'storeys', 'bays', 'names', 'court', 'split'].includes(key)) fail(`quarter ${quarter.id}: unknown key ${key}`);
    if (quarter.rect !== undefined && !rectOk(quarter.rect)) fail(`quarter ${quarter.id} rect`);
    if (!KIT_STYLES[quarter.style]) fail(`quarter ${quarter.id} style`);
    if (!rangeOk(quarter.depth) || !rangeOk(quarter.storeys) || !rangeOk(quarter.bays) || quarter.bays[0] < KIT_CONVENTIONS.bay.min || quarter.bays[1] > KIT_CONVENTIONS.bay.max) fail(`quarter ${quarter.id} ranges`);
    if (!(quarter.depth[0] > 0)) fail(`quarter ${quarter.id} depth`);
    if (!Array.isArray(quarter.names) || !quarter.names.length || !quarter.names.every(name => typeof name === 'string' && name.length <= 32)) fail(`quarter ${quarter.id} names`);
    const front = quarter.front ?? 'auto';
    if (front !== 'auto' && !SIDES.includes(front) && !streets.has(front)) fail(`quarter ${quarter.id} front must be auto, a side or a street id`);
    const sides = quarter.sides ?? 'auto';
    if (sides !== 'auto' && !(Array.isArray(sides) && sides.every(side => SIDES.includes(side)))) fail(`quarter ${quarter.id} sides`);
    if (quarter.split !== undefined && quarter.split !== 'auto' && quarter.split !== 'none') fail(`quarter ${quarter.id} split must be auto or none`);
    if (quarter.court && !(quarter.court.width > 0 && quarter.court.depth > 0 && quarter.court.at > 0 && quarter.court.at < 1)) fail(`quarter ${quarter.id} court`);
  }
  for (const item of layout.reserved ?? []) {
    if (!item || !idOk(item.id) || ids.has(item.id)) fail(`reserved id ${item?.id}`);
    ids.add(item.id);
    if (!rectOk(item.rect)) fail(`reserved ${item.id} rect`);
  }
  return layout;
}

// Maximal free rectangles of one quarter's fine cells, split along horizontal or
// vertical grid lines, whichever leaves fewer blocks with part of their frontage
// off the street (then fewer rectangles, then horizontal).
function decompose(fine, xs, ys, label, corridors) {
  const strips = (rowWise) => {
    const out = [];
    const outer = rowWise ? ys.length - 1 : xs.length - 1, inner = rowWise ? xs.length - 1 : ys.length - 1;
    for (let o = 0; o < outer; o++) {
      let start = -1;
      for (let i = 0; i <= inner; i++) {
        const free = i < inner && fine[rowWise ? o * (xs.length - 1) + i : i * (xs.length - 1) + o] === label;
        if (free && start < 0) start = i;
        if (!free && start >= 0) {
          out.push(rowWise ? [xs[start], ys[o], xs[i], ys[o + 1]] : [xs[o], ys[start], xs[o + 1], ys[i]]);
          start = -1;
        }
      }
    }
    // Merge strips that continue one another with the same extent across the split axis.
    const merged = [];
    for (const strip of out) {
      const previous = merged.find(item => rowWise
        ? Math.abs(item[0] - strip[0]) < EPS && Math.abs(item[2] - strip[2]) < EPS && Math.abs(item[3] - strip[1]) < EPS
        : Math.abs(item[1] - strip[1]) < EPS && Math.abs(item[3] - strip[3]) < EPS && Math.abs(item[2] - strip[0]) < EPS);
      if (previous) { if (rowWise) previous[3] = strip[3]; else previous[2] = strip[2]; } else merged.push([...strip]);
    }
    return merged;
  };
  const score = rects => [rects.filter(rect => { const bounds = boundingStreets(rect, corridors); return SIDES.some(side => bounds[side].coverage > EPS && bounds[side].coverage < 1 - EPS); }).length, rects.length];
  const rows = strips(true), columns = strips(false), a = score(rows), b = score(columns);
  return (b[0] < a[0] || (b[0] === a[0] && b[1] < a[1])) ? columns : rows;
}

// Which streets bound each side of a rectangle, and how much of the side they cover.
function boundingStreets(rect, corridors) {
  const [x0, y0, x1, y1] = rect, bounds = {};
  for (const side of SIDES) {
    const along = side === 'north' || side === 'south' ? x1 - x0 : y1 - y0, streets = [];
    let covered = 0;
    for (const { id, width, rect: c } of corridors) {
      const touches = { north: Math.abs(c[1] - y1) < EPS, south: Math.abs(c[3] - y0) < EPS, east: Math.abs(c[0] - x1) < EPS, west: Math.abs(c[2] - x0) < EPS }[side];
      const length = side === 'north' || side === 'south' ? overlapLength(x0, x1, c[0], c[2]) : overlapLength(y0, y1, c[1], c[3]);
      if (touches && length > EPS) { streets.push({ id, width, length: mm(length) }); covered += length; }
    }
    bounds[side] = { streets, coverage: Math.min(1, covered / along) };
  }
  return bounds;
}

// Share a quarter's name pool out along its blocks by frontage length: at least
// one name each, the rest by largest remainder, so no block is left unnamed.
function chunkNames(quarter, names, lengths) {
  if (!lengths.length) return [];
  if (names.length < lengths.length) fail(`quarter ${quarter.id} yields ${lengths.length} blocks but has ${names.length} name${names.length === 1 ? '' : 's'}; add names`);
  const total = lengths.reduce((sum, length) => sum + length, 0), spare = names.length - lengths.length;
  const shares = lengths.map(length => spare * length / total), counts = shares.map(share => 1 + Math.floor(share));
  let left = names.length - counts.reduce((sum, count) => sum + count, 0);
  for (const index of shares.map((share, index) => [share - Math.floor(share), index]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, index]) => index)) if (left-- > 0) counts[index]++;
  const out = []; let cursor = 0;
  for (const count of counts) { out.push(names.slice(cursor, cursor + count)); cursor += count; }
  return out;
}

// Derive blocks for a validated recipe. Returns the derived block entries (in a
// deterministic order) and the diagnostics recorded in the plan's provenance.
export function expandLayout(recipe) {
  const layout = validateLayout(recipe);
  if (!layout) return null;
  const site = recipe.site, warnings = [], cells = [];
  const corridors = (recipe.streets ?? []).map(street => ({ id: street.id, width: street.lane + 2 * street.sidewalk, rect: streetCorridor(street, site) })).filter(item => area(item.rect) > EPS);
  const obstacles = [
    ...corridors.map(item => ({ kind: 'street', id: item.id, rect: item.rect })),
    ...(recipe.plazas ?? []).map(item => ({ kind: 'plaza', id: item.id, rect: clip(item.rect, site) })),
    ...(recipe.blocks ?? []).map(item => ({ kind: 'block', id: item.id, rect: clip(item.rect, site) })),
    ...(recipe.context ?? []).map(item => ({ kind: 'context', id: item.id, rect: clip(item.rect, site) })),
    ...(layout.reserved ?? []).map(item => ({ kind: 'reserved', id: item.id, rect: clip(item.rect, site) })),
  ].filter(item => area(item.rect) > EPS);
  const quarters = layout.quarters.map(quarter => ({ ...quarter, clip: quarter.rect ? clip(quarter.rect, site) : [...site] }));
  // Fine grid: every obstacle edge and quarter edge is a grid line, so each fine
  // cell is wholly inside or outside each of them.
  const lines = axis => [...new Set([site[axis], site[axis + 2], ...obstacles.flatMap(item => [item.rect[axis], item.rect[axis + 2]]), ...quarters.flatMap(item => [item.clip[axis], item.clip[axis + 2]])].map(mm))].sort((a, b) => a - b);
  const xs = lines(0), ys = lines(1), columns = xs.length - 1, fine = new Int16Array(columns * (ys.length - 1)).fill(-1);
  for (let j = 0; j < ys.length - 1; j++) for (let i = 0; i < columns; i++) {
    const cx = (xs[i] + xs[i + 1]) / 2, cy = (ys[j] + ys[j + 1]) / 2;
    if (obstacles.some(item => contains(item.rect, cx, cy))) { fine[j * columns + i] = -2; continue; }
    const quarter = quarters.findIndex(item => contains(item.clip, cx, cy));
    fine[j * columns + i] = quarter; // -1: land no quarter claims
  }
  const derived = [];
  const open = decompose(fine, xs, ys, -1, corridors);
  for (const rect of open) { cells.push({ rect: rect.map(mm), quarter: null, result: 'open', blocks: [] }); warnings.push(`open land ${rect.map(mm).join(',')}: no quarter claims it`); }
  quarters.forEach((quarter, index) => {
    // Reading order on a map: north to south, then west to east.
    const rects = decompose(fine, xs, ys, index, corridors).map(rect => rect.map(mm)).sort((a, b) => b[3] - a[3] || a[0] - b[0]);
    if (!rects.length) warnings.push(`quarter ${quarter.id} claims no land`);
    const blocks = [];
    for (const rect of rects) {
      const bounds = boundingStreets(rect, corridors), cell = { rect, quarter: quarter.id, streets: Object.fromEntries(SIDES.map(side => [side, bounds[side]])), result: 'skipped', blocks: [] };
      cells.push(cell);
      const covered = side => bounds[side].streets.reduce((sum, item) => sum + item.length, 0);
      const bounded = side => bounds[side].coverage > EPS;
      const [x0, y0, x1, y1] = rect, width = x1 - x0, depth = y1 - y0;
      let fronts;
      const front = quarter.front ?? 'auto', split = quarter.split ?? 'auto';
      if (front === 'auto') {
        // Blocks face the main street: the widest, then the longest frontage, then
        // north, south, east, west. A street on the opposite side too splits the
        // land into two back-to-back blocks, when both halves fit the quarter's parcels.
        const widest = side => Math.max(...bounds[side].streets.map(street => street.width));
        const candidates = SIDES.filter(bounded).sort((a, b) => widest(b) - widest(a) || covered(b) - covered(a) || SIDES.indexOf(a) - SIDES.indexOf(b));
        if (!candidates.length) { cell.reason = 'no street bounds this land'; warnings.push(`${quarter.id} ${rect.join(',')}: no street bounds it; add a street, a plaza or a reservation`); continue; }
        const main = candidates[0], opposite = OPPOSITE[main], vertical = main === 'north' || main === 'south';
        // Both halves of a split, on the module midline, must fit the quarter's parcels.
        const mid = snap(vertical ? (y0 + y1) / 2 : (x0 + x1) / 2), shallower = vertical ? Math.min(mid - y0, y1 - mid) : Math.min(mid - x0, x1 - mid);
        if (bounded(opposite) && split === 'auto' && shallower + EPS >= quarter.depth[0]) fronts = [main, opposite];
        else {
          if (bounded(opposite) && split === 'auto') warnings.push(`${quarter.id} ${rect.join(',')}: streets on both sides but too shallow to split (${mm(vertical ? depth : width)} m < ${2 * quarter.depth[0]} m)`);
          fronts = [main];
        }
      } else if (SIDES.includes(front)) {
        if (!bounded(front)) fail(`quarter ${quarter.id}: land ${rect.join(',')} has no street on its ${front} side`);
        fronts = [front];
      } else {
        const side = SIDES.find(item => bounds[item].streets.some(street => street.id === front));
        if (!side) fail(`quarter ${quarter.id}: street ${front} does not bound land ${rect.join(',')}`);
        fronts = [side];
      }
      // A split pair is listed north before south, east before west, whichever is the main street.
      if (fronts.length === 2) fronts.sort((a, b) => SIDES.indexOf(a) - SIDES.indexOf(b));
      const halves = fronts.length === 2
        ? (fronts[0] === 'north' ? (mid => [[x0, mid, x1, y1], [x0, y0, x1, mid]])(snap((y0 + y1) / 2)) : (mid => [[mid, y0, x1, y1], [x0, y0, mid, y1]])(snap((x0 + x1) / 2)))
        : [rect];
      fronts.forEach((face, k) => {
        const own = halves[k].map(mm), ownBounds = boundingStreets(own, corridors);
        const ownWidth = face === 'north' || face === 'south' ? own[2] - own[0] : own[3] - own[1], ownDepth = face === 'north' || face === 'south' ? own[3] - own[1] : own[2] - own[0];
        if (ownWidth + EPS < KIT_CONVENTIONS.bay.min) { warnings.push(`${quarter.id} ${own.join(',')}: too narrow for a bay (${mm(ownWidth)} m)`); return; }
        if (ownDepth + EPS < quarter.depth[0]) { warnings.push(`${quarter.id} ${own.join(',')}: too shallow for the quarter's parcels (${mm(ownDepth)} m < ${quarter.depth[0]} m)`); return; }
        if (ownBounds[face].coverage < 1 - EPS) warnings.push(`${quarter.id} ${own.join(',')}: only ${Math.round(ownBounds[face].coverage * 100)}% of its ${face} frontage is on a street`);
        const sides = quarter.sides === undefined || quarter.sides === 'auto'
          ? ACROSS[face].filter(side => ownBounds[side].coverage >= 1 - EPS)
          : quarter.sides.filter(side => ACROSS[face].includes(side));
        const street = ownBounds[face].streets.slice().sort((a, b) => b.length - a.length)[0]?.id ?? face;
        const offset = face === 'north' || face === 'south' ? own[0] - site[0] : own[1] - site[1];
        blocks.push({ quarter, rect: own, front: face, sides, street, offset, cell });
      });
      cell.result = fronts.length === 2 ? 'split' : 'block';
    }
    // One block takes its quarter's name; several append their fronting street,
    // facing side and offset along the site edge, so adding land elsewhere in the
    // quarter does not rename an existing block.
    const names = chunkNames(quarter, quarter.names, blocks.map(block => block.front === 'north' || block.front === 'south' ? block.rect[2] - block.rect[0] : block.rect[3] - block.rect[1]));
    blocks.forEach((block, index) => {
      const id = blocks.length === 1 ? quarter.id : `${quarter.id}-${block.street}-${block.front}-${Math.round(block.offset)}`;
      if (!idOk(id)) fail(`derived block id ${id} is not a valid id (shorten the quarter or street id)`);
      const entry = { id, style: quarter.style, rect: block.rect, front: block.front, depth: [...quarter.depth], storeys: [...quarter.storeys], bays: [...quarter.bays], names: names[index] };
      if (block.sides.length) entry.sides = block.sides;
      if (quarter.court) entry.court = structuredClone(quarter.court);
      block.cell.blocks.push(id);
      derived.push(entry);
    });
  });
  // Derived blocks never overlap one another, an authored block, a plaza or a street.
  const taken = [...obstacles.map(item => ({ id: `${item.kind} ${item.id}`, rect: item.rect }))];
  for (const block of derived) {
    for (const other of taken) if (overlapLength(block.rect[0], block.rect[2], other.rect[0], other.rect[2]) > EPS && overlapLength(block.rect[1], block.rect[3], other.rect[1], other.rect[3]) > EPS) fail(`derived block ${block.id} overlaps ${other.id}`);
    taken.push({ id: `derived block ${block.id}`, rect: block.rect });
  }
  for (const item of [...(recipe.landmarks ?? []), ...(recipe.furniture ?? [])]) {
    const [x, y] = item.at ?? [(item.rect[0] + item.rect[2]) / 2, (item.rect[1] + item.rect[3]) / 2];
    const block = derived.find(entry => x > entry.rect[0] + EPS && x < entry.rect[2] - EPS && y > entry.rect[1] + EPS && y < entry.rect[3] - EPS);
    if (block) fail(`${item.id} stands inside derived block ${block.id}; keep it on a street or plaza, or reserve its ground in layout.reserved`);
  }
  const seen = new Set();
  for (const { id } of derived) {
    if (seen.has(id) || (recipe.blocks ?? []).some(block => block.id === id)) fail(`derived block ${id} repeats another block id`);
    seen.add(id);
  }
  return { blocks: derived, diagnostics: { cells, warnings, blocks: derived.map(block => ({ id: block.id, rect: block.rect, front: block.front, sides: block.sides ?? [], names: block.names.length })) } };
}
