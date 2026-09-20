import * as THREE from 'three';

// One nearby probe, two reusable targets, one cube face per animation frame.
// Static surroundings only: no frozen people or feedback from reflective panes.
export function createStorefrontReflections({ renderer, scene, materials, excluded, filter = new THREE.PMREMGenerator(renderer) }) {
  const targets = [0, 1].map(() => new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: false }));
  const filtered = [null, null];
  const cube = new THREE.CubeCamera(0.2, 650, targets[0]);
  cube.coordinateSystem = renderer.coordinateSystem; cube.updateCoordinateSystem();
  const lastPosition = new THREE.Vector3(Infinity, Infinity, Infinity);
  const previousMaps = materials.map(material => material.envMap);
  let active = -1, face = 0, captureVersion = 0, version = 1, publishedVersion = 0;
  let capturing = false, lastCapture = -Infinity, disposed = false;
  const stats = { captures: 0, resolution: 256, facesPerFrame: 1, failed: false };
  return {
    stats,
    invalidate() { version++; },
    update(now, position) {
      if (disposed || stats.failed) return;
      if (!capturing) {
        const moved = position.distanceToSquared(lastPosition) > 16 * 16;
        if (version === publishedVersion && (!moved || now - lastCapture < 2000)) return;
        cube.position.copy(position); cube.updateMatrixWorld(true);
        captureVersion = version; face = 0; capturing = true;
      }
      const next = active === 0 ? 1 : 0, target = targets[next];
      const saved = {
        target: renderer.getRenderTarget(), face: renderer.getActiveCubeFace(), mip: renderer.getActiveMipmapLevel(),
        xr: renderer.xr.enabled, shadow: renderer.shadowMap.autoUpdate, shadowNeedsUpdate: renderer.shadowMap.needsUpdate,
        autoClear: renderer.autoClear, toneMapping: renderer.toneMapping,
      };
      const visibility = excluded.map(object => object.visible);
      try {
        excluded.forEach(object => { object.visible = false; });
        renderer.xr.enabled = false;
        renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
        renderer.setRenderTarget(target, face, 0);
        renderer.render(scene, cube.children[face]);
        face++;
        if (face === 6 && captureVersion === version) {
          // Own the filtered targets explicitly. Automatic renderer environment
          // caching does not dispose render-target-derived PMREMs with the cube.
          filtered[next] = filter.fromCubemap(target.texture, filtered[next]);
          materials.forEach(material => { material.envMap = filtered[next].texture; });
          active = next; publishedVersion = captureVersion;
          lastPosition.copy(cube.position); lastCapture = now; stats.captures++;
        }
      } catch {
        // Preserve the sky/last complete capture and the main view on failure.
        stats.failed = true;
      } finally {
        excluded.forEach((object, index) => { object.visible = visibility[index]; });
        renderer.xr.enabled = saved.xr;
        renderer.shadowMap.autoUpdate = saved.shadow; renderer.shadowMap.needsUpdate = saved.shadowNeedsUpdate;
        renderer.autoClear = saved.autoClear; renderer.toneMapping = saved.toneMapping;
        renderer.setRenderTarget(saved.target, saved.face, saved.mip);
      }
      if (face !== 6) return;
      capturing = false;
    },
    dispose() {
      if (disposed) return; disposed = true;
      materials.forEach((material, index) => { material.envMap = previousMaps[index]; });
      targets.forEach(target => target.dispose());
      filtered.forEach(target => target?.dispose()); filter.dispose();
    },
  };
}
