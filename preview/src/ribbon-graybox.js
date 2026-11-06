import * as THREE from 'three';
import { DISTRICT_RIBBON_LANE, districtRibbonPlan } from './ribbon-district.js';
export { DISTRICT_RIBBON_LANE };

// The Ribbon in graybox (#825 slice 2b): the District spine (config/ribbon/district-spine.json)
// drawn from its expanded placements (shared/city-kit/ribbon-layout.js) as plain grey shapes,
// only under the `pink-jet-age` finish (render-quality.js readFinishPreference); classic is
// unchanged. One material and four instanced meshes (posts, canopy slabs, fans, lamp heads), so
// the route costs at most four draw calls however long it is.
//
// Graybox is massing only: no pink, no light, no glow (#825's pink rule lets pink light only on
// usable things, and nothing here is usable yet). Posts are drawn, not collision: they stand on the
// walk's edges outside its clear width, and server movement is unchanged (a later slice).
export const RIBBON_GRAYBOX = Object.freeze({ color: '#b8b5ae', canopyDepth: 0.12, fanRadius: 0.45, fanDepth: 0.06, lampRadius: 0.12, postSize: 0.3 });
// The spine follows the District's central access lane, so a world without it (a creator world) gets no Ribbon.
export const ribbonAppliesTo = (world, finish) => finish === 'pink-jet-age' && (world?.roads ?? []).some(road => road.id === DISTRICT_RIBBON_LANE);

// Source [east, north] to scene [x, z]: the District's scene puts north at -z (geometry.js localToScene).
const scene = ([east, north]) => [east, -north];

// A world whose doors, benches or fixtures leave the spine no valid post draws no Ribbon: the
// refusal is kept on the group (and the debug readout) instead of failing the world's load.
export function buildRibbonGraybox({ world, plan, groundAt = () => 0 } = {}) {
  const group = new THREE.Group(); group.name = 'Ribbon graybox';
  if (!plan) {
    try { plan = districtRibbonPlan(world); }
    catch (error) { group.userData.ribbon = { id: 'district-spine', refused: error.message, drawCalls: 0 }; return group; }
  }
  const material = new THREE.MeshStandardMaterial({ color: RIBBON_GRAYBOX.color, roughness: 0.85, metalness: 0 });
  material.name = 'ribbon-graybox';
  const matrix = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const instanced = (name, geometry, items, place) => {
    const mesh = new THREE.InstancedMesh(geometry, material, Math.max(1, items.length));
    mesh.name = name; mesh.count = items.length;
    items.forEach((item, i) => { place(item); matrix.compose(position, rotation, scale); mesh.setMatrixAt(i, matrix); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.computeBoundingBox?.();
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const box = new THREE.BoxGeometry(1, 1, 1), disc = new THREE.CylinderGeometry(1, 1, 1, 16), ball = new THREE.SphereGeometry(1, 10, 8);
  // Posts rise from the ground under them to the canopy's underside.
  instanced('Ribbon posts', box, plan.posts, post => {
    const [x, z] = scene(post.position), ground = groundAt(x, z);
    position.set(x, ground + post.height / 2, z); rotation.identity(); scale.set(RIBBON_GRAYBOX.postSize, post.height, RIBBON_GRAYBOX.postSize);
  });
  // One slab per module, along the module and as wide as the walk. Source yaw is from east toward
  // north; turning the scene's +x by that angle about +y points it along the module (north is -z).
  instanced('Ribbon canopy', box, plan.modules, module => {
    const [x0, z0] = scene(module.from), [x1, z1] = scene(module.to), x = (x0 + x1) / 2, z = (z0 + z1) / 2;
    position.set(x, groundAt(x, z) + module.clearHeight + RIBBON_GRAYBOX.canopyDepth / 2, z);
    rotation.setFromAxisAngle(up, module.yaw); scale.set(module.length, RIBBON_GRAYBOX.canopyDepth, module.width);
  });
  instanced('Ribbon fans', disc, plan.fans, fan => {
    const [x, z] = scene(fan.position);
    position.set(x, groundAt(x, z) + fan.height, z); rotation.identity(); scale.set(RIBBON_GRAYBOX.fanRadius, RIBBON_GRAYBOX.fanDepth, RIBBON_GRAYBOX.fanRadius);
  });
  instanced('Ribbon lamp heads', ball, plan.lamps, lamp => {
    const [x, z] = scene(lamp.position);
    position.set(x, groundAt(x, z) + lamp.height, z); rotation.identity(); scale.setScalar(RIBBON_GRAYBOX.lampRadius);
  });
  group.userData.ribbon = { id: plan.id, hash: plan.hash, stats: { ...plan.stats }, skipped: plan.skipped.map(item => item.id), drawCalls: group.children.length };
  return group;
}
