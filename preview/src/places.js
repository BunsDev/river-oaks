// Places: the named spots of a world, the player's own landmarks, and the
// links that take someone straight to either. Positions are world [x, north]
// metres, the same frame the server and the community data use.
export const LANDMARK_KEY = 'river-oaks-landmarks';
export const LANDMARK_LIMIT = 50;
const NAME_LIMIT = 40;

const finitePair = value => Array.isArray(value) && value.length >= 2 && Number.isFinite(value[0]) && Number.isFinite(value[1]);
const textId = value => typeof value === 'string' && /^[\w.:-]{1,80}$/.test(value);
export const cleanName = value => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, NAME_LIMIT);

// Every named place in a world: the arrival point, the community spots
// (cafés, plazas) and the storefronts. Stores keep their own directory for
// walking in; here they are destinations like any other.
export function placesOf(world) {
  const places = [];
  // Spots and stores both carry OpenStreetMap ids and in the shipped district
  // every spot is a store's own frontage, so one data id yields one place: the
  // spot wins (it is the outdoor meeting point). Ids are namespaced by kind
  // and `ref` is the data id the server knows.
  const seen = new Set();
  const push = place => { if (!seen.has(place.ref)) { seen.add(place.ref); places.push(place); } };
  if (finitePair(world?.walkSpawn)) push({ id: 'arrival', ref: 'arrival', name: 'Arrival', kind: 'arrival', position: [world.walkSpawn[0], world.walkSpawn[1]] });
  for (const spot of world?.communityLocations ?? []) {
    if (textId(spot.id) && finitePair(spot.position) && cleanName(spot.name)) push({ id: `spot:${spot.id}`, ref: spot.id, name: cleanName(spot.name), kind: 'spot', position: [spot.position[0], spot.position[1]] });
  }
  for (const store of world?.stores ?? []) {
    const position = finitePair(store.visit) ? store.visit : store.position;
    if (textId(store.id) && finitePair(position) && cleanName(store.name)) push({ id: `shop:${store.id}`, ref: store.id, name: cleanName(store.name), kind: 'shop', position: [position[0], position[1]] });
  }
  return places;
}

export const distanceBetween = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);

// The closest place within reach, for "you're near …" labels.
export function nearestPlace(places, position, within = 60) {
  if (!finitePair(position)) return null;
  let best = null;
  for (const place of places) {
    const distance = distanceBetween(place.position, position);
    if (distance <= within && (!best || distance < best.distance)) best = { place, distance };
  }
  return best;
}

// Links: ?place=<id> for a named place, ?at=x,north[,yaw] for anywhere.
function destinationLink(base,key,value) {
  if(!base)return `?${key}=${key==='place'?encodeURIComponent(value):value}`;
  const url=new URL(base);
  url.searchParams.delete(key==='place'?'at':'place');
  url.searchParams.set(key,value);
  return url.href;
}
export function placeLink(place, base = '') {
  return destinationLink(base,'place',place.id);
}
export function positionLink(position, yaw = 0, base = '') {
  return destinationLink(base,'at',`${position[0].toFixed(2)},${position[1].toFixed(2)},${(Number.isFinite(yaw) ? yaw : 0).toFixed(2)}`);
}
export function destinationFromSearch(search, places, bounds = null) {
  const params = new URLSearchParams(search ?? '');
  const id = params.get('place');
  if (id) return places.find(place => place.id === id) ?? null;
  const at = params.get('at');
  if (at) {
    const parts = at.split(',').map(Number);
    if (parts.length >= 2 && parts.slice(0, 3).every(Number.isFinite) && (!bounds || withinBounds(parts, bounds))) {
      return { id: 'link', name: 'Shared spot', kind: 'link', position: [parts[0], parts[1]], yaw: parts.length > 2 ? parts[2] : 0 };
    }
  }
  return null;
}
export function withinBounds(position, bounds) {
  return finitePair(position) && Array.isArray(bounds) && bounds.length === 4
    && position[0] >= bounds[0] && position[0] <= bounds[2] && position[1] >= bounds[1] && position[1] <= bounds[3];
}

// Landmarks are the player's own bookmarks: a name, a position and the way
// they were facing. Solo play keeps these in browser storage; shared play
// uses createAccountLandmarks below.
export function createLandmarks({ storage = null, now = () => Date.now(), random = Math.random } = {}) {
  let items = read();
  function read() {
    try {
      const parsed = JSON.parse(storage?.getItem(LANDMARK_KEY) ?? '[]');
      return Array.isArray(parsed) ? parsed.filter(item => item && textId(item.id) && cleanName(item.name) && finitePair(item.position)).map(item => ({
        id: item.id, name: cleanName(item.name), position: [item.position[0], item.position[1]], yaw: Number.isFinite(item.yaw) ? item.yaw : 0, createdAt: Number.isFinite(item.createdAt) ? item.createdAt : 0,
      })).slice(0, LANDMARK_LIMIT) : [];
    } catch { return []; }
  }
  function write() { try { storage?.setItem(LANDMARK_KEY, JSON.stringify(items)); } catch { /* storage unavailable: the list still works for this session */ } }
  return {
    list() { return items.map(item => ({ ...item, position: [...item.position], kind: 'landmark' })); },
    add({ name, position, yaw = 0 }) {
      const clean = cleanName(name);
      if (!clean) return { ok: false, reason: 'name' };
      if (!finitePair(position)) return { ok: false, reason: 'position' };
      if (items.length >= LANDMARK_LIMIT) return { ok: false, reason: 'limit' };
      const item = { id: `lm-${now().toString(36)}-${Math.floor(random() * 1e6).toString(36)}`, name: clean, position: [position[0], position[1]], yaw: Number.isFinite(yaw) ? yaw : 0, createdAt: now() };
      items = [...items, item]; write();
      return { ok: true, landmark: { ...item, kind: 'landmark' } };
    },
    remove(id) { const before = items.length; items = items.filter(item => item.id !== id); if (items.length !== before) write(); return items.length !== before; },
    rename(id, name) { const clean = cleanName(name), item = items.find(item => item.id === id); if (!item || !clean) return false; item.name = clean; write(); return true; },
  };
}

// Shared-play bookmarks are private account data. The server records the
// authoritative player pose; the browser only submits a name.
export function createAccountLandmarks({ request }) {
  let items = [], loading = null;
  const valid = item => item && textId(item.id) && typeof item.name === 'string' && cleanName(item.name)
    && finitePair(item.position) && Number.isFinite(item.yaw) && Number.isFinite(item.createdAt);
  const list = () => items.map(item => ({ ...item, position: [...item.position], kind: 'landmark' }));
  return {
    list,
    async load() {
      loading ??= request('list').then(response => {
        if (!Array.isArray(response?.landmarks) || response.landmarks.length > LANDMARK_LIMIT || !response.landmarks.every(valid)) throw new Error('Account landmarks could not be read.');
        items = response.landmarks.map(item => ({ ...item, position: [...item.position] }));
        return list();
      });
      const pending = loading;
      try { return await pending; }
      finally { if (loading === pending) loading = null; }
    },
    async add({ name }) {
      if (loading) await loading;
      const response = await request('add', { name });
      if (!response?.ok || !valid(response.landmark)) throw new Error('Landmark could not be saved.');
      items = [...items.filter(item => item.id !== response.landmark.id), response.landmark];
      return { ok: true, landmark: { ...response.landmark, kind: 'landmark' } };
    },
    async remove(id) {
      if (loading) await loading;
      const response = await request('remove', { id });
      if (response?.removed) items = items.filter(item => item.id !== id);
      return response?.removed === true;
    },
  };
}

// A clear outdoor spot at or near a position: the spot itself, else a ring
// search out to `reach` metres. `isOpen(x, north)` is the world's own test.
export function openSpotNear(isOpen, position, reach = 1.2) {
  if (!finitePair(position)) return null;
  if (isOpen(position[0], position[1])) return [position[0], position[1]];
  for (let radius = 0.4; radius <= reach + 1e-9; radius += 0.4) {
    for (let i = 0; i < 24; i++) {
      const angle = i / 24 * Math.PI * 2, x = position[0] + Math.cos(angle) * radius, north = position[1] + Math.sin(angle) * radius;
      if (isOpen(x, north)) return [x, north];
    }
  }
  return null;
}
