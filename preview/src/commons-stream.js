import { Box3, Frustum, Matrix4, Vector3 } from 'three';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { locationWorldBounds } from './world-manifest.js';
import { validateCommonsRegistration } from './east-garden-commons-world.js';
import { createSpatialChunkStream } from './spatial-chunk-stream.js';

// The composed destination's geometry, rounded up from measurement under every kit finish:
// 2.91 MiB classic and 3.10 MiB with Pink Jet-Age's rounded forms (#742).
export const COMMONS_DESTINATION_BYTES = 3.2 * 1024 * 1024;

// Counts owned buffer storage; no shared District resources enter this chunk.
function geometryBytes(group) {
  const buffers = new Set();
  group.traverse(item => {
    if (!item.geometry) return;
    for (const attribute of [...Object.values(item.geometry.attributes), ...Object.values(item.geometry.morphAttributes).flat(), item.geometry.index, item.instanceMatrix, item.instanceColor].filter(Boolean)) buffers.add(attribute.array.buffer);
  });
  return [...buffers].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
}

// `layout` is the Commons layout to present; Bayou Heights passes the restored Commons
// with its bayou opened for the footbridge (heights-stream.js). `finish` is the
// presentation-only kit finish (render-quality.js readFinishPreference).
export function createCommonsStream({ world, layout: presented = world.eastGardenCommons, parent, onStatus = () => {}, onScene = () => {}, now,
  finish, loadModule = () => import('./east-garden-commons.js') }) {
  const layout = validateCommonsRegistration(manifest, presented);
  const location = manifest.locations.find(item => item.id === layout.id);
  const [west, south, east, north] = locationWorldBounds(location);
  const gatewayNorth = location.entries.find(entry => entry.id === 'district-promenade').position_m[1];
  // Published Market includes a 30 m tower and landscape beyond its walkable
  // site. This conservative presentation envelope is separate from authority.
  const margin = layout.destination ? 45 : 0, height = layout.destination ? 40 : 5;
  const visualBounds = new Box3(new Vector3(west - margin, Math.min(...layout.edgeHeights) - 1, -north - margin), new Vector3(east + margin, layout.ground + height, -south + margin));
  const frustum = new Frustum(), viewMatrix = new Matrix4();
  let status = '';
  const announce = text => { if (text !== status) { status = text; onStatus(text); } };
  const stream = createSpatialChunkStream({
    chunks: [{ id: location.id, bounds: locationWorldBounds(location), estimatedBytes: layout.destination ? COMMONS_DESTINATION_BYTES : 65536 }],
    maxResident: 1, maxConcurrent: 1, maxBytes: 16 * 1024 * 1024,
    prefetchDistance: 85, unloadDistance: 110, now,
    async load(_chunk, signal) {
      const { buildEastGardenCommons } = await loadModule();
      // Imports cannot be aborted, but a stale import must never allocate a scene.
      if (signal.aborted) throw new Error('Cancelled Commons load');
      const group = buildEastGardenCommons(layout, { finish });
      let disposed = false;
      const dispose = () => { if (!disposed) { disposed = true; group.userData.dispose(); } };
      signal.addEventListener('abort', dispose, { once: true });
      try {
        // Include asynchronously populated landscape and instance buffers in
        // the bounded geometry allocation before the scene can become ready.
        await group.userData.ready;
        if (signal.aborted) throw new Error('Cancelled Commons landscape load');
        return { group, bytes: geometryBytes(group), dispose };
      } catch (error) { dispose(); throw error; }
      finally { signal.removeEventListener('abort', dispose); }
    },
    attach: (_chunk, resource) => { parent.add(resource.group); onScene(resource.group); },
    detach: (_chunk, resource) => { resource.group.removeFromParent(); onScene(null); },
  });
  return {
    update(points, camera) {
      let visible = false;
      if (camera) {
        camera.updateMatrixWorld();
        frustum.setFromProjectionMatrix(viewMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
        visible = frustum.intersectsBox(visualBounds);
      }
      // A visible destination is a required presentation chunk even beyond the
      // walking prefetch radius. The scheduler still enforces the same ceiling.
      stream.update(visible ? [...points, [(west + east) / 2, (south + north) / 2]] : points);
      const chunk = stream.debug().chunks[0];
      const player = points[0];
      const atGateway = player && Math.abs(player[0] - layout.edge) < 30 && Math.abs(player[1] - gatewayNorth) < 15;
      const occupying = player && player[0] > layout.edge && player[0] <= east && player[1] >= south && player[1] <= north;
      if ((atGateway || occupying) && chunk.state === 'stalled') announce('East Garden Commons loading has stalled. You can return west to the District while the connection recovers.');
      else if ((atGateway || occupying) && chunk.state === 'failed') announce('East Garden Commons is still loading. Retrying automatically; you can return to the District.');
      else if ((atGateway || occupying) && !stream.ready(layout.id)) announce(occupying
        ? 'Loading East Garden Commons… You can return west while it loads.'
        : 'Loading East Garden Commons… Please wait at the promenade.');
      else if (atGateway) announce(player[0] > layout.edge ? 'River Oaks District ← Follow the promenade west' : 'East Garden Commons → Follow the promenade east');
      else announce('');
    },
    ready: () => stream.ready(layout.id),
    allowsStep(from, to) {
      if (!to?.slice(0, 2).every(Number.isFinite)) return false;
      // Beyond the Commons (Bayou Heights, bayou-heights-1) that location's own stream gates presentation.
      // The Bayou Terraces (bayou-terraces-1) beside the Commons are gated by the Heights stream too.
      if (stream.ready(layout.id) || to[0] <= layout.edge - .35 || to[0] > east + .35 || to[1] < south - .35 || to[1] > north + .35) return true;
      // A restored player may need to move sideways around a planter before
      // retreating west. Existing collision still applies; entry and further
      // eastward progress remain blocked until presentation is available.
      return from?.[0] > layout.edge - .35 && to[0] <= from[0] + 1e-9;
    },
    debug: () => ({ ...stream.debug(), status, geometryBudgetBytes: 16 * 1024 * 1024, visualBounds: [visualBounds.min.toArray(), visualBounds.max.toArray()] }),
    dispose() { stream.dispose(); announce(''); },
  };
}
