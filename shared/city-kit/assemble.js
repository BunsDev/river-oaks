// Deterministic neighborhood assembly (#585). A recipe (config/destinations/*.json)
// names streets, plazas, blocks, landmarks and furniture in site-local metres; a
// seed varies only what the recipe leaves open (parcel widths, storeys, depths,
// storefront variants, materials, tree sizes). Each decision draws from its own
// stream keyed by the piece's stable ID, so changing one block never reshuffles
// another. Manual overrides and additions live beside the recipe and are applied
// after generation by stable ID: regeneration re-derives everything else and
// reports, never drops, an override whose target no longer exists.
import { KIT_CONVENTIONS, KIT_MATERIALS, KIT_PIECES, KIT_STYLES, KIT_VERSION, kitPiece } from './catalog.js';
import { expandLayout, validateLayout } from './layout.js';

const MODULE = KIT_CONVENTIONS.module;
const mm = value => Math.round(value * 1000) / 1000;
const snap = value => Math.round(value / MODULE) * MODULE;
const rectOk = r => Array.isArray(r) && r.length === 4 && r.every(Number.isFinite) && r[0] < r[2] && r[1] < r[3];
const pointOk = p => Array.isArray(p) && p.length === 2 && p.every(Number.isFinite);
const rangeOk = r => Array.isArray(r) && r.length === 2 && r.every(Number.isFinite) && r[0] <= r[1];
const idOk = id => typeof id === 'string' && /^[a-z0-9][a-z0-9-]{0,47}$/.test(id);
const fail = message => { throw new Error(`Invalid neighborhood recipe: ${message}`); };
export const insideRect = (r, x, y, margin = 0) => x >= r[0] + margin && x <= r[2] - margin && y >= r[1] + margin && y <= r[3] - margin;
const rectAround = ([x, y], [w, d], yaw = 0) => {
  const turned = Math.abs(Math.sin(yaw)) > .5, hw = (turned ? d : w) / 2, hd = (turned ? w : d) / 2;
  return [mm(x - hw), mm(y - hd), mm(x + hw), mm(y + hd)];
};

// North-running streets and east/west-facing blocks assemble in a frame with x
// and y exchanged, then map back: every kit piece is an axis-aligned rectangle
// or point, so the exchange is exact. Faces swap north<->east and south<->west.
const SWAP_FACE = { north: 'east', east: 'north', south: 'west', west: 'south' };
const swapRect = r => [r[1], r[0], r[3], r[2]];
const swapItem = item => ({ ...item, ...(item.rect ? { rect: swapRect(item.rect) } : {}), ...(item.at ? { at: [item.at[1], item.at[0]] } : {}),
  ...(item.from ? { from: [item.from[1], item.from[0]], to: [item.to[1], item.to[0]] } : {}), ...(item.faces ? { faces: item.faces.map(face => SWAP_FACE[face]) } : {}),
  ...(item.front ? { front: SWAP_FACE[item.front] } : {}), ...(item.sides ? { sides: item.sides.map(face => SWAP_FACE[face]) } : {}),
  ...(item.yaw !== undefined ? { yaw: mm(Math.PI / 2 - item.yaw) } : {}), ...(item.across ? { across: item.across === 'x' ? 'y' : 'x' } : {}) });
function inSwappedFrame(assemble, item, pieces, walks, ...rest) {
  const ownPieces = [], ownWalks = [];
  assemble(swapItem(item), ownPieces, ownWalks, ...rest);
  pieces.push(...ownPieces.map(swapItem)); walks.push(...ownWalks.map(swapItem));
}
// Axis-aligned rectangle difference: up to four pieces, in a fixed order.
function subtractRect(r, box) {
  if (box[0] >= r[2] || box[2] <= r[0] || box[1] >= r[3] || box[3] <= r[1]) return [r];
  const out = [], y0 = Math.max(r[1], box[1]), y1 = Math.min(r[3], box[3]);
  if (box[1] > r[1]) out.push([r[0], r[1], r[2], box[1]]);
  if (box[3] < r[3]) out.push([r[0], box[3], r[2], r[3]]);
  if (box[0] > r[0]) out.push([r[0], y0, box[0], y1]);
  if (box[2] < r[2]) out.push([box[2], y0, r[2], y1]);
  return out.filter(item => item[2] - item[0] > 1e-6 && item[3] - item[1] > 1e-6).map(item => item.map(mm));
}

// Canonical JSON (sorted keys) and a browser-safe 64-bit FNV-1a pair: the same
// recipe, seed and overrides hash identically in Node and in every browser.
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().filter(key => value[key] !== undefined).map(key => `${JSON.stringify(key)}:${canonicalJSON(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function fnv32(text, basis) {
  let hash = basis;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619) >>> 0; }
  return hash >>> 0;
}
export const stableHash = value => {
  const text = typeof value === 'string' ? value : canonicalJSON(value);
  return fnv32(text, 2166136261).toString(16).padStart(8, '0') + fnv32(text, 3735928559).toString(16).padStart(8, '0');
};
// mulberry32 per stable ID.
// What a plan puts on the ground, independent of the recipe that produced it: the
// lock records it so a recipe rewrite (authored blocks as quarters) proves itself.
export const geometryHash = plan => stableHash({ pieces: plan.pieces, surfaces: plan.surfaces, solids: plan.solids, lanterns: plan.lanterns, stats: plan.stats });

export function streamFor(seed, id) {
  let state = fnv32(`${seed}:${id}`, 2166136261);
  const next = () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return { next, between: (a, b) => a + (b - a) * next(), int: (a, b) => a + Math.floor(next() * (b - a + 1)), pick: list => list[Math.floor(next() * list.length)] };
}

const SETTABLE = new Set(['variant', 'awning', 'sign', 'storeys', 'wall', 'trim', 'roof', 'at', 'yaw', 'height', 'radius', 'depth']);

export function validateRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) fail('not an object');
  if (!idOk(recipe.id)) fail('id');
  if (recipe.kit !== KIT_VERSION) fail(`kit must be ${KIT_VERSION}`);
  if (!Number.isInteger(recipe.seed) || recipe.seed < 0 || recipe.seed >= 2 ** 32) fail('seed');
  if (!rectOk(recipe.site)) fail('site');
  const ids = new Set(), unique = (kind, id) => { if (!idOk(id) || ids.has(id)) fail(`${kind} id ${id}`); ids.add(id); };
  const streets = new Map();
  for (const street of recipe.streets ?? []) {
    unique('street', street.id);
    const east = pointOk(street.from) && pointOk(street.to) && street.from[1] === street.to[1] && street.from[0] < street.to[0];
    const north = pointOk(street.from) && pointOk(street.to) && street.from[0] === street.to[0] && street.from[1] < street.to[1];
    if (!east && !north) fail(`street ${street.id} must run east along one y or north along one x`);
    if (!(street.lane > 0 && street.sidewalk > 0)) fail(`street ${street.id} widths`);
    if (street.paving !== undefined && !KIT_MATERIALS[street.paving]) fail(`street ${street.id} paving`);
    if (street.bands !== undefined && !(street.bands.spacing > 0 && street.bands.offset >= 0)) fail(`street ${street.id} bands`);
    streets.set(street.id, street);
  }
  for (const plaza of recipe.plazas ?? []) {
    unique('plaza', plaza.id); if (!rectOk(plaza.rect)) fail(`plaza ${plaza.id}`);
    // A row derives its items from one line: `y` with `from`/`to` along x (east-running) or `x` along y.
    for (const key of ['treeRows', 'benchRows', 'lampRows']) for (const [i, row] of (plaza[key] ?? []).entries()) {
      const axis = (row?.x !== undefined ? 1 : 0) + (row?.y !== undefined ? 1 : 0);
      if (!row || axis !== 1 || !Number.isFinite(row.x ?? row.y) || !Number.isFinite(row.from) || !Number.isFinite(row.to) || row.from > row.to || !(row.spacing > 0) || (row.to - row.from) / row.spacing > 64 || (row.yaw !== undefined && !Number.isFinite(row.yaw))) fail(`plaza ${plaza.id} ${key} ${i}`);
    }
  }
  for (const block of recipe.blocks ?? []) {
    unique('block', block.id);
    if (!KIT_STYLES[block.style]) fail(`block ${block.id} style`);
    if (!rectOk(block.rect) || !['north', 'south', 'east', 'west'].includes(block.front)) fail(`block ${block.id} rect/front`);
    if (!rangeOk(block.depth) || !rangeOk(block.storeys) || !rangeOk(block.bays) || block.bays[0] < KIT_CONVENTIONS.bay.min || block.bays[1] > KIT_CONVENTIONS.bay.max) fail(`block ${block.id} ranges`);
    if (!Array.isArray(block.names) || !block.names.length || !block.names.every(name => typeof name === 'string' && name.length <= 32)) fail(`block ${block.id} names`);
    if (block.court && !(block.court.width > 0 && block.court.depth > 0 && block.court.at > 0 && block.court.at < 1)) fail(`block ${block.id} court`);
  }
  for (const item of [...(recipe.landmarks ?? []), ...(recipe.furniture ?? []), ...(recipe.additions ?? [])]) {
    kitPiece(item.piece);
    if (!pointOk(item.at) && !rectOk(item.rect)) fail(`${item.id} placement`);
  }
  for (const item of [...(recipe.landmarks ?? []), ...(recipe.furniture ?? [])]) unique('item', item.id);
  for (const item of recipe.additions ?? []) unique('addition', item.id);
  for (const [id, override] of Object.entries(recipe.overrides ?? {})) {
    if (typeof id !== 'string' || !id.startsWith(`${recipe.id}/`)) fail(`override ${id} must address a stable piece ID`);
    if (!override || typeof override !== 'object' || (override.suppress !== undefined && override.suppress !== true)) fail(`override ${id}`);
    if (Object.keys(override).some(key => !['set', 'suppress', 'note'].includes(key))) fail(`override ${id} keys`);
    for (const key of Object.keys(override.set ?? {})) if (!SETTABLE.has(key)) fail(`override ${id} cannot set ${key}`);
  }
  // Quarters and reservations that derive further blocks from the streets (layout.js).
  validateLayout(recipe);
  return recipe;
}

// Parcels fill a frontage exactly: one shop of one or two bays each, bay widths
// on the half-metre module, the last parcel absorbing the remainder.
function parcelWidths(length, [min, max], random) {
  const parcels = [];
  let left = length;
  while (left > 1e-6) {
    const bays = random.int(1, 2), bay = snap(random.between(min, max)), width = bays * bay;
    if (left - width < min) {
      const count = Math.max(1, Math.round(left / ((min + max) / 2)));
      parcels.push({ bays: count, width: left });
      break;
    }
    parcels.push({ bays, width });
    left -= width;
  }
  return parcels;
}

function buildingHeight(storeys) { return KIT_CONVENTIONS.storey.ground + (storeys - 1) * KIT_CONVENTIONS.storey.upper; }

function assembleBlock(recipe, block, seed, pieces, walks, pinned) {
  if (block.front === 'east' || block.front === 'west') return inSwappedFrame((own, ownPieces, ownWalks) => assembleBlock(recipe, own, seed, ownPieces, ownWalks, pinned), block, pieces, walks);
  // Shop names an artist pinned by override are taken out of the generator's pool.
  const style = KIT_STYLES[block.style], [x0, y0, x1, y1] = block.rect, north = block.front === 'north';
  const frontY = north ? y1 : y0, inward = north ? -1 : 1, base = `${recipe.id}/${block.id}`;
  const segments = [];
  const names = block.names.filter(name => !pinned.has(name));
  if (block.court) {
    // The court is authored, not varied: hand-placed court furniture depends on it.
    const width = snap(block.court.width), centre = snap(x0 + (x1 - x0) * block.court.at);
    const cx0 = centre - width / 2, cx1 = centre + width / 2, back = frontY + inward * block.court.depth;
    segments.push([x0, cx0], [cx1, x1]);
    pieces.push({ id: `${base}/court`, piece: 'street/court', rect: [mm(cx0), mm(Math.min(frontY, back)), mm(cx1), mm(Math.max(frontY, back))] });
    // Walkable rectangles are eroded by the walking radius, so the court's ground
    // overlaps the sidewalk by a metre: a shared edge alone would be a wall.
    const reach = frontY - inward;
    walks.push({ id: `${base}/court`, rect: [mm(cx0), mm(Math.min(reach, back)), mm(cx1), mm(Math.max(reach, back))] });
    // The court's back wing faces into the court.
    const wing = streamFor(seed, `${base}/court-wing`), storeys = wing.int(block.storeys[0], block.storeys[1]);
    const far = north ? y0 : y1;
    pieces.push({ id: `${base}/court-wing`, piece: 'building/shell', rect: [mm(cx0), mm(Math.min(back, far)), mm(cx1), mm(Math.max(back, far))],
      storeys, height: mm(buildingHeight(storeys)), wall: wing.pick(style.wall), trim: style.trim, roof: wing.pick(style.roofs), style: block.style,
      faces: [block.front], bays: Math.max(1, Math.round(width / 5)), sign: names.length ? names.splice(Math.floor(wing.next() * names.length), 1)[0] : null, variant: style.storefronts[0], awning: style.awnings[0] });
  } else segments.push([x0, x1]);
  let parcelIndex = 0;
  segments.forEach(([sx0, sx1], segmentIndex) => {
    const widths = parcelWidths(sx1 - sx0, block.bays, streamFor(seed, `${base}/segment-${segmentIndex}`));
    let cursor = sx0;
    for (const { bays, width } of widths) {
      const id = `${base}/parcel-${parcelIndex++}`, random = streamFor(seed, id);
      const storeys = random.int(block.storeys[0], block.storeys[1]), depth = snap(random.between(block.depth[0], block.depth[1]));
      const back = frontY + inward * depth;
      const faces = [block.front];
      if (Math.abs(cursor - x0) < 1e-6 && block.sides?.includes('west')) faces.push('west');
      if (Math.abs(cursor + width - x1) < 1e-6 && block.sides?.includes('east')) faces.push('east');
      // A row with more shopfronts than names leaves the rest unsigned rather than repeating one.
      const sign = names.length ? names.splice(Math.floor(random.next() * names.length), 1)[0] : null;
      pieces.push({ id, piece: 'building/shell', rect: [mm(cursor), mm(Math.min(frontY, back)), mm(cursor + width), mm(Math.max(frontY, back))],
        storeys, height: mm(buildingHeight(storeys)), wall: random.pick(style.wall), trim: style.trim, roof: random.pick(style.roofs), style: block.style,
        faces, bays, sign, variant: random.pick(style.storefronts), awning: random.pick(style.awnings) });
      // Rear fill closes the block behind the street parcel, one storey lower.
      const far = north ? y0 : y1;
      if (Math.abs(far - back) > 1) {
        const rearFaces = faces.filter(face => face === 'east' || face === 'west');
        pieces.push({ id: `${id}/rear`, piece: 'building/shell', rect: [mm(cursor), mm(Math.min(back, far)), mm(cursor + width), mm(Math.max(back, far))],
          storeys: Math.max(1, storeys - 1), height: mm(buildingHeight(Math.max(1, storeys - 1))), wall: random.pick(style.wall), trim: style.trim, roof: 'parapet', style: block.style,
          faces: rearFaces, bays: Math.max(1, Math.round(Math.abs(far - back) / 6)), sign: null, variant: 'recessed', awning: style.awnings[0] });
      }
      cursor += width;
    }
  });
}

function assembleStreet(recipe, street, seed, pieces, walks) {
  if (street.from[0] === street.to[0]) return inSwappedFrame((own, ownPieces, ownWalks) => assembleStreet(recipe, own, seed, ownPieces, ownWalks), street, pieces, walks);
  const base = `${recipe.id}/${street.id}`, [xa, y] = street.from, xb = street.to[0], half = street.lane / 2, outer = half + street.sidewalk;
  // One walkable rectangle spans the curbless street, lane and both sidewalks.
  walks.push({ id: `${base}/walk`, rect: [xa, mm(y - outer), xb, mm(y + outer)] });
  pieces.push({ id: `${base}/lane`, piece: 'street/shared-lane', rect: [xa, mm(y - half), xb, mm(y + half)], ...(street.paving ? { material: street.paving } : {}) });
  // Porcelain cross bands inlaid in the lane, and flush channel drains inside each curb.
  if (street.bands) for (let x = xa + street.bands.offset, index = 0; x <= xb - .5; x += street.bands.spacing)
    // A pair of slim inlays, 0.12 m wide and 0.3 m apart, reads as a laid detail, not a road marking.
    for (const offset of [-.21, .21]) pieces.push({ id: `${base}/band-${index++}`, piece: 'street/band', rect: [mm(x + offset - .06), mm(y - half + .3), mm(x + offset + .06), mm(y + half - .3)] });
  if (street.drains) for (const [side, sign] of [['n', 1], ['s', -1]])
    pieces.push({ id: `${base}/drain-${side}`, piece: 'street/channel', rect: sign > 0 ? [xa, mm(y + half - .3), xb, mm(y + half - .12)] : [xa, mm(y - half + .12), xb, mm(y - half + .3)] });
  pieces.push({ id: `${base}/sidewalk-n`, piece: 'street/sidewalk', rect: [xa, mm(y + half), xb, mm(y + outer)] });
  pieces.push({ id: `${base}/sidewalk-s`, piece: 'street/sidewalk', rect: [xa, mm(y - outer), xb, mm(y - half)] });
  for (const [side, edge] of [['n', y + half], ['s', y - half]]) pieces.push({ id: `${base}/curb-${side}`, piece: 'street/flush-curb', rect: [xa, mm(edge - .08), xb, mm(edge + .08)] });
  const kerbside = sign => mm(y + sign * (half + .9)), clear = street.clear ?? [];
  const open = x => !clear.some(([a, b]) => x >= a && x <= b);
  if (street.trees) {
    for (const [side, sign] of [['n', 1], ['s', -1]]) {
      let index = 0;
      for (let x = xa + street.trees.offset; x <= xb - 1; x += street.trees.spacing) {
        if (!open(x)) continue;
        // Heights and crowns span most of the District's surveyed street trees (7.5–16 m, 2.1–5.2 m)
        // so a row reads as planted over years, not as one repeated tree.
        const id = `${base}/tree-${side}-${index++}`, random = streamFor(seed, id);
        pieces.push({ id, piece: 'landscape/street-tree', at: [mm(x), kerbside(sign)], height: mm(random.between(7.5, 14)), radius: mm(random.between(2.6, 4.8)), yaw: mm(random.between(0, Math.PI * 2)) });
        pieces.push({ id: `${id}/pit`, piece: 'landscape/tree-pit', rect: rectAround([mm(x), kerbside(sign)], [1.4, 1.2]) });
      }
    }
  }
  if (street.lamps) {
    // Trees and lamps share the kerbside line at independent spacings. Where a lamp
    // would stand in a tree pit (its column in the trunk, its globe in the canopy),
    // it moves half a tree spacing along the street, between two trees.
    const trees = new Set(pieces.filter(piece => piece.piece === 'landscape/street-tree' && piece.id.startsWith(`${base}/tree-`)).map(piece => `${piece.at[1]}|${piece.at[0]}`));
    const inPit = (x, sign) => [...trees].some(key => { const [ty, tx] = key.split('|').map(Number); return ty === kerbside(sign) && Math.abs(tx - x) < 1; });
    let index = 0;
    for (let x = xa + street.lamps.offset; x <= xb - 1; x += street.lamps.spacing) {
      const sign = index % 2 ? -1 : 1;
      let at = x;
      if (inPit(at, sign) && street.trees) {
        at = [x + street.trees.spacing / 2, x - street.trees.spacing / 2].find(candidate => candidate >= xa + 1 && candidate <= xb - 1 && open(candidate) && !inPit(candidate, sign)) ?? null;
      }
      if (at !== null && open(at)) pieces.push({ id: `${base}/lamp-${index}`, piece: 'furniture/lamp', at: [mm(at), kerbside(sign)], yaw: sign > 0 ? Math.PI / 2 : -Math.PI / 2 });
      index++;
    }
  }
}

function assemblePlaza(recipe, plaza, seed, pieces, walks) {
  const base = `${recipe.id}/${plaza.id}`;
  walks.push({ id: `${base}/walk`, rect: [...plaza.rect] });
  pieces.push({ id: `${base}/paving`, piece: 'street/court', rect: [...plaza.rect] });
  (plaza.lawns ?? []).forEach((rect, i) => pieces.push({ id: `${base}/lawn-${i}`, piece: 'landscape/lawn', rect: [...rect] }));
  (plaza.hedges ?? []).forEach((rect, i) => pieces.push({ id: `${base}/hedge-${i}`, piece: 'landscape/hedge', rect: [...rect] }));
  for (const [i, row] of (plaza.treeRows ?? []).entries()) for (const [index, at] of rowPoints(row).entries()) {
    const id = `${base}/tree-row-${i}-${index}`, random = streamFor(seed, id);
    pieces.push({ id, piece: 'landscape/street-tree', at, height: mm(random.between(9, 13)), radius: mm(random.between(3.4, 4.6)), yaw: mm(random.between(0, Math.PI * 2)) });
    pieces.push({ id: `${id}/pit`, piece: 'landscape/tree-pit', rect: rectAround(at, [1.6, 1.6]) });
  }
  // Benches and lamps by the row, like trees: one line and a spacing instead of an item each.
  // Derived ids are stable (`<plaza>/bench-row-<row>-<n>`), so overrides address them.
  for (const [i, row] of (plaza.benchRows ?? []).entries()) for (const [index, at] of rowPoints(row).entries()) pieces.push({ id: `${base}/bench-row-${i}-${index}`, piece: 'furniture/bench', at, yaw: mm(row.yaw ?? 0) });
  for (const [i, row] of (plaza.lampRows ?? []).entries()) for (const [index, at] of rowPoints(row).entries()) pieces.push({ id: `${base}/lamp-row-${i}-${index}`, piece: 'furniture/lamp', at, yaw: mm(row.yaw ?? 0) });
}

// The points of a row: along x at `y` (east-running) or along y at `x` (north-running), `from` to `to` every `spacing`.
function rowPoints(row) {
  const points = [];
  for (let v = row.from; v <= row.to + 1e-6; v += row.spacing) points.push(row.x === undefined ? [mm(v), mm(row.y)] : [mm(row.x), mm(v)]);
  return points;
}

// Where an east street crosses a north street, paving is clipped to the crossing
// box and replaced by one lane square, four striped crosswalks and four sidewalk
// corners; trees and lamps within two metres of the box are left out.
function assembleIntersections(recipe, pieces) {
  const streets = recipe.streets ?? [], east = streets.filter(s => s.from[1] === s.to[1]), north = streets.filter(s => s.from[0] === s.to[0]);
  for (const a of east) for (const b of north) {
    const ya = a.from[1], xb = b.from[0], ha = a.lane / 2, oa = ha + a.sidewalk, hb = b.lane / 2, ob = hb + b.sidewalk;
    if (xb < a.from[0] || xb > a.to[0] || ya < b.from[1] || ya > b.to[1]) continue;
    const box = [xb - ob, ya - oa, xb + ob, ya + oa].map(mm), base = `${recipe.id}/${a.id}-x-${b.id}`, near = [box[0] - 2, box[1] - 2, box[2] + 2, box[3] + 2];
    for (let i = pieces.length - 1; i >= 0; i--) {
      const piece = pieces[i], own = piece.id.startsWith(`${recipe.id}/${a.id}/`) || piece.id.startsWith(`${recipe.id}/${b.id}/`);
      if (!own) continue;
      if (piece.at && insideRect(near, piece.at[0], piece.at[1])) { pieces.splice(i, 1); continue; }
      if (piece.id.endsWith('/pit') && insideRect(near, (piece.rect[0] + piece.rect[2]) / 2, (piece.rect[1] + piece.rect[3]) / 2)) { pieces.splice(i, 1); continue; }
      if (!piece.rect || !['street/shared-lane', 'street/sidewalk', 'street/flush-curb', 'street/band', 'street/channel'].includes(piece.piece)) continue;
      const parts = subtractRect(piece.rect, box);
      pieces.splice(i, 1, ...parts.map((rect, k) => ({ ...piece, id: `${piece.id}-${k}`, rect })));
    }
    // The crossing takes the paving of the street it interrupts.
    const paving = a.paving ? { material: a.paving } : {};
    pieces.push({ id: `${base}/centre`, piece: 'street/intersection', rect: [mm(xb - hb), mm(ya - ha), mm(xb + hb), mm(ya + ha)], ...paving });
    pieces.push({ id: `${base}/crosswalk-w`, piece: 'street/crosswalk', rect: [box[0], mm(ya - ha), mm(xb - hb), mm(ya + ha)], across: 'x', ...paving });
    pieces.push({ id: `${base}/crosswalk-e`, piece: 'street/crosswalk', rect: [mm(xb + hb), mm(ya - ha), box[2], mm(ya + ha)], across: 'x', ...paving });
    pieces.push({ id: `${base}/crosswalk-s`, piece: 'street/crosswalk', rect: [mm(xb - hb), box[1], mm(xb + hb), mm(ya - ha)], across: 'y', ...paving });
    pieces.push({ id: `${base}/crosswalk-n`, piece: 'street/crosswalk', rect: [mm(xb - hb), mm(ya + ha), mm(xb + hb), box[3]], across: 'y', ...paving });
    for (const [k, [x0, y0, x1, y1]] of [[box[0], box[1], xb - hb, ya - ha], [xb + hb, box[1], box[2], ya - ha], [box[0], ya + ha, xb - hb, box[3]], [xb + hb, ya + ha, box[2], box[3]]].entries())
      pieces.push({ id: `${base}/corner-${k}`, piece: 'street/sidewalk', rect: [mm(x0), mm(y0), mm(x1), mm(y1)] });
  }
}

const solidRect = piece => {
  const spec = KIT_PIECES[piece.piece];
  if (piece.rect) return piece.rect;
  return rectAround(piece.at, spec.footprint ?? [.6, .6], piece.yaw ?? 0);
};

function applyOverrides(recipe, pieces) {
  const overrides = recipe.overrides ?? {}, applied = [], orphaned = [];
  const byId = new Map(pieces.map(piece => [piece.id, piece]));
  for (const [id, override] of Object.entries(overrides).sort(([a], [b]) => a < b ? -1 : 1)) {
    const target = byId.get(id);
    if (!target) { orphaned.push(id); continue; }
    if (override.suppress) for (const piece of pieces) if (piece.id === id || piece.id.startsWith(`${id}/`)) piece.suppressed = true;
    if (override.set) {
      Object.assign(target, structuredClone(override.set));
      if (override.set.storeys !== undefined && override.set.height === undefined) target.height = mm(buildingHeight(target.storeys));
    }
    target.override = override.suppress ? 'suppressed' : 'edited';
    applied.push(id);
  }
  return { pieces: pieces.filter(piece => !piece.suppressed), applied, orphaned };
}

// The plan both runtimes consume: canonical pieces, walkable surfaces and solids.
export function assembleNeighborhood(source, { seed = source?.seed } = {}) {
  const recipe = validateRecipe(structuredClone(source));
  if (!Number.isInteger(seed) || seed < 0 || seed >= 2 ** 32) fail('seed');
  // The recipe hash is the authored intent: derived blocks are a function of it.
  const recipeHash = stableHash({ ...recipe, seed: undefined, overrides: undefined, additions: undefined });
  const layout = expandLayout(recipe);
  if (layout) { recipe.blocks = [...(recipe.blocks ?? []), ...layout.blocks]; validateRecipe(recipe); }
  const generated = [], walks = [];
  const pinned = new Set(Object.values(recipe.overrides ?? {}).map(override => override.set?.sign).filter(Boolean));
  for (const street of recipe.streets ?? []) assembleStreet(recipe, street, seed, generated, walks);
  assembleIntersections(recipe, generated);
  for (const plaza of recipe.plazas ?? []) assemblePlaza(recipe, plaza, seed, generated, walks);
  for (const block of recipe.blocks ?? []) assembleBlock(recipe, block, seed, generated, walks, pinned);
  for (const item of [...(recipe.landmarks ?? []), ...(recipe.furniture ?? [])]) generated.push({ ...structuredClone(item), id: `${recipe.id}/${item.id}` });
  for (const context of recipe.context ?? []) generated.push({ id: `${recipe.id}/${context.id}`, piece: context.piece ?? 'building/context', rect: [...context.rect], height: context.height ?? 0, wall: context.wall ?? null });
  const { pieces: kept, applied, orphaned } = applyOverrides(recipe, generated);
  for (const item of recipe.additions ?? []) kept.push({ ...structuredClone(item), id: `${recipe.id}/manual/${item.id}`, override: 'added' });
  const pieces = kept.map(piece => Object.fromEntries(Object.entries(piece).map(([key, value]) => [key, typeof value === 'number' ? mm(value) : value])));
  const ids = new Set();
  for (const piece of pieces) { if (ids.has(piece.id)) fail(`duplicate piece ${piece.id}`); ids.add(piece.id); }
  const surfaces = walks.map(walk => ({ id: walk.id, rect: walk.rect.map(mm) }));
  const solids = pieces.filter(piece => KIT_PIECES[piece.piece].collision === 'solid').flatMap(piece => {
    if (piece.piece === 'landmark/water-tower') {
      const [x, y] = piece.at, spread = (KIT_PIECES[piece.piece].footprint[0] - 1) / 2;
      return [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy], i) => ({ id: `${piece.id}/leg-${i}`, kind: 'column', rect: rectAround([mm(x + sx * spread), mm(y + sy * spread)], [.7, .7]), height: KIT_PIECES[piece.piece].height }));
    }
    const kind = piece.piece.split('/')[1];
    return [{ id: piece.id, kind, rect: solidRect(piece), height: piece.piece === 'landscape/street-tree' ? 2.5 : KIT_PIECES[piece.piece].height }];
  });
  for (const solid of solids) {
    const [w, s, e, n] = solid.rect;
    if (!surfaces.some(surface => insideRect(surface.rect, w, s) && insideRect(surface.rect, e, n))) fail(`solid ${solid.id} is not inside walkable ground`);
  }
  const lanterns = pieces.filter(piece => piece.piece === 'furniture/lantern').map(piece => ({ id: piece.id, at: [...piece.at], name: piece.name ?? piece.id.split('/').pop() }));
  const triangles = pieces.reduce((sum, piece) => sum + (KIT_PIECES[piece.piece].triangles ?? 0) * (piece.piece === 'building/shell' ? 1 + (piece.faces?.length ?? 0) * (piece.bays ?? 1) * piece.storeys / 4 : 1), 0);
  const materials = new Set(pieces.flatMap(piece => [piece.wall, piece.trim, piece.awning, piece.material ?? KIT_PIECES[piece.piece].material].filter(Boolean)));
  for (const material of materials) if (!KIT_MATERIALS[material]) fail(`unknown material ${material}`);
  const plan = {
    id: recipe.id, kit: KIT_VERSION, seed, site: [...recipe.site],
    provenance: { recipe: recipe.id, recipeHash,
      overridesHash: stableHash({ overrides: recipe.overrides ?? {}, additions: recipe.additions ?? [] }), inspiration: recipe.inspiration ?? null,
      overrides: { applied, orphaned, added: (recipe.additions ?? []).map(item => `${recipe.id}/manual/${item.id}`) },
      // Only recipes with a layout record one: plans without it keep their committed hashes.
      ...(layout ? { layout: { hash: stableHash(recipe.layout), cells: layout.diagnostics.cells.length, blocks: layout.diagnostics.blocks, warnings: layout.diagnostics.warnings } } : {}) },
    pieces, surfaces, solids, lanterns,
    stats: { pieces: pieces.length, buildings: pieces.filter(piece => piece.piece === 'building/shell').length, solids: solids.length, materials: materials.size, triangles: Math.round(triangles) },
  };
  return { ...plan, hash: stableHash(plan) };
}

// Translate a site-local plan into world east/north metres at an anchor.
export function placePlan(plan, [east, north]) {
  const point = ([x, y]) => [mm(east + x), mm(north + y)], rect = r => [mm(east + r[0]), mm(north + r[1]), mm(east + r[2]), mm(north + r[3])];
  const move = item => ({ ...item, ...(item.rect ? { rect: rect(item.rect) } : {}), ...(item.at ? { at: point(item.at) } : {}) });
  return { ...plan, anchor: [east, north], site: rect(plan.site), pieces: plan.pieces.map(move), surfaces: plan.surfaces.map(move), solids: plan.solids.map(move), lanterns: plan.lanterns.map(move) };
}

// Grid flood fill over walkable rectangles minus solids, eroded by the walking
// radius: every walkable sample must connect to the entry, so no pocket or court
// is a dead end. This is an authoring check; runtime tests use the real controller.
export function walkableConnectivity(plan, { entry, radius = .35, step = .25, extraSurfaces = [], extraSolids = [] } = {}) {
  const surfaces = [...plan.surfaces, ...extraSurfaces], solids = [...plan.solids, ...extraSolids];
  const xs = surfaces.flatMap(s => [s.rect[0], s.rect[2]]), ys = surfaces.flatMap(s => [s.rect[1], s.rect[3]]);
  const west = Math.min(...xs), south = Math.min(...ys), columns = Math.ceil((Math.max(...xs) - west) / step) + 1, rows = Math.ceil((Math.max(...ys) - south) / step) + 1;
  const free = (x, y) => surfaces.some(s => insideRect(s.rect, x, y, radius)) && !solids.some(s => x > s.rect[0] - radius && x < s.rect[2] + radius && y > s.rect[1] - radius && y < s.rect[3] + radius);
  const open = new Uint8Array(columns * rows), seen = new Uint8Array(columns * rows);
  let total = 0;
  for (let j = 0; j < rows; j++) for (let i = 0; i < columns; i++) if (free(west + i * step, south + j * step)) { open[j * columns + i] = 1; total++; }
  const cell = ([x, y]) => [Math.round((x - west) / step), Math.round((y - south) / step)];
  const [si, sj] = cell(entry);
  if (!open[sj * columns + si]) return { total, reached: 0, ratio: 0, reachable: () => false };
  const queue = [sj * columns + si]; seen[queue[0]] = 1;
  let reached = 0;
  while (queue.length) {
    const index = queue.pop(), i = index % columns, j = (index - i) / columns; reached++;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const ni = i + di, nj = j + dj, next = nj * columns + ni;
      if (ni >= 0 && nj >= 0 && ni < columns && nj < rows && open[next] && !seen[next]) { seen[next] = 1; queue.push(next); }
    }
  }
  const reachable = point => { const [i, j] = cell(point); return i >= 0 && j >= 0 && i < columns && j < rows && Boolean(seen[j * columns + i]); };
  return { total, reached, ratio: reached / total, reachable };
}
