// Pure builders for the debug overlays. Everything here returns plain arrays
// in scene space (x = east, y = up, z = -north) so it can be tested without
// WebGL; debug-tools.js turns them into Three.js lines, points and meshes.

// Mapped rings arrive as [east, north]; the walking model stores [x, z].
export const ringToScene = ring => ring.map(([east, north]) => [east, -north]);

// A collider drawn as a fence: base and top outlines plus corner posts, so a
// wall that floats, sinks or misses its building is visible from any angle.
export function colliderSegments(rings, groundAt, height = 3) {
  const out = [];
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    if (ax === bx && az === bz) continue;
    const ay = groundAt(ax, az), by = groundAt(bx, bz);
    out.push(ax, ay + 0.05, az, bx, by + 0.05, bz);
    out.push(ax, ay + height, az, bx, by + height, bz);
    out.push(ax, ay + 0.05, az, ax, ay + height, az);
  }
  return out;
}

// Translucent wall quads (two triangles per edge) for the same fence.
export function colliderWalls(rings, groundAt, height = 3) {
  const out = [];
  for (const ring of rings) for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    if (ax === bx && az === bz) continue;
    const ay = groundAt(ax, az), by = groundAt(bx, bz);
    out.push(ax, ay, az, bx, by, bz, bx, by + height, bz, ax, ay, az, bx, by + height, bz, ax, ay + height, az);
  }
  return out;
}

// Closed outline of a scene-space ring at a height given per point.
export function ringSegments(ring, heightAt) {
  const out = [];
  for (let i = 0; i < ring.length; i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[(i + 1) % ring.length];
    out.push(ax, heightAt(ax, az), az, bx, heightAt(bx, bz), bz);
  }
  return out;
}

// Sample the walking model on a grid centred on (cx, cz). Green points can be
// stood on; red points are blocked. This is the collision truth the game uses.
export const FREE_COLOR = [0.25, 0.9, 0.4], BLOCKED_COLOR = [1, 0.25, 0.2];
export function walkableSamples(environment, cx, cz, radius = 24, step = 0.5) {
  const positions = [], colors = [];
  let free = 0, blocked = 0;
  const x0 = Math.round((cx - radius) / step) * step, z0 = Math.round((cz - radius) / step) * step;
  for (let x = x0; x <= cx + radius; x += step) for (let z = z0; z <= cz + radius; z += step) {
    const open = environment.isFree(x, z);
    positions.push(x, environment.groundAt(x, z) + 0.04, z);
    colors.push(...(open ? FREE_COLOR : BLOCKED_COLOR));
    if (open) free++; else blocked++;
  }
  return { positions, colors, free, blocked };
}

// Road centrelines and the two edges at half the mapped width.
export function roadSegments(roads, heightAt) {
  const centre = [], edges = [];
  for (const road of roads) for (let i = 1; i < road.points.length; i++) {
    const [ae, an] = road.points[i - 1], [be, bn] = road.points[i];
    const ax = ae, az = -an, bx = be, bz = -bn, length = Math.hypot(bx - ax, bz - az);
    if (!length) continue;
    const half = (road.width_m ?? 0) / 2, ox = -(bz - az) / length * half, oz = (bx - ax) / length * half;
    centre.push(ax, heightAt(ax, az), az, bx, heightAt(bx, bz), bz);
    for (const side of [1, -1]) edges.push(ax + ox * side, heightAt(ax + ox * side, az + oz * side), az + oz * side, bx + ox * side, heightAt(bx + ox * side, bz + oz * side), bz + oz * side);
  }
  return { centre, edges };
}

// Each storefront: a post at the mapped door, an arrow along its outward
// normal and a short post at the visit point people are sent to.
export function storeMarkers(stores, heightAt) {
  const out = [];
  for (const store of stores) {
    const [fe, fn] = store.facade, x = fe, z = -fn, y = heightAt(x, z);
    out.push(x, y, z, x, y + 3, z);
    const [ne, nn] = store.outward ?? [0, 0], tx = x + ne * 2, tz = z - nn * 2;
    out.push(x, y + 0.3, z, tx, y + 0.3, tz);
    if (store.visit) { const vx = store.visit[0], vz = -store.visit[1], vy = heightAt(vx, vz); out.push(vx, vy, vz, vx, vy + 1.2, vz); }
  }
  return out;
}

// Flight clearance: the roof outline the bubble may not pass below, at the
// same height the walking model computes (building top plus 3.1 m).
export function roofRings(world, terrainAt) {
  return (world.buildings ?? []).filter(building => building.ring?.length).map(building => ({
    ring: ringToScene(building.ring),
    top: (building.center?.[2] ?? terrainAt(building.center[0], -building.center[1])) + building.size[2] + 3.1,
  }));
}

// Room footprints and their blocking fixtures as scene-space rings at floor height.
export function roomRings(rooms) {
  const out = [];
  for (const room of rooms) {
    if (room.footprint) out.push({ kind: 'room', ring: ringToScene(room.footprint), y: room.floor + 0.03 });
    for (const o of room.obstacles ?? []) out.push({ kind: 'obstacle', ring: ringToScene([[o.a0, o.d0], [o.a1, o.d0], [o.a1, o.d1], [o.a0, o.d1]].map(([a, d]) => room.toWorld(a, d))), y: room.floor + 0.05 });
  }
  return out;
}

export function triangleCount(geometry) {
  if (!geometry) return 0;
  const count = geometry.index ? geometry.index.count : geometry.attributes.position?.count ?? 0;
  const range = geometry.drawRange?.count;
  return Math.floor((Number.isFinite(range) ? Math.min(count, range) : count) / 3);
}

// Name an object by its path of named ancestors so a hit can be traced back to
// the builder that made it ("Roads and walkways › Mesh").
export function objectPath(object) {
  const names = [];
  for (let node = object; node; node = node.parent) if (node.name) names.unshift(node.name);
  return names.join(' › ') || object.type;
}

export function describeObject(object, instanceId = null) {
  const geometry = object.geometry, materials = [object.material].flat().filter(Boolean);
  const instances = object.isInstancedMesh ? object.count : 1, triangles = triangleCount(geometry);
  return {
    name: object.name || '(unnamed)', path: objectPath(object), type: object.type, instanceId,
    triangles, vertices: geometry?.attributes.position?.count ?? 0, instances, drawnTriangles: triangles * instances,
    materials: materials.map(m => m.name || m.type), skinned: Boolean(object.isSkinnedMesh),
  };
}

// The heaviest visible meshes, for "where did the triangles go?".
export function heaviestMeshes(root, limit = 12, isVisible = () => true) {
  const rows = [];
  root.traverse(object => {
    if (!object.isMesh || !isVisible(object)) return;
    rows.push(describeObject(object));
  });
  return rows.sort((a, b) => b.drawnTriangles - a.drawnTriangles).slice(0, limit);
}
