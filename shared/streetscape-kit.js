// Original TypeSafe Place architecture. All dimensions are metres east/north/up.
// One contract supplies visual pieces, ground blockers and conservative flight volumes.
const provenance = Object.freeze({ kind: 'original-authored', source: 'TypeSafe Place streetscape kit', version: 1, license: 'repository-authored; no external assets' });
const module = (size, role) => Object.freeze({ size: Object.freeze(size), role, pivot: 'ground-centre', provenance });
export const STREETSCAPE_MODULES = Object.freeze({
  storefront: module([4, 8, 4.15], 'open storefront bay'),
  shell: module([4, 8, 7.65], 'opaque two-storey end bay'),
  arcade: module([4, 3, 3.75], 'covered pedestrian bay'),
  pavilion: module([12, 8, 3.9], 'open social landmark'),
  bench: module([2.4, .65, .9], 'public furniture'),
  planter: module([2, 1, 1.3], 'planted furnishing strip'),
  lamp: module([1.2, 1.2, 4.3], 'orbital streetlamp'),
});
const PALETTES = new Set(['market', 'court']);
const validId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(value);
const record = value => value && typeof value === 'object' && !Array.isArray(value);
const fail = reason => { throw new Error(`Invalid streetscape: ${reason}`); };
const transform = ([x, y, z], placement) => {
  const a = placement.rotation * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return [placement.position[0] + x * c - y * s, placement.position[1] + x * s + y * c, placement.position[2] + z];
};

function moduleParts(kind) {
  const parts = [], sockets = [];
  const box = (id, material, x, n, bottom, w, d, h, collidable = false, detail = false) =>
    parts.push({ id, material, shape: 'box', position: [x, n, bottom + h / 2], size: [w, d, h], collidable, detail });
  const cylinder = (id, material, x, n, bottom, diameter, h, collidable = false, detail = false) =>
    parts.push({ id, material, shape: 'cylinder', position: [x, n, bottom + h / 2], size: [diameter, diameter, h], collidable, detail });
  if (kind === 'storefront' || kind === 'shell') {
    const height = kind === 'shell' ? 7 : 3.5;
    box('floor', 'terrazzo', 0, 0, 0, 4, 8, .06);
    parts.at(-1).support = true;
    box('west-wall', 'stone', -1.875, 0, 0, .25, 8, height, true);
    box('east-wall', 'stone', 1.875, 0, 0, .25, 8, height, true);
    box('rear-wall', 'stone', 0, 3.875, 0, 3.5, .25, height, true);
    if (kind === 'shell') box('front-wall', 'stone', 0, -3.875, 0, 3.5, .25, height, true);
    else {
      for (const side of [-1, 1]) {
        box(`glazing-${side}`, 'glass', side * 1.3, -3.85, .15, .9, .06, 2.85, true);
        box(`plinth-${side}`, 'stone', side * 1.3, -3.85, 0, .9, .25, .15, true);
        for (const x of [.85, 1.75]) box(`mullion-${side}-${x}`, 'brass', side * x, -3.9, .15, .045, .1, 2.85, true);
      }
      box('transom', 'glass', 0, -3.85, 2.7, 1.7, .06, .3);
      box('door-head', 'brass', 0, -3.9, 2.67, 1.75, .1, .045);
      sockets.push({ id: 'entry', role: 'entry', position: [0, -4, 0], width: 1.7, clearHeight: 2.67 });
      box('display-plinth', 'terrazzo', -1.1, 1.7, .06, .9, 1.5, .45, true);
      box('display-object', 'accent', -1.1, 1.7, .51, .5, .6, .65, true);
    }
    box('roof', 'ivory', 0, 0, height, 4, 8, .25);
    box('parapet-front', 'accent', 0, -3.88, height + .25, 4, .24, .4);
    box('parapet-rear', 'ivory', 0, 3.88, height + .25, 4, .24, .4);
    for (const side of [-1, 1]) box(`parapet-side-${side}`, 'ivory', side * 1.88, 0, height + .25, .24, 7.52, .4);
    box('canopy', 'ivory', 0, -4.45, 3.15, 4, 2.1, .18);
    box('canopy-fascia', 'accent', 0, -5.48, 3.15, 4, .08, .24);
    box('canopy-light', 'light', 0, -5.22, 3.13, 3.4, .04, .025, false, true);
    for (const x of [-1.7, 1.7]) box(`downpipe-${x}`, 'brass', x, 3.99, .08, .065, .065, height + .3, false, true);
    if (kind === 'shell') {
      box('upper-band', 'ivory', 0, -4.03, 3.45, 4, .12, .2);
      for (const x of [-1, 1]) {
        box(`upper-window-${x}`, 'glass', x, -4.035, 4.3, 1.3, .07, 1.8);
        box(`upper-sill-${x}`, 'brass', x, -4.1, 4.25, 1.45, .25, .08, false, true);
      }
    }
  } else if (kind === 'pavilion' || kind === 'arcade') {
    const w = kind === 'pavilion' ? 12 : 4, d = kind === 'pavilion' ? 8 : 3, clear = kind === 'pavilion' ? 3.2 : 3.5;
    for (const x of [-w / 2 + .25, w / 2 - .25]) for (const n of [-d / 2 + .25, d / 2 - .25]) {
      box(`post-${x}-${n}`, 'teal', x, n, 0, .35, .35, clear, true);
      box(`post-foot-${x}-${n}`, 'brass', x, n, 0, .42, .42, .15, true);
      box(`capital-${x}-${n}`, 'brass', x, n, clear - .1, .6, .6, .1);
    }
    box('roof', 'ivory', 0, 0, clear, w + .8, d + .8, .25);
    for (const n of [-d / 2 - .37, d / 2 + .37]) box(`fascia-${n}`, 'accent', 0, n, clear, w + .8, .06, .25);
    if (kind === 'pavilion') {
      box('raised-canopy', 'ivory', 0, 0, clear + .35, w - 2, d - 2, .25);
      box('clerestory', 'glass', 0, 0, clear + .25, w - 2.4, d - 2.4, .1);
    }
    for (let x = -w / 2 + 1; x < w / 2; x += 1) box(`soffit-rib-${x}`, 'brass', x, 0, clear - .06, .04, d, .06, false, true);
    sockets.push({ id: 'gathering', role: 'activity', position: [0, 0, 0], width: w - 1, clearHeight: clear });
  } else if (kind === 'bench') {
    box('seat', 'timber', 0, 0, .4, 2.4, .6, .08, true);
    box('back', 'timber', 0, .275, .48, 2.4, .1, .42, true);
    for (const x of [-.85, .85]) {
      box(`leg-${x}`, 'brass', x, 0, 0, .12, .5, .4, true);
      box(`arm-${x}`, 'brass', x, 0, .6, .06, .6, .06, true);
    }
    sockets.push({ id: 'seat', role: 'seat', position: [0, -.03, .48], width: 2.4, clearHeight: 2 });
  } else if (kind === 'planter') {
    box('vessel', 'stone', 0, 0, 0, 2, 1, .5, true);
    box('soil', 'soil', 0, 0, .5, 1.8, .8, .025);
    for (const [i, x] of [-.6, 0, .6].entries()) {
      cylinder(`shrub-${x}`, 'leaf', x, 0, .52, .65, .65);
      parts.at(-1).species = ['agave', 'coleus', 'pentas'][i];
    }
    for (const x of [-.8, -.4, 0, .4, .8]) box(`rim-${x}`, 'ivory', x, -.48, .42, .38, .08, .08, false, true);
  } else if (kind === 'lamp') {
    cylinder('foot', 'brass', 0, 0, 0, .3, .12, true);
    cylinder('stem', 'teal', 0, 0, .12, .12, 3.8, true);
    cylinder('disc', 'brass', 0, 0, 3.9, 1.2, .12);
    cylinder('diffuser', 'light', 0, 0, 3.84, 1, .07);
    cylinder('cap', 'ivory', 0, 0, 4.02, .55, .18);
  }
  return { parts, sockets };
}

function ringFor(part) {
  const a = part.rotation * Math.PI / 180, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  const ring = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => [
    part.position[0] + x * part.size[0] * c - y * part.size[1] * s,
    part.position[1] + x * part.size[0] * s + y * part.size[1] * c,
  ]);
  return [...ring, [...ring[0]]];
}

export function compileStreetscape(input) {
  if (!record(input) || !validId(input.id) || Object.keys(input).some(key => !['id', 'placements'].includes(key)) || !Array.isArray(input.placements)) fail('plan identity or placements');
  if (!input.placements.length || input.placements.length > 256) fail('placement budget must be 1–256');
  const ids = new Set();
  for (const item of input.placements) {
    if (!record(item) || Object.keys(item).some(key => !['id', 'module', 'position', 'rotation', 'palette'].includes(key))
      || !validId(item.id) || !Object.hasOwn(STREETSCAPE_MODULES, item.module)
      || !Array.isArray(item.position) || item.position.length !== 3 || !Array.from(item.position).every(value => Number.isFinite(value) && Math.abs(value) <= 10000)
      || ![0, 90, 180, 270].includes(item.rotation) || item.palette !== undefined && !PALETTES.has(item.palette)) fail('placement properties');
    if (ids.has(item.id)) fail(`duplicate placement ${item.id}`);
    ids.add(item.id);
  }
  const parts = [], sockets = [], collisionRings = [], flightVolumes = [], supportSurfaces = [], bounds = [Infinity, Infinity, Infinity, -Infinity, -Infinity, -Infinity];
  for (const item of [...input.placements].sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0)) {
    const local = moduleParts(item.module), prefix = `${input.id}/${item.id}`;
    for (const source of local.parts) {
      const part = { ...source, id: `${prefix}/${source.id}`, position: transform(source.position, item), rotation: item.rotation, palette: item.palette ?? 'market' };
      parts.push(part);
      const ring = ringFor(part), bottom = part.position[2] - part.size[2] / 2, top = part.position[2] + part.size[2] / 2;
      for (const [x, y] of ring) { bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], y); bounds[3] = Math.max(bounds[3], x); bounds[4] = Math.max(bounds[4], y); }
      bounds[2] = Math.min(bounds[2], bottom); bounds[5] = Math.max(bounds[5], top);
      if (part.collidable) collisionRings.push(ring);
      if (part.support) supportSurfaces.push({ id: part.id, ring, height: top });
      // Flight solids are conservative boxes even for cylindrical fixtures.
      if (part.collidable || !part.detail && !['leaf', 'soil', 'light', 'glass'].includes(part.material)) flightVolumes.push({ id: part.id, ring, bottom, top });
    }
    for (const socket of local.sockets) sockets.push({ ...socket, id: `${prefix}/${socket.id}`, position: transform(socket.position, item), rotation: item.rotation });
  }
  return { id: input.id, parts, collisionRings, flightVolumes, supportSurfaces, sockets, bounds };
}

/** Tops of declared walking slabs only; roofs and decoration never become ground. */
export function streetscapeGroundAt(plan, east, north) {
  if (!Number.isFinite(east) || !Number.isFinite(north)) return null;
  let height = null;
  for (const surface of plan.supportSurfaces) {
    const inside = surface.ring.slice(1).every(([bx, by], i) => {
      const [ax, ay] = surface.ring[i];
      return (bx - ax) * (north - ay) - (by - ay) * (east - ax) >= -1e-9;
    });
    if (inside && (height === null || surface.height > height)) height = surface.height;
  }
  return height;
}
