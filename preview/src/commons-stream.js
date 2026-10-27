import { Box3, Frustum, Matrix4, Vector3 } from 'three';
import manifest from '../public/data/world-manifest.json' with { type: 'json' };
import { locationWorldBounds } from './world-manifest.js';
import { validateCommonsRegistration } from './east-garden-commons-world.js';
import { createSpatialChunkStream } from './spatial-chunk-stream.js';
import { COMMONS_NAME, MARKET_NAME } from './world-location-label.js';

// Counts owned buffer storage; no shared District resources enter this chunk.
function geometryBytes(group) {
  const buffers = new Set();
  group.traverse(item => {
    if (!item.geometry) return;
    for (const attribute of [...Object.values(item.geometry.attributes), ...Object.values(item.geometry.morphAttributes).flat(), item.geometry.index, item.instanceMatrix, item.instanceColor].filter(Boolean)) buffers.add(attribute.array.buffer);
  });
  return [...buffers].reduce((bytes, buffer) => bytes + buffer.byteLength, 0);
}

export function createCommonsStream({ world, parent, onStatus = () => {}, onScene = () => {}, now = () => performance.now(),
  visibilityLingerMs = 15000, loadModule = () => import('./east-garden-commons.js') }) {
  const layout = validateCommonsRegistration(manifest, world.eastGardenCommons);
  const location = manifest.locations.find(item => item.id === layout.id);
  const [west, south, east, north] = locationWorldBounds(location);
  const gatewayNorth = location.entries.find(entry => entry.id === 'district-promenade').position_m[1];
  // The notices name what the HUD names: the Market once it is composed.
  const name = layout.destination ? MARKET_NAME : COMMONS_NAME;
  // Published Market includes a 30 m tower and landscape beyond its walkable
  // site. This conservative presentation envelope is separate from authority.
  const margin = layout.destination ? 45 : 0, height = layout.destination ? 40 : 5;
  const visualBounds = new Box3(new Vector3(west - margin, Math.min(...layout.edgeHeights) - 1, -north - margin), new Vector3(east + margin, layout.ground + height, -south + margin));
  const frustum = new Frustum(), viewMatrix = new Matrix4();
  let status = '', lastVisibleAt = -Infinity;
  const announce = text => { if (text !== status) { status = text; onStatus(text); } };
  const stream = createSpatialChunkStream({
    chunks: [{ id: location.id, bounds: locationWorldBounds(location), estimatedBytes: layout.destination ? 3 * 1024 * 1024 : 65536 }],
    maxResident: 1, maxConcurrent: 1, maxBytes: 16 * 1024 * 1024,
    prefetchDistance: 85, unloadDistance: 110, now,
    async load(_chunk, signal) {
      const { buildEastGardenCommons } = await loadModule();
      // Imports cannot be aborted, but a stale import must never allocate a scene.
      if (signal.aborted) throw new Error('Cancelled Commons load');
      const group = buildEastGardenCommons(layout);
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
      // It stays required for a while after leaving view: beyond the retention
      // radius a glance away and back would otherwise rebuild the whole Market
      // (megabytes of geometry and landscape) on every turn of the camera.
      const time = now();
      if (visible) lastVisibleAt = time;
      const inView = visible || time - lastVisibleAt < visibilityLingerMs;
      stream.update(inView ? [...points, [(west + east) / 2, (south + north) / 2]] : points);
      const chunk = stream.debug().chunks[0];
      const player = points[0];
      const atGateway = player && Math.abs(player[0] - layout.edge) < 30 && Math.abs(player[1] - gatewayNorth) < 15;
      const occupying = player && player[0] > layout.edge && player[0] <= east && player[1] >= south && player[1] <= north;
      if ((atGateway || occupying) && chunk.state === 'stalled') announce(`${name} loading has stalled. You can return west to the District while the connection recovers.`);
      else if ((atGateway || occupying) && chunk.state === 'failed') announce(`${name} is still loading. Retrying automatically; you can return to the District.`);
      else if ((atGateway || occupying) && !stream.ready(layout.id)) announce(occupying
        ? `Loading ${name}… You can return west while it loads.`
        : `Loading ${name}… Please wait at the promenade.`);
      else if (atGateway) announce(player[0] > layout.edge ? 'River Oaks District ← Follow the promenade west' : `${name} → Follow the promenade east`);
      else announce('');
    },
    ready: () => stream.ready(layout.id),
    allowsStep(from, to) {
      if (!to?.slice(0, 2).every(Number.isFinite)) return false;
      if (stream.ready(layout.id) || to[0] <= layout.edge - .35) return true;
      // A restored player may need to move sideways around a planter before
      // retreating west. Existing collision still applies; entry and further
      // eastward progress remain blocked until presentation is available.
      return from?.[0] > layout.edge - .35 && to[0] <= from[0] + 1e-9;
    },
    debug: () => ({ ...stream.debug(), status, geometryBudgetBytes: 16 * 1024 * 1024, visibilityLingerMs, lastVisibleAt, visualBounds: [visualBounds.min.toArray(), visualBounds.max.toArray()] }),
    dispose() { stream.dispose(); announce(''); },
  };
}
