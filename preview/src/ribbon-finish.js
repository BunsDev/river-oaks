import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { PINK_JET_AGE as P } from '../../shared/city-kit/pink-jet-age.js';
import { roundedRectOutline, saucerProfile, taperedColumnProfile } from '../../shared/city-kit/jet-age-forms.js';
import { districtRibbonPlan } from './ribbon-district.js';
import { DISTRICT_RIBBON_LANE, ribbonAppliesTo } from './ribbon-graybox.js';
export { DISTRICT_RIBBON_LANE, ribbonAppliesTo };

// The finished Ribbon (#825 M1, #839): the same placements the #828 graybox draws (the District
// spine, config/ribbon/district-spine.json, expanded by shared/city-kit/ribbon-layout.js), in
// the pink-jet-age family and the R3 forms: tapered ivory pilotis, a rounded ivory canopy with a
// pink bullnose along each edge, chrome saucer fans and warm lamp heads. Same interface as
// buildRibbonGraybox ({ world, plan, groundAt }); the graybox stays as the massing reference.
//
// Five instanced meshes (posts, canopy, edges, fans, lamps), so the route costs five draw calls
// however long it is. By day nothing glows and pink is a material; at dusk only the lamp heads
// light, warm white (the canopy is not a usable thing, so it never lights pink).
// Drawn, not collision: walking and server movement are the Integration slice (#841).
export const RIBBON_FINISH = Object.freeze({
  // The contract's slab (five-rooms-layout.js FIVE_ROOMS_RULES.slab): 0.4 m above the clear
  // height, so the canopy top stays where the contract's crown clearance measured it.
  slab: 0.4, overhang: 0.15, bullnose: 0.09,
  post: Object.freeze({ foot: 0.11, head: 0.16, capital: 0.05 }),
  fanRadius: 0.45, fanDepth: 0.14, lampRadius: 0.12,
});
export const RIBBON_FINISH_MATERIALS = Object.freeze({
  canopy: Object.freeze({ color: P.ivory, roughness: 0.6, metalness: 0 }),
  edge: Object.freeze({ color: P.pink, roughness: 0.45, metalness: 0 }),
  post: Object.freeze({ color: P.ivory, roughness: 0.55, metalness: 0 }),
  fan: Object.freeze({ color: P.chrome, roughness: 0.3, metalness: 0.9 }),
  lamp: Object.freeze({ color: '#f6e7c4', roughness: 0.25, metalness: 0, emissive: '#ffbf66', night: 1.6 }),
});

const scene = ([east, north]) => [east, -north];
const v2 = points => points.map(([x, y]) => new THREE.Vector2(x, y));

// The canopy body: a rounded-rect section (across x width 1, up y) extruded 1 m along local x.
function canopyGeometry() {
  const F = RIBBON_FINISH, section = roundedRectOutline(1, F.slab, F.slab / 2, 5);
  const geometry = new THREE.ExtrudeGeometry(new THREE.Shape(v2(section)), { depth: 1, bevelEnabled: false, curveSegments: 1 });
  // Shape (x across, y up) extruded along +z: turn so the extrusion runs along +x, centred.
  geometry.translate(0, 0, -0.5); geometry.rotateY(Math.PI / 2);
  return geometry;
}

export function buildRibbon({ world, plan, groundAt = () => 0 } = {}) {
  const group = new THREE.Group(); group.name = 'Ribbon';
  if (!plan) {
    try { plan = districtRibbonPlan(world); }
    catch (error) { group.userData.ribbon = { id: 'district-spine', finish: 'pink-jet-age', refused: error.message, drawCalls: 0 }; return group; }
  }
  const F = RIBBON_FINISH, materials = new Map(Object.entries(RIBBON_FINISH_MATERIALS).map(([key, spec]) => {
    const material = new THREE.MeshStandardMaterial({ color: spec.color, roughness: spec.roughness, metalness: spec.metalness });
    material.name = `ribbon/${key}`;
    if (spec.emissive) { material.emissive.set(spec.emissive); material.emissiveIntensity = 0; }
    material.userData.night = spec.night ?? 0;
    return [key, material];
  }));
  const matrix = new THREE.Matrix4(), local = new THREE.Matrix4(), position = new THREE.Vector3(), rotation = new THREE.Quaternion(), scale = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  const geometries = [];
  const instanced = (name, geometry, material, items, place) => {
    geometries.push(geometry);
    const mesh = new THREE.InstancedMesh(geometry, materials.get(material), Math.max(1, items.length));
    mesh.name = name; mesh.count = items.length;
    items.forEach((item, i) => { place(item, i); mesh.setMatrixAt(i, matrix); });
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere(); mesh.computeBoundingBox?.();
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const moduleCentre = module => { const [x0, z0] = scene(module.from), [x1, z1] = scene(module.to); return [(x0 + x1) / 2, (z0 + z1) / 2]; };
  // Pilotis: a tapered lathe of unit height, stretched to each post's height from the ground.
  const column = new THREE.LatheGeometry(v2(taperedColumnProfile({ height: 1, foot: F.post.foot, head: F.post.head, capital: F.post.capital })), 12);
  instanced('Ribbon posts', column, 'post', plan.posts, post => {
    const [x, z] = scene(post.position);
    position.set(x, groundAt(x, z), z); rotation.identity(); scale.set(1, post.height, 1);
    matrix.compose(position, rotation, scale);
  });
  // The canopy body along each module, as wide as the walk plus an overhang each side.
  instanced('Ribbon canopy', canopyGeometry(), 'canopy', plan.modules, module => {
    const [x, z] = moduleCentre(module);
    position.set(x, groundAt(x, z) + module.clearHeight + F.slab / 2, z);
    rotation.setFromAxisAngle(up, module.yaw); scale.set(module.length, 1, module.width + F.overhang * 2);
    matrix.compose(position, rotation, scale);
  });
  // Two pink bullnoses per module, along its edges at mid-slab.
  const edge = new THREE.CylinderGeometry(F.bullnose, F.bullnose, 1, 10); edge.rotateZ(Math.PI / 2);
  const edges = plan.modules.flatMap(module => [-1, 1].map(side => ({ module, side })));
  instanced('Ribbon edges', edge, 'edge', edges, ({ module, side }) => {
    const [x, z] = moduleCentre(module);
    position.set(x, groundAt(x, z) + module.clearHeight + F.slab / 2, z); rotation.setFromAxisAngle(up, module.yaw); scale.set(1, 1, 1);
    matrix.compose(position, rotation, scale);
    local.compose(new THREE.Vector3(0, 0, side * (module.width / 2 + F.overhang)), new THREE.Quaternion(), new THREE.Vector3(module.length, 1, 1));
    matrix.multiply(local);
  });
  // Fans: a chrome saucer hung belly down from a stem that reaches the canopy's underside.
  const drop = plan.fans.length ? Math.max(0, plan.modules[0].clearHeight - plan.fans[0].height) : 0;
  const fan = mergeGeometries([
    new THREE.LatheGeometry(v2(saucerProfile({ radius: 1, rim: 0.03, dome: F.fanDepth - 0.07, belly: 0.04, segments: 8 })), 20).rotateX(Math.PI).toNonIndexed(),
    new THREE.CylinderGeometry(0.05, 0.05, drop + 0.02, 6).translate(0, drop / 2, 0).toNonIndexed(),
  ]);
  instanced('Ribbon fans', fan, 'fan', plan.fans, item => {
    const [x, z] = scene(item.position);
    position.set(x, groundAt(x, z) + item.height, z); rotation.identity(); scale.set(F.fanRadius, 1, F.fanRadius);
    matrix.compose(position, rotation, scale);
  });
  instanced('Ribbon lamp heads', new THREE.SphereGeometry(1, 12, 8), 'lamp', plan.lamps, lamp => {
    const [x, z] = scene(lamp.position);
    position.set(x, groundAt(x, z) + lamp.height, z); rotation.identity(); scale.setScalar(F.lampRadius);
    matrix.compose(position, rotation, scale);
  });
  group.userData.ribbon = { id: plan.id, hash: plan.hash, finish: 'pink-jet-age', stats: { ...plan.stats }, skipped: plan.skipped.map(item => item.id), drawCalls: group.children.length };
  group.userData.relight = ({ twilight = 0 } = {}) => {
    const level = Math.max(0, Math.min(1, Number(twilight) || 0));
    for (const material of materials.values()) if (material.userData.night) material.emissiveIntensity = material.userData.night * level;
  };
  let disposed = false;
  group.userData.dispose = () => {
    if (disposed) return; disposed = true;
    for (const geometry of geometries) geometry.dispose();
    for (const mesh of group.children) mesh.dispose?.();
    for (const material of materials.values()) material.dispose();
  };
  return group;
}
