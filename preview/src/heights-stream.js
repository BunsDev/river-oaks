import { Box3, Frustum, Group, Matrix4, Vector3 } from 'three';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { locationWorldBounds } from './world-manifest.js';
import { validateHeightsRegistration } from './bayou-heights-world.js';
import { commonsBaseLayout } from '../../shared/bayou-heights.js';
import { createSpatialChunkStream } from './spatial-chunk-stream.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';

// Loaded only for bayou-heights-1 (main.js), with the composition it needs.
export { attachBayouHeights } from './bayou-heights-world.js';

/**
 * The Commons as Heights presents it: the restored Commons layout, bayou opened for the
 * footbridge. Its planted beds draw within 60 m, as Heights' own do (HEIGHTS_PLANTING_METRES):
 * seen across the bayou, the Commons' beds at every distance are about a million triangles.
 */
export const heightsCommonsLayout = layout => ({ ...commonsBaseLayout(layout), destination: layout.destination,
  plantingMetres: KIT_CONVENTIONS.lod.treeMetres[1] });

// A camera within this distance of a Heights neighborhood that can see it streams it in:
// from the Commons and the footbridge, looking over the bayou. From the District it stays
// unloaded, so the District keeps its own frame budget.
export const HEIGHTS_VIEW_METRES = 150;
// A neighborhood keeps that place for a while after the camera turns from it, so the small
// turns of walking do not rebuild a neighborhood each time it crosses the edge of the view.
export const HEIGHTS_VIEW_HOLD_MS = 5000;
// More of Heights can be in view than the ceiling holds. Those nearer the centre of the view
// rank first: each radian off the view axis counts as this many metres, at most about 31 m,
// inside the 85 m prefetch distance.
export const HEIGHTS_VIEW_ANGLE_METRES = 10;
const MiB = 1024 * 1024;
// The Commons' retained-geometry ceiling (commons-stream.js), unchanged for Heights. Heights
// holds more than this in all, so deep inside it the neighborhoods the camera cannot see stream out.
export const HEIGHTS_MAX_BYTES = 16 * MiB;
// Geometry each chunk owns, rounded up from measurement (docs/level-design/expansion/bayou-heights.md).
// An estimate below the real size would admit a chunk the ceiling then refuses, so these err high.
export const HEIGHTS_CHUNK_BYTES = {
  'bayou-heights': 6.5 * MiB, 'bayou-greenway': 3 * MiB, 'yale-icehouse': 3.3 * MiB, 'nineteenth-and-yale': 3.45 * MiB,
  'yale-street-north': 3.35 * MiB, 'yale-street-south': 2.05 * MiB, 'heights-boulevard-north': 2.95 * MiB, 'heights-boulevard-south': 2.05 * MiB,
};
const outside = ([w, s, e, n], [x, y]) => Math.hypot(Math.max(w - x, 0, x - e), Math.max(s - y, 0, y - n));

function geometryBytes(group) {
  const buffers = new Set();
  group.traverse(item => {
    if (!item.geometry) return;
    for (const attribute of [...Object.values(item.geometry.attributes), ...Object.values(item.geometry.morphAttributes).flat(), item.geometry.index, item.instanceMatrix, item.instanceColor].filter(Boolean)) buffers.add(attribute.array.buffer);
  });
  return [...buffers].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
}

/**
 * Streams Bayou Heights' presentation like the Commons (commons-stream.js), in parts: the
 * landmarks, trees and planting the neighborhoods share, and each neighborhood. The scene
 * passed to onScene holds whichever are attached.
 */
export function createHeightsStream({ world, parent, onStatus = () => {}, onScene = () => {}, now = () => performance.now(),
  loadModule = () => import('./bayou-heights.js') }) {
  const layout = validateHeightsRegistration(manifest, world.eastGardenCommons), { plans } = layout.heights;
  const location = manifest.locations.find(item => item.id === layout.heights.id);
  const bounds = locationWorldBounds(location), [west, south, east, north] = bounds;
  const entry = [west + 1, location.entries.find(item => item.id === 'market-footbridge').position_m[1]];
  // The location's id sorts before its neighborhoods', so at equal distance the shared part is kept first.
  const SHARED = location.id, idOf = plan => `${location.id}/${plan.id}`;
  const planAt = point => plans.reduce((best, plan) => outside(plan.site, point) < outside(best.site, point) ? plan : best);
  const chunks = [{ id: SHARED, bounds, estimatedBytes: HEIGHTS_CHUNK_BYTES[SHARED] },
    ...plans.map(plan => ({ id: idOf(plan), plan, bounds: plan.site, estimatedBytes: HEIGHTS_CHUNK_BYTES[plan.id] ?? 3 * MiB }))];
  const boxes = plans.map(plan => { const [w, s, e, n] = plan.site; return [plan, new Box3(new Vector3(w, layout.ground - 4, -n), new Vector3(e, layout.ground + 30, -s))]; });
  const frustum = new Frustum(), viewMatrix = new Matrix4(), forward = new Vector3(), measured = {}, seen = new Map();
  const scene = new Group(), neighborhoods = new Map(), drawn = new Set();
  let shared = null, status = '';
  scene.name = 'Bayou Heights'; scene.userData.shadowProxies = [];
  scene.userData.update = position => {
    for (const kit of neighborhoods.values()) kit.userData.update(position);
    shared?.userData.update(position, drawn);
    scene.userData.shadowProxies.length = 0;
    if (shared) scene.userData.shadowProxies.push(...shared.userData.shadowProxies);
  };
  scene.userData.stats = () => {
    const parts = [shared, ...neighborhoods.values()].filter(Boolean).map(part => part.userData.stats());
    return { meshes: parts.reduce((n, part) => n + part.meshes, 0), triangles: parts.reduce((n, part) => n + part.triangles, 0),
      neighborhoods: neighborhoods.size, landscape: Boolean(shared) };
  };
  parent.add(scene); onScene(scene);
  const announce = text => { if (text !== status) { status = text; onStatus(text); } };
  const stream = createSpatialChunkStream({
    chunks, maxResident: chunks.length, maxConcurrent: 1, maxBytes: HEIGHTS_MAX_BYTES,
    prefetchDistance: 85, unloadDistance: 110, now,
    async load(chunk, signal) {
      const module = await loadModule();
      // Imports cannot be aborted, but a stale import must never allocate a scene.
      if (signal.aborted) throw new Error('Cancelled Heights load');
      const group = chunk.plan ? module.buildHeightsNeighborhood(layout, chunk.plan) : module.buildHeightsLandscape(layout);
      let disposed = false;
      const dispose = () => { if (!disposed) { disposed = true; group.userData.dispose(); } };
      signal.addEventListener('abort', dispose, { once: true });
      try {
        await group.userData.ready;
        if (signal.aborted) throw new Error('Cancelled Heights landscape load');
        return { group, bytes: geometryBytes(group), dispose };
      } catch (error) { dispose(); throw error; }
      finally { signal.removeEventListener('abort', dispose); }
    },
    attach(chunk, { group, bytes }) {
      scene.add(group); measured[chunk.id] = bytes;
      if (chunk.plan) { neighborhoods.set(chunk.plan.id, group); drawn.add(chunk.plan.id); } else shared = group;
    },
    detach(chunk, { group }) {
      group.removeFromParent();
      if (chunk.plan) { neighborhoods.delete(chunk.plan.id); drawn.delete(chunk.plan.id); } else shared = null;
    },
  });
  const presented = point => stream.ready(SHARED) && stream.ready(idOf(planAt(point)));
  const state = id => stream.debug().chunks.find(chunk => chunk.id === id).state;
  return {
    update(points, camera) {
      const wanted = [...points];
      if (camera) {
        camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        const eye = [camera.position.x, -camera.position.z], time = now();
        camera.getWorldDirection(forward);
        const heading = Math.atan2(-forward.z, forward.x);
        for (const [plan, box] of boxes) {
          const [w, s, e, n] = plan.site, edge = [Math.min(Math.max(eye[0], w), e), Math.min(Math.max(eye[1], s), n)];
          const distance = Math.hypot(eye[0] - edge[0], eye[1] - edge[1]);
          if (distance >= HEIGHTS_VIEW_METRES) continue;
          if (frustum.intersectsBox(box)) {
            // How far the neighborhood's centre sits from the view axis, kept while it is held.
            const off = Math.atan2((s + n) / 2 - eye[1], (w + e) / 2 - eye[0]) - heading;
            seen.set(plan.id, { time, angle: Math.abs(Math.atan2(Math.sin(off), Math.cos(off))) });
          }
          const view = seen.get(plan.id);
          if (!(time - (view?.time ?? -Infinity) < HEIGHTS_VIEW_HOLD_MS)) continue;
          // A visible neighborhood streams as if someone stood just short of it, so the one a
          // player stands in keeps its place under the ceiling: half a metre when it is already
          // here, a metre when not, so a glance does not evict one in view for another. Past
          // that, the centre of the view ranks first.
          const reach = (stream.ready(idOf(plan)) ? .5 : 1) + view.angle * HEIGHTS_VIEW_ANGLE_METRES;
          const step = Math.min(reach, distance) / (distance || 1);
          wanted.push([edge[0] + (eye[0] - edge[0]) * step, edge[1] + (eye[1] - edge[1]) * step]);
        }
      }
      stream.update(wanted);
      const player = points[0];
      const inside = player && player[0] > west - .35 && player[0] <= east && player[1] >= south && player[1] <= north;
      const atBridge = player && Math.abs(player[0] - west) < 30 && Math.abs(player[1] - entry[1]) < 15;
      const at = inside ? player : atBridge ? entry : null;
      // What the player waits on: the shared part, where they stand, and any neighborhood within reach.
      const ids = at ? [SHARED, idOf(planAt(at)), ...plans.filter(plan => outside(plan.site, at) < 3).map(idOf)] : [];
      if (ids.some(id => state(id) === 'stalled')) announce('Bayou Heights loading has stalled. You can return west to the Commons while the connection recovers.');
      else if (ids.some(id => state(id) === 'failed')) announce('Bayou Heights is still loading. Retrying automatically; you can return to the Commons.');
      else if (at && !presented(at)) announce(inside ? 'Loading Bayou Heights… You can return west while it loads.' : 'Loading Bayou Heights… Please wait at the footbridge.');
      else if (ids.some(id => !stream.ready(id))) announce('Loading more of Bayou Heights…');
      else announce('');
    },
    /** Whether the footbridge into Heights is presented. */
    ready: () => presented(entry),
    allowsStep(from, to) {
      if (!to?.slice(0, 2).every(Number.isFinite)) return false;
      if (to[0] <= west - .35 || presented(to)) return true;
      // As in the Commons: someone restored where Heights is not yet presented may step around
      // an obstacle or retreat west; from presented ground, the next neighborhood waits to load.
      return Boolean(from) && from[0] > west - .35 && !presented(from) && to[0] <= from[0] + 1e-9;
    },
    debug: () => ({ ...stream.debug(), status, geometryBudgetBytes: HEIGHTS_MAX_BYTES, measuredBytes: { ...measured },
      estimatedBytes: Object.fromEntries(chunks.map(chunk => [chunk.id, chunk.estimatedBytes])) }),
    dispose() { stream.dispose(); scene.removeFromParent(); onScene(null); announce(''); },
  };
}
