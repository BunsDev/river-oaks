import { Box3, Frustum, Group, Matrix4, Vector3 } from 'three';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { locationWorldBounds } from './world-manifest.js';
import { validateHeightsRegistration } from './bayou-heights-world.js';
import { commonsBaseLayout } from '../../shared/bayou-heights.js';
import { heightsBaseLayout } from '../../shared/studewood.js';
import { validateStudewoodRegistration } from './studewood-world.js';
import { studewoodBaseLayout } from '../../shared/bayou-terraces.js';
import { validateTerracesRegistration } from './bayou-terraces-world.js';
import { terracesBaseLayout } from '../../shared/woodland-heights.js';
import { inWoodlandHeights } from '../../shared/woodland-heights-layout.js';
import { validateWoodlandRegistration } from './woodland-heights-world.js';
import { woodlandBaseLayout } from '../../shared/typesafe-place.js';
import { validateTypeSafeRegistration } from './typesafe-place-world.js';
import { createSpatialChunkStream } from './spatial-chunk-stream.js';
import { KIT_CONVENTIONS } from '../../shared/city-kit/catalog.js';
import { cityKitLandscape } from './city-kit/render.js';

// Loaded only for bayou-heights-1, heights-studewood-1, bayou-terraces-1, woodland-heights-1 and typesafe-place-1 (main.js), with the composition they need.
export { attachBayouHeights } from './bayou-heights-world.js';
export { attachStudewood } from './studewood-world.js';
export { attachBayouTerraces } from './bayou-terraces-world.js';
export { attachWoodlandHeights } from './woodland-heights-world.js';
export { attachTypeSafePlace } from './typesafe-place-world.js';

/**
 * The Commons as Heights presents it: the restored Commons layout, bayou opened for the
 * footbridge. Its planted beds draw within 60 m, as Heights' own do (HEIGHTS_PLANTING_METRES):
 * seen across the bayou, the Commons' beds at every distance are about a million triangles.
 */
const heightsOnly = layout => layout.typesafe ? heightsOnly(woodlandBaseLayout(layout)) : layout.woodland ? heightsOnly(terracesBaseLayout(layout)) : layout.terraces ? heightsOnly(studewoodBaseLayout(layout)) : layout.studewood ? heightsBaseLayout(layout) : layout;
export const heightsCommonsLayout = layout => ({ ...commonsBaseLayout(heightsOnly(layout)), destination: layout.destination,
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
  // Studewood (heights-studewood-1) in the luxury kit, measured headless at 2.84 and 2.43 MiB.
  'studewood-north': 3 * MiB, 'studewood-south': 2.6 * MiB,
  // The Bayou Terraces (bayou-terraces-1) in the luxury kit, measured headless at 2.76 and 2.01 MiB.
  'bayou-terrace-north': 2.9 * MiB, 'bayou-terrace-south': 2.15 * MiB,
  // Woodland Heights (woodland-heights-1) in the luxury kit, measured headless at 1.77 and 1.34 MiB.
  'woodland-heights-north': 1.9 * MiB, 'woodland-heights-south': 1.45 * MiB,
  // TypeSafe Place (typesafe-place-1), split at Place Avenue so each tower's half streams on its
  // own, measured headless at 2.12, 3.02, 2.54, 2.40 and 2.40 MiB.
  'typesafe-place-north': 2.25 * MiB, 'typesafe-place-penthouse': 3.25 * MiB, 'typesafe-place-uptown': 2.7 * MiB,
  'typesafe-place-green': 2.55 * MiB, 'typesafe-place-south': 2.6 * MiB,
};
// A kit finish that adds geometry overrides only the chunks it outgrows, so classic streaming is
// unchanged. Pink Jet-Age's rounded forms measure 2.32 MiB for TypeSafe Place north and 2.88 MiB
// for uptown (#742).
export const HEIGHTS_FINISH_CHUNK_BYTES = {
  'pink-jet-age': { 'typesafe-place-north': 2.35 * MiB, 'typesafe-place-uptown': 2.9 * MiB },
};
export const heightsChunkBytes = (id, finish = 'classic') => HEIGHTS_FINISH_CHUNK_BYTES[finish]?.[id] ?? HEIGHTS_CHUNK_BYTES[id];
// Each neighborhood composed after Heights' own adds its street trees and planted beds to the
// shared part. Allowances per placement err high, so the shared estimate grows with them.
export const HEIGHTS_SHARED_PLACEMENT_BYTES = { tree: 4 * 1024, planter: 10 * 1024 };
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
 * Bytes of the textures a chunk made and disposes itself, which render.js marks `userData.owned`:
 * each neighborhood's sign atlas, tower lettering and tree grate. Shared kit maps and the halo
 * stay out, as they survive eviction. Mipmaps add a third. Reported beside the geometry
 * ceiling, not yet enforced by it: the atlases alone can outweigh a neighborhood's geometry.
 */
export function ownedTextureBytes(group) {
  const textures = new Set();
  group.traverse(item => {
    for (const material of [item.material].flat().filter(Boolean)) for (const value of Object.values(material)) if (value?.isTexture && value.userData?.owned) textures.add(value);
  });
  return [...textures].reduce((bytes, texture) => {
    const { width = 0, height = 0 } = texture.image ?? {};
    return bytes + Math.round(width * height * 4 * (texture.generateMipmaps ? 4 / 3 : 1));
  }, 0);
}

/**
 * Streams Bayou Heights' presentation like the Commons (commons-stream.js), in parts: the
 * landmarks, trees and planting the neighborhoods share, and each neighborhood. The scene
 * passed to onScene holds whichever are attached. `finish` is the presentation-only kit
 * finish (render-quality.js readFinishPreference) every part is built with.
 */
export function createHeightsStream({ world, parent, onStatus = () => {}, onScene = () => {}, now = () => performance.now(),
  finish, loadModule = () => import('./bayou-heights.js') }) {
  const layout = validateHeightsRegistration(manifest, world.eastGardenCommons), { plans } = layout.heights;
  const location = manifest.locations.find(item => item.id === layout.heights.id);
  // Studewood (heights-studewood-1) streams as two more Heights neighborhoods, east to its own edge,
  // and Woodland Heights (woodland-heights-1) as two more, east to the edge beyond it.
  if (layout.studewood) validateStudewoodRegistration(manifest, layout);
  if (layout.woodland) validateWoodlandRegistration(manifest, layout);
  // TypeSafe Place (typesafe-place-1) streams as five more, east to its own edge.
  if (layout.typesafe) validateTypeSafeRegistration(manifest, layout);
  const own = locationWorldBounds(location), easternmost = layout.typesafe ?? layout.woodland ?? layout.studewood;
  const bounds = easternmost ? [own[0], own[1], easternmost.bounds[2], own[3]] : own, [west, south, east, north] = bounds;
  // The Bayou Terraces (bayou-terraces-1) stream as two more neighborhoods west of the bayou, gated like the rest.
  if (layout.terraces) validateTerracesRegistration(manifest, layout);
  const terraces = layout.terraces?.bounds ?? [], onTerrace = point => terraces.some(([w, s, e, n]) => point[0] >= w && point[0] <= e && point[1] >= s && point[1] <= n);
  const gated = point => point[0] > west - .35 || onTerrace(point);
  const sharedBounds = terraces.reduce((box, [w, s, e, n]) => [Math.min(box[0], w), Math.min(box[1], s), Math.max(box[2], e), Math.max(box[3], n)], bounds);
  const entry = [west + 1, location.entries.find(item => item.id === 'market-footbridge').position_m[1]];
  // The location's id sorts before its neighborhoods', so at equal distance the shared part is kept first.
  const SHARED = location.id, idOf = plan => `${location.id}/${plan.id}`;
  const planAt = point => plans.reduce((best, plan) => outside(plan.site, point) < outside(best.site, point) ? plan : best);
  // A terrace's own ground and its footbridge, out to where the greenway's plan is nearer: there the way back is east, over the bridge.
  const terracePlans = new Set(layout.terraces?.plans.map(plan => plan.id) ?? []), onTerracePlan = point => gated(point) && terracePlans.has(planAt(point).id);
  // With the terraces at the District edge, District points must not stream them: from the District, Heights stays unloaded.
  const inDistrict = point => Boolean(layout.terraces) && point[0] < layout.edge;
  // With everyone in the District nothing anchors Heights, and it all streams out: the scheduler
  // keeps a scene when given no valid point at all (an invalid position must not evict), so a
  // point beyond the retention distance of every chunk stands in for "no anchor".
  const away = [sharedBounds[0] - 1000, sharedBounds[1] - 1000];
  const inWoodland = point => inWoodlandHeights(layout, point[0]);
  const sharedBytes = plans.slice(layout.studewood?.planStart ?? plans.length).reduce((bytes, plan) => {
    const { trees, planters } = cityKitLandscape(plan, { groundAt: () => layout.ground, ground: layout.ground });
    return bytes + trees.length * HEIGHTS_SHARED_PLACEMENT_BYTES.tree + planters.length * HEIGHTS_SHARED_PLACEMENT_BYTES.planter;
  }, HEIGHTS_CHUNK_BYTES[SHARED]);
  const chunks = [{ id: SHARED, bounds: sharedBounds, estimatedBytes: sharedBytes },
    ...plans.map(plan => ({ id: idOf(plan), plan, bounds: plan.site, estimatedBytes: heightsChunkBytes(plan.id, finish) ?? 3 * MiB }))];
  // A neighborhood's view box reaches over its tallest building: TypeSafe Place's towers stand 71 m.
  const boxes = plans.map(plan => { const [w, s, e, n] = plan.site, tallest = Math.max(26, ...plan.pieces.filter(piece => piece.piece === 'building/shell').map(piece => piece.height));
    return [plan, new Box3(new Vector3(w, layout.ground - 4, -n), new Vector3(e, layout.ground + tallest + 4, -s))]; });
  const frustum = new Frustum(), viewMatrix = new Matrix4(), forward = new Vector3(), measured = {}, measuredTextures = {}, seen = new Map();
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
      const group = chunk.plan ? module.buildHeightsNeighborhood(layout, chunk.plan, { finish }) : module.buildHeightsLandscape(layout, { finish });
      let disposed = false;
      const dispose = () => { if (!disposed) { disposed = true; group.userData.dispose(); } };
      signal.addEventListener('abort', dispose, { once: true });
      try {
        await group.userData.ready;
        if (signal.aborted) throw new Error('Cancelled Heights landscape load');
        return { group, bytes: geometryBytes(group), textureBytes: ownedTextureBytes(group), dispose };
      } catch (error) { dispose(); throw error; }
      finally { signal.removeEventListener('abort', dispose); }
    },
    attach(chunk, { group, bytes, textureBytes }) {
      scene.add(group); measured[chunk.id] = bytes; measuredTextures[chunk.id] = textureBytes;
      if (chunk.plan) { neighborhoods.set(chunk.plan.id, group); drawn.add(chunk.plan.id); } else shared = group;
    },
    detach(chunk, { group }) {
      group.removeFromParent();
      if (chunk.plan) { neighborhoods.delete(chunk.plan.id); drawn.delete(chunk.plan.id); } else shared = null;
    },
  });
  const presented = point => stream.ready(SHARED) && stream.ready(idOf(planAt(point)));
  const state = id => stream.state(id);
  return {
    update(points, camera) {
      const wanted = points.filter(point => !inDistrict(point));
      if (camera && !inDistrict([camera.position.x, -camera.position.z])) {
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
      stream.update(wanted.length || !points.some(point => point?.slice(0, 2).every(Number.isFinite)) ? wanted : [away]);
      const player = points[0];
      const terrace = player && onTerracePlan(player), inside = player && (terrace || player[0] > west - .35 && player[0] <= east && player[1] >= south && player[1] <= north);
      const atBridge = player && Math.abs(player[0] - west) < 30 && Math.abs(player[1] - entry[1]) < 15;
      const at = inside ? player : atBridge ? entry : null;
      // What the player waits on: the shared part, where they stand, and any neighborhood within reach.
      const ids = at ? [SHARED, idOf(planAt(at)), ...plans.filter(plan => outside(plan.site, at) < 3).map(idOf)] : [];
      if (ids.some(id => state(id) === 'stalled')) announce(terrace ? 'Bayou Terraces loading has stalled. You can return over the footbridge while the connection recovers.' : 'Bayou Heights loading has stalled. You can return west to the Commons while the connection recovers.');
      else if (ids.some(id => state(id) === 'failed')) announce(terrace ? 'The Bayou Terraces are still loading. Retrying automatically; you can return over the footbridge.' : 'Bayou Heights is still loading. Retrying automatically; you can return to the Commons.');
      else if (at && !presented(at)) announce(terrace ? 'Loading the Bayou Terraces… You can return over the footbridge while they load.' : inside ? 'Loading Bayou Heights… You can return west while it loads.' : 'Loading Bayou Heights… Please wait at the footbridge.');
      else if (ids.some(id => !stream.ready(id))) announce('Loading more of Bayou Heights…');
      else announce('');
    },
    /** Whether the footbridge into Heights is presented. */
    ready: () => presented(entry),
    /** One chunk's lifecycle state (spatial-chunk-stream.js), by its id. */
    state: id => stream.state(id),
    allowsStep(from, to) {
      if (!to?.slice(0, 2).every(Number.isFinite)) return false;
      if (!gated(to) || presented(to)) return true;
      // As in the Commons: someone restored where Heights is not yet presented may step around
      // an obstacle or retreat west (on a terrace, back toward its footbridge); from presented
      // ground, the next neighborhood waits to load. Woodland's gardens open east onto its lane,
      // so a westward-only retreat would hold someone restored in one: on Woodland ground any
      // step within Woodland stays allowed, and the way out is west along a cross street.
      return Boolean(from) && gated(from) && !presented(from) && (onTerracePlan(from) ? to[0] >= from[0] - 1e-9
        : inWoodland(from) && inWoodland(to) || to[0] <= from[0] + 1e-9);
    },
    debug: () => {
      const inner = stream.debug();
      return { ...inner, status, geometryBudgetBytes: HEIGHTS_MAX_BYTES, measuredBytes: { ...measured },
        estimatedBytes: Object.fromEntries(chunks.map(chunk => [chunk.id, chunk.estimatedBytes])),
        // Owned textures of the chunks attached now, beside the geometry the ceiling counts.
        measuredTextureBytes: { ...measuredTextures },
        residentTextureBytes: inner.chunks.reduce((bytes, chunk) => bytes + (chunk.state === 'ready' ? measuredTextures[chunk.id] ?? 0 : 0), 0) };
    },
    dispose() { stream.dispose(); scene.removeFromParent(); onScene(null); announce(''); },
  };
}
