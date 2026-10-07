// Places: the named spots of a world, the player's own landmarks, and the
// links that take someone straight to either. Positions are world [x, north]
// metres, the same frame the server and the community data use.
export const LANDMARK_LIMIT = 50;
// The catalog has the original district and up to 16 published worlds; a local
// fixture can configure one additional world without publishing it.
export const ACCOUNT_LANDMARK_LIST_LIMIT = LANDMARK_LIMIT * 18;
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

// Shared-play bookmarks are private account data. The server records the
// authoritative player pose; the browser only submits a name.
export function createAccountLandmarks({ request, worldId = 'river-oaks' }) {
  let items = [], loading = null;
  const normalize = item => item && { ...item, worldId: item.worldId ?? worldId };
  const valid = item => item && textId(item.id) && typeof item.name === 'string' && cleanName(item.name)
    && finitePair(item.position) && Number.isFinite(item.yaw) && Number.isFinite(item.createdAt)
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(item.worldId) && item.worldId.length <= 48;
  const list = () => items.map(item => ({ ...item, position: [...item.position], kind: 'landmark' }));
  return {
    list,
    async load() {
      loading ??= request('list').then(response => {
        if (!Array.isArray(response?.landmarks) || response.landmarks.length > ACCOUNT_LANDMARK_LIST_LIMIT) throw new Error('Account landmarks could not be read.');
        const next = response.landmarks.map(normalize);
        if (!next.every(valid)) throw new Error('Account landmarks could not be read.');
        items = next.map(item => ({ ...item, position: [...item.position] }));
        return list();
      });
      const pending = loading;
      try { return await pending; }
      finally { if (loading === pending) loading = null; }
    },
    async add({ name }) {
      if (loading) await loading;
      const response = await request('add', { name });
      const landmark = normalize(response?.landmark);
      if (!response?.ok || !valid(landmark)) throw new Error('Landmark could not be saved.');
      items = [...items.filter(item => item.id !== landmark.id), landmark];
      return { ok: true, landmark: { ...landmark, kind: 'landmark' } };
    },
    async remove(id, targetWorldId = worldId) {
      if (loading) await loading;
      const response = await request('remove', { id, worldId: targetWorldId });
      if (response?.removed) items = items.filter(item => item.id !== id || item.worldId !== targetWorldId);
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
