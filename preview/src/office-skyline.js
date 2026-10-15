import * as THREE from 'three';
import { ARRIVAL } from './office-arrival-model.js';
import { officeLobbyFor } from './office-contract.js';

// The penthouse skyline (#363, kit guide P26): once the doors close the district stops
// drawing, so the terrace and the glass look out at the actual district captured once,
// from inside the penthouse, into a cube map that becomes the scene's backdrop. It is a
// picture only: it never moves the office, changes collision, membership or geography,
// and is never sent anywhere. A layout without an outside (the legacy room) gets none.
const EYE = 1.68, NEAR = 0.5;

// The capture point: the middle of the ground floor's whole plan (main floor and
// terrace) at standing height, in the office's [x, height, d] frame. Null when the
// floor has no outdoor room to look out from.
export function officeSkylineEye(layout) {
  const ground = layout?.levels?.[0], bounds = ground?.bounds;
  if (!bounds || !ground.rooms?.some(room => room.kind === 'terrace')) return null;
  return [(bounds.x0 + bounds.x1) / 2, ground.floorElevation + EYE, (bounds.d0 + bounds.d1) / 2];
}

// Face size: 1024 at full render scale, half when the render scale is reduced. (CPU
// software acceptance takes no capture at all: six district views cost more than its
// office smoke allows, and it leaves visual quality to GPU runs.)
export function officeSkylineSize({ scale = 1, maxCubemapSize = Infinity } = {}) {
  return Math.min(scale < 0.75 ? 512 : 1024, maxCubemapSize);
}

// `hide` is drawn neither in the capture nor changed afterwards. The eye stands inside the
// host building (the mapped tower is not yet raised to the penthouse), so for the capture
// only: none of the host's own facade instances (by building index) are drawn, at any height,
// since its exterior skin cannot be seen from inside (its floor-line bands below the office
// floor drew dark rings); its massing (by building id) and anything else standing in its
// footprint (`hostRing`, [x, z] world corners, 1 m margin), such as a rooftop ornament, are
// hidden where they reach above the office floor. Lower roofs and every neighbour stay.
const MARGIN = 1, IDENTITY = new THREE.Matrix4();
function insideRing(ring, x, z, margin = MARGIN) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, zi] = ring[i], [xj, zj] = ring[j];
    if ((zi > z) !== (zj > z) && x < (xj - xi) * (z - zi) / (zj - zi) + xi) inside = !inside;
  }
  if (inside) return true;
  // Within the margin of an edge counts too: facade parts stand just outside the mapped wall.
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[j], [bx, bz] = ring[i], dx = bx - ax, dz = bz - az, length = dx * dx + dz * dz;
    const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / length)) : 0;
    if (Math.hypot(x - ax - dx * t, z - az - dz * t) <= margin) return true;
  }
  return false;
}
export function createOfficeSkyline({ renderer, scene, eye, floorY, hostBuildingIndex = -1, hostBuildingId = null, hostRing = null, hide = [], size = 1024, far = 6000, now = () => performance.now() }) {
  const target = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType });
  target.texture.name = 'office-skyline';
  const stats = { state: 'pending', size, bytes: size * size * 6 * (8 + 4), traverseMs: null, submitMs: null, ms: null, newPrograms: null, hiddenInstances: 0, hiddenMeshes: 0 };
  const round = ms => Math.round(ms * 10) / 10;
  let attempted = false, disposed = false, saved = null;
  const ringBounds = hostRing?.length > 2 ? hostRing.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [Infinity, -Infinity, Infinity, -Infinity]) : null;
  const inFootprint = (x, z) => Boolean(ringBounds) && insideRing(hostRing, x, z);
  const eyeInside = Boolean(ringBounds) && insideRing(hostRing, eye.x, eye.z, 0);

  // Host instances that reach above the office floor, as [mesh, index, matrix]. Most of the
  // district is rejected from each instance's translation and bounding reach alone; only
  // candidates get an exact box.
  function hostInstances() {
    const found = [], box = new THREE.Box3(), matrix = new THREE.Matrix4(), centre = new THREE.Vector3();
    if (hostBuildingIndex < 0 && !ringBounds) return found;
    scene.traverseVisible(object => {
      if (!object.isInstancedMesh) return;
      const indices = object.userData.buildingIndices, geometry = object.geometry, world = object.matrixWorld, e = object.instanceMatrix.array;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const radius = geometry.boundingSphere.radius + geometry.boundingSphere.center.length(), plain = world.equals(IDENTITY);
      for (let i = 0; i < object.count; i++) {
        const o = i * 16, reach = radius * Math.max(Math.hypot(e[o], e[o + 1], e[o + 2]), Math.hypot(e[o + 4], e[o + 5], e[o + 6]), Math.hypot(e[o + 8], e[o + 9], e[o + 10]));
        const indexed = hostBuildingIndex >= 0 && indices?.[i] === hostBuildingIndex;
        if (indexed && eyeInside) { object.getMatrixAt(i, matrix); found.push([object, i, matrix.clone()]); continue; }
        centre.set(e[o + 12], e[o + 13], e[o + 14]); if (!plain) centre.applyMatrix4(world);
        if (centre.y + reach <= floorY + 0.05) continue;
        if (!indexed && (!ringBounds || centre.x + reach < ringBounds[0] - MARGIN || centre.x - reach > ringBounds[1] + MARGIN || centre.z + reach < ringBounds[2] - MARGIN || centre.z - reach > ringBounds[3] + MARGIN)) continue;
        object.getMatrixAt(i, matrix);
        box.copy(geometry.boundingBox).applyMatrix4(matrix).applyMatrix4(world);
        if (box.max.y <= floorY + 0.05) continue;
        box.getCenter(centre);
        if (indexed || inFootprint(centre.x, centre.z)) found.push([object, i, matrix.clone()]);
      }
    });
    return found;
  }
  // Host meshes above the floor: its massing, and any small mesh standing in its footprint.
  // A district-wide merged mesh (signs, roads) is never hidden for overlapping it.
  function hostMeshes() {
    const found = [], box = new THREE.Box3(), centre = new THREE.Vector3();
    scene.traverseVisible(object => {
      if (!object.isMesh || object.isInstancedMesh || box.setFromObject(object).max.y <= floorY + 0.05) return;
      const tagged = hostBuildingId && object.userData.districtBuilding === hostBuildingId;
      const contained = ringBounds && box.min.x >= ringBounds[0] - MARGIN && box.max.x <= ringBounds[1] + MARGIN && box.min.z >= ringBounds[2] - MARGIN && box.max.z <= ringBounds[3] + MARGIN
        && inFootprint(box.getCenter(centre).x, centre.z);
      if (tagged || contained) found.push(object);
    });
    return found;
  }

  return {
    get texture() { return target.texture; },
    get stats() { return { ...stats }; },
    get pending() { return !attempted && !disposed; },
    // Capture once per visit, while the district is still drawn. Returns whether the
    // backdrop is now showing; a second call, or a call after dispose, does nothing.
    capture() {
      if (attempted || disposed) return false;
      attempted = true;
      const started = now(), instances = hostInstances(), masses = hostMeshes(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
      stats.traverseMs = round(now() - started);
      const hidden = [...hide, ...masses].filter(Boolean).map(object => [object, object.visible]);
      const meshes = new Set(instances.map(([mesh]) => mesh));
      const autoClear = renderer.autoClear, shadows = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate;
      const submitted = now(), programs = renderer.info?.programs?.length ?? 0;
      try {
        for (const [object] of hidden) object.visible = false;
        for (const [mesh, index] of instances) mesh.setMatrixAt(index, zero);
        for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
        // Every face clears, and the sun's shadow maps from the last street frame are reused.
        renderer.autoClear = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false;
        const camera = new THREE.CubeCamera(NEAR, far, target);
        camera.position.copy(eye); camera.updateMatrixWorld();
        camera.update(renderer, scene);
        // CPU time to submit the six faces (the GPU is never waited on), and the shader
        // programs first compiled for them.
        stats.submitMs = round(now() - submitted);
        stats.newPrograms = (renderer.info?.programs?.length ?? 0) - programs;
      } catch (error) {
        stats.state = 'failed'; stats.error = error.message;
        return false;
      } finally {
        for (const [mesh, index, matrix] of instances) mesh.setMatrixAt(index, matrix);
        for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
        for (const [object, visible] of hidden) object.visible = visible;
        renderer.autoClear = autoClear; renderer.shadowMap.autoUpdate = shadows; renderer.shadowMap.needsUpdate = shadowNeeds;
      }
      stats.ms = round(now() - started);
      stats.state = 'captured'; stats.hiddenInstances = instances.length; stats.hiddenMeshes = masses.length;
      saved = { background: scene.background, intensity: scene.backgroundIntensity, blurriness: scene.backgroundBlurriness, rotation: scene.backgroundRotation?.clone() };
      // The faces already hold the sky at its intensity; show them as captured.
      scene.background = target.texture; scene.backgroundIntensity = 1; scene.backgroundBlurriness = 0; scene.backgroundRotation?.set(0, 0, 0);
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      // A sky changed while inside (time of day, weather) belongs to the street now.
      if (saved && scene.background === target.texture) {
        scene.background = saved.background; scene.backgroundIntensity = saved.intensity; scene.backgroundBlurriness = saved.blurriness;
        if (saved.rotation) scene.backgroundRotation.copy(saved.rotation);
      }
      target.dispose();
    },
  };
}

// The skyline for one visit, or null: no renderer, the switch off, or a layout with no
// outside. The eye and floor are at the office's final elevation, wherever the cabin is.
export function createVisitSkyline(street, layout, hide) {
  const local = street.renderer && street.skyline ? officeSkylineEye(layout) : null;
  if (!local) return null;
  const eye = new THREE.Vector3(local[0], local[1], -local[2]).applyMatrix4(street.frame);
  eye.y += ARRIVAL.officeElevation;
  const floorY = new THREE.Vector3().setFromMatrixPosition(street.frame).y + ARRIVAL.officeElevation + (layout.levels[0].floorElevation ?? 0);
  const hostBuildingId = street.world ? officeLobbyFor(street.world)?.buildingId ?? null : null;
  const hostBuildingIndex = hostBuildingId ? street.world.buildings.findIndex(building => building.id === hostBuildingId) : -1;
  const hostRing = street.world?.buildings?.[hostBuildingIndex]?.ring?.map(([x, north]) => [x, -north]) ?? null;
  return createOfficeSkyline({ renderer: street.renderer, scene: street.scene, eye, floorY, hostBuildingIndex, hostBuildingId, hostRing, hide, size: street.skyline.size ?? 1024, far: street.camera.far });
}
