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

// Face size: 512 on a touch-first device, phone or tablet (its primary pointer is coarse: the
// query walking-ui.js shows the movement pad for), or when the render scale is reduced; 1024
// otherwise. Never more than the device's cube or 2D texture limit: each face is drawn into a 2D
// target first. (CPU software acceptance takes no capture at all: six district views cost more
// than its office smoke allows, and it leaves visual quality to GPU runs.)
export function officeSkylineSize({ scale = 1, coarsePointer = false, maxCubemapSize = Infinity, maxTextureSize = Infinity } = {}) {
  return Math.min(coarsePointer || scale < 0.75 ? 512 : 1024, maxCubemapSize, maxTextureSize);
}

// Which outlook a terrace office draws (Val, 2026-10-15): a phone or tablet (coarse pointer) or a
// reduced render scale keeps the bounded one-time snapshot at officeSkylineSize; other devices draw
// the live district. Chosen once, when a visit starts.
export function officeOutlookFor({ scale = 1, coarsePointer = false, maxCubemapSize = Infinity, maxTextureSize = Infinity } = {}) {
  return coarsePointer || scale < 0.75 ? { mode: 'snapshot', size: officeSkylineSize({ scale, coarsePointer, maxCubemapSize, maxTextureSize }) } : { mode: 'live' };
}

// The six faces as three.js CubeCamera draws them for WebGL (cameras/CubeCamera.js), in cube
// face order +x, -x, +y, -y, +z, -z: the direction each looks along and its up vector, through
// a 90-degree camera whose negative field of view (CubeCamera's own) mirrors it into the cube
// map convention.
const FACES = [[[1, 0, 0], [0, 1, 0]], [[-1, 0, 0], [0, 1, 0]], [[0, 1, 0], [0, 0, -1]], [[0, -1, 0], [0, 0, 1]], [[0, 0, 1], [0, 1, 0]], [[0, 0, -1], [0, 1, 0]]];
const FACE_FOV = -90;
// Copies a face texel for texel, unfiltered and unconverted, from the temporary 2D target into
// the cube face bound for drawing. One copy serves every visit in the page, as three.js keeps
// its own background meshes: disposing it made each later capture compile its program again
// (about 35 ms more per capture on Metal ANGLE). Between captures it holds no texture.
let copyPass = null;
function faceCopy() {
  if (!copyPass) {
    const material = new THREE.ShaderMaterial({
      name: 'office-skyline-face-copy', uniforms: { face: { value: null } },
      vertexShader: 'void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: 'uniform sampler2D face; void main() { gl_FragColor = texelFetch(face, ivec2(gl_FragCoord.xy), 0); }',
      depthTest: false, depthWrite: false, blending: THREE.NoBlending, toneMapped: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material), scene = new THREE.Scene();
    quad.frustumCulled = false; scene.add(quad);
    copyPass = { scene, camera: new THREE.Camera(), source: material.uniforms.face };
  }
  return copyPass;
}

// `hide` is drawn neither in the capture nor changed afterwards. The eye stands inside the
// host building (the mapped tower is not yet raised to the penthouse), so for the capture
// only: the host's facade instances (by building index) that reach above the office floor, or
// stand wholly above its lower roof, are not drawn, since the tower's own exterior skin cannot
// be seen from inside it (its floor-line bands below the office floor drew dark rings). A
// stepped host's lower wing (parapet within PARAPET of its roof) and street frontage stay. Its
// massing (by building id) and anything else standing in its footprint (`hostRing`, [x, z]
// world corners, 1 m margin), such as a rooftop ornament, are hidden where they reach above
// the office floor. Every neighbour stays.
const MARGIN = 1, PARAPET = 1.2, IDENTITY = new THREE.Matrix4();
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
// Memory: the backdrop keeps colour only, 6 x size^2 x 8 bytes (RGBA half float): 48 MiB at
// 1024, 12 MiB at 512, for the visit. Each face is drawn, with depth, into one temporary 2D
// target (size^2 x (8 + 4) bytes) and copied into its cube face; that target is released as soon
// as the capture ends, so the depth never outlives it. `bytes` is what stays, `peakBytes` the
// most held during the capture.
export function createOfficeSkyline({ mode = 'snapshot', hostRoot = null, renderer, scene, eye, floorY, hostBuildingIndex = -1, hostBuildingId = null, hostRing = null, hide = [], size = 1024, far = 6000, now = () => performance.now() }) {
  const live = mode === 'live';
  const target = live ? null : new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, depthBuffer: false });
  if (target) target.texture.name = 'office-skyline';
  const colour = live ? 0 : size * size * 6 * 8, face = live ? 0 : size * size * (8 + 4);
  const stats = { mode, frames: 0, state: 'pending', size: live ? 0 : size, bytes: colour, peakBytes: colour + face, traverseMs: null, submitMs: null, ms: null, newPrograms: null, hiddenInstances: 0, hiddenMeshes: 0 };
  const round = ms => Math.round(ms * 10) / 10;
  let attempted = false, disposed = false, saved = null;
  const ringBounds = hostRing?.length > 2 ? hostRing.reduce((b, [x, z]) => [Math.min(b[0], x), Math.max(b[1], x), Math.min(b[2], z), Math.max(b[3], z)], [Infinity, -Infinity, Infinity, -Infinity]) : null;
  const inFootprint = (x, z) => Boolean(ringBounds) && insideRing(hostRing, x, z);
  const excluded = object => { for (let node = object; node && node !== scene; node = node.parent) if (hide.includes(node)) return true; return false; };
  const architecture = live ? hostRoot : scene;
  const eyeInside = Boolean(ringBounds) && insideRing(hostRing, eye.x, eye.z, 0);
  // The host's lower roof: the top of its massing that stays below the office floor (a stepped
  // block's wing). None for a single-mass building, whose whole facade is then skin.
  function lowerRoof() {
    let top = -Infinity; const box = new THREE.Box3();
    if (hostBuildingId) architecture?.traverseVisible(object => {
      if (object.isMesh && object.userData.districtBuilding === hostBuildingId && box.setFromObject(object).max.y <= floorY + 0.05) top = Math.max(top, box.max.y);
    });
    return top;
  }

  // Host instances that reach above the office floor, as [mesh, index, matrix]. Most of the
  // district is rejected from each instance's translation and bounding reach alone; only
  // candidates get an exact box.
  function hostInstances() {
    const found = [], box = new THREE.Box3(), matrix = new THREE.Matrix4(), centre = new THREE.Vector3();
    if (hostBuildingIndex < 0 && !ringBounds) return found;
    const skinFrom = eyeInside ? lowerRoof() + PARAPET : Infinity;
    architecture?.traverseVisible(object => {
      if (!object.isInstancedMesh || excluded(object)) return;
      const indices = object.userData.buildingIndices, geometry = object.geometry, world = object.matrixWorld, e = object.instanceMatrix.array;
      if (!geometry.boundingSphere) geometry.computeBoundingSphere();
      if (!geometry.boundingBox) geometry.computeBoundingBox();
      const radius = geometry.boundingSphere.radius + geometry.boundingSphere.center.length(), plain = world.equals(IDENTITY);
      for (let i = 0; i < object.count; i++) {
        const o = i * 16, reach = radius * Math.max(Math.hypot(e[o], e[o + 1], e[o + 2]), Math.hypot(e[o + 4], e[o + 5], e[o + 6]), Math.hypot(e[o + 8], e[o + 9], e[o + 10]));
        const indexed = hostBuildingIndex >= 0 && indices?.[i] === hostBuildingIndex;
        if (indexed && skinFrom < Infinity) {
          object.getMatrixAt(i, matrix); box.copy(geometry.boundingBox).applyMatrix4(matrix).applyMatrix4(world);
          if (box.max.y > floorY + 0.05 || box.min.y >= skinFrom) found.push([object, i, matrix.clone()]);
          continue;
        }
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
    architecture?.traverseVisible(object => {
      if (!object.isMesh || object.isInstancedMesh || excluded(object) || box.setFromObject(object).max.y <= floorY + 0.05) return;
      const tagged = hostBuildingId && object.userData.districtBuilding === hostBuildingId;
      const contained = ringBounds && box.min.x >= ringBounds[0] - MARGIN && box.max.x <= ringBounds[1] + MARGIN && box.min.z >= ringBounds[2] - MARGIN && box.max.z <= ringBounds[3] + MARGIN
        && inFootprint(box.getCenter(centre).x, centre.z);
      if (tagged || contained) found.push(object);
    });
    return found;
  }

  // District architecture is fixed for a visit. Classify it once, then give each host mesh a
  // stand-in holding only its unmasked instances: the same geometry and material, so the same
  // programs. Each ordinary draw shows the stand-ins in the host meshes' place and swaps them back
  // after, so no instance data is uploaded again frame after frame, and every other render (the
  // storefront reflection probe) and raycast between draws still sees the district as it is. A host
  // mesh whose instances change during the visit gets a fresh stand-in.
  let liveMask = null;
  const standIn = (mesh, hidden) => {
    const keep = [], matrix = new THREE.Matrix4(), color = new THREE.Color();
    for (let i = 0; i < mesh.count; i++) if (!hidden.has(i)) keep.push(i);
    const copy = new THREE.InstancedMesh(mesh.geometry, mesh.material, Math.max(1, keep.length));
    keep.forEach((index, slot) => { mesh.getMatrixAt(index, matrix); copy.setMatrixAt(slot, matrix); if (mesh.instanceColor) { mesh.getColorAt(index, color); copy.setColorAt(slot, color); } });
    copy.count = keep.length; copy.matrixAutoUpdate = mesh.matrixAutoUpdate; copy.matrix.copy(mesh.matrix);
    copy.position.copy(mesh.position); copy.quaternion.copy(mesh.quaternion); copy.scale.copy(mesh.scale); copy.layers.mask = mesh.layers.mask;
    Object.assign(copy, { name: `${mesh.name} (office outlook)`, visible: false, castShadow: mesh.castShadow, receiveShadow: mesh.receiveShadow, frustumCulled: mesh.frustumCulled, renderOrder: mesh.renderOrder, onBeforeRender: mesh.onBeforeRender, onAfterRender: mesh.onAfterRender });
    copy.userData.officeOutlookStandIn = true; copy.computeBoundingSphere(); copy.computeBoundingBox();
    mesh.parent.add(copy); copy.updateMatrixWorld(true);
    return { mesh, hidden, copy, version: mesh.instanceMatrix.version, colors: mesh.instanceColor?.version };
  };
  const release = ({ copy }) => { copy.removeFromParent(); copy.dispose(); };
  const current = swap => swap.version === swap.mesh.instanceMatrix.version && swap.colors === swap.mesh.instanceColor?.version;
  return {
    get texture() { return target?.texture ?? null; },
    render(draw) {
      if (!live || disposed) return false;
      if (!liveMask) {
        const started = now();
        scene.updateMatrixWorld(true);
        const instances = hostInstances(), masses = hostMeshes(), byMesh = new Map();
        for (const [mesh, index] of instances) if (mesh.parent) byMesh.set(mesh, (byMesh.get(mesh) ?? new Set()).add(index));
        liveMask = { masses, swaps: [...byMesh].map(([mesh, hidden]) => standIn(mesh, hidden)) };
        stats.traverseMs = round(now() - started);
        stats.hiddenInstances = instances.length; stats.hiddenMeshes = masses.length;
      }
      liveMask.swaps = liveMask.swaps.map(swap => current(swap) || !swap.mesh.parent ? swap : (release(swap), standIn(swap.mesh, swap.hidden)));
      const { swaps, masses } = liveMask, hosts = swaps.map(({ mesh }) => mesh.visible), visible = masses.map(object => object.visible), started = now();
      try {
        swaps.forEach(({ mesh, copy }, index) => { copy.visible = hosts[index]; mesh.visible = false; });
        for (const object of masses) object.visible = false;
        draw(); stats.frames++; stats.state = 'live';
        stats.lastRenderMs = round(now() - started);
        return true;
      } finally {
        swaps.forEach(({ mesh, copy }, index) => { mesh.visible = hosts[index]; copy.visible = false; });
        masses.forEach((object, index) => { object.visible = visible[index]; });
      }
    },
    get stats() { return { ...stats }; },
    get pending() { return !live && !attempted && !disposed; },
    // Capture once per visit, while the district is still drawn. Returns whether the
    // backdrop is now showing; a second call, or a call after dispose, does nothing.
    capture() {
      if (live || attempted || disposed) return false;
      attempted = true;
      const started = now(), instances = hostInstances(), masses = hostMeshes(), zero = new THREE.Matrix4().makeScale(0, 0, 0);
      stats.traverseMs = round(now() - started);
      const hidden = [...hide, ...masses].filter(Boolean).map(object => [object, object.visible]);
      const meshes = new Set(instances.map(([mesh]) => mesh));
      const autoClear = renderer.autoClear, shadows = renderer.shadowMap.autoUpdate, shadowNeeds = renderer.shadowMap.needsUpdate, xr = renderer.xr.enabled;
      const previous = [renderer.getRenderTarget(), renderer.getActiveCubeFace(), renderer.getActiveMipmapLevel()];
      const submitted = now(), programs = renderer.info?.programs?.length ?? 0;
      let scratch = null, copy = null;
      try {
        for (const [object] of hidden) object.visible = false;
        for (const [mesh, index] of instances) mesh.setMatrixAt(index, zero);
        for (const mesh of meshes) mesh.instanceMatrix.needsUpdate = true;
        // Every face clears, and the sun's shadow maps from the last street frame are reused.
        renderer.autoClear = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = false; renderer.xr.enabled = false;
        scratch = new THREE.WebGLRenderTarget(size, size, { type: THREE.HalfFloatType });
        copy = faceCopy(); copy.source.value = scratch.texture;
        const camera = new THREE.PerspectiveCamera(FACE_FOV, 1, NEAR, far);
        FACES.forEach(([look, up], index) => {
          // Turned at the origin, as CubeCamera turns its face cameras, then placed at the eye.
          camera.position.set(0, 0, 0); camera.up.set(...up); camera.lookAt(...look);
          camera.position.copy(eye); camera.updateMatrixWorld();
          renderer.setRenderTarget(scratch); renderer.render(scene, camera);
          renderer.setRenderTarget(target, index); renderer.render(copy.scene, copy.camera);
        });
        target.texture.needsPMREMUpdate = true;
        // CPU time to submit the six faces and their copies (the GPU is never waited on), and
        // the shader programs first compiled for them.
        stats.submitMs = round(now() - submitted);
        stats.newPrograms = (renderer.info?.programs?.length ?? 0) - programs;
      } catch (error) {
        stats.state = 'failed'; stats.error = error.message;
        // Nothing is shown, so the cube is released now rather than at the end of the visit.
        target.dispose();
        return false;
      } finally {
        renderer.setRenderTarget(...previous); renderer.xr.enabled = xr;
        if (copy) copy.source.value = null;
        scratch?.dispose();
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
      if (saved && scene.background === target?.texture) {
        scene.background = saved.background; scene.backgroundIntensity = saved.intensity; scene.backgroundBlurriness = saved.blurriness;
        if (saved.rotation) scene.backgroundRotation.copy(saved.rotation);
      }
      target?.dispose(); liveMask?.swaps.forEach(release); liveMask = null;
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
  return createOfficeSkyline({ mode: street.skyline.mode ?? 'snapshot', hostRoot: street.architecture, renderer: street.renderer, scene: street.scene, eye, floorY, hostBuildingIndex, hostBuildingId, hostRing, hide, size: street.skyline.size ?? 1024, far: street.camera.far });
}
