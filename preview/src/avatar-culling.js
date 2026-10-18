import * as THREE from 'three';

// Skinned meshes keep bind-pose geometry, so three can't tell where a posed limb
// is. Avatars therefore skipped frustum culling: every mesh drew in the main,
// ambient-occlusion and sun-shadow passes whether or not it could be seen. One
// sphere around the whole figure, large enough for every supported pose
// (avatar-culling.test.js measures the shipped rigs), lets three cull an avatar
// against the camera and, separately, against the sun's shadow frustum.
// Fractions of the standing height: centre above the floor, and radius.
export const FIGURE_SPHERE = Object.freeze({ center: .55, radius: .8 });

const toLocal = new THREE.Matrix4(), part = new THREE.Sphere(), step = new THREE.Vector3();

// How far below a figure's floor its shadow is assumed to be caught. Lower
// receivers (a street under a high terrace) are not covered.
export const SHADOW_DROP = 4;

// Could a figure, or its shadow, appear in view? The sphere (centre, radius) is
// tested against the frustum, then swept along the light, travelling downward,
// until it is SHADOW_DROP below the floor. Sub-spheres no wider than 1.5 radii
// cover the sweep. With no light (no sun shadows), only the figure counts. A
// light within about 1° of the horizon casts unbounded shadows: always in view.
export function figureInView(frustum, center, radius, floor, light = null) {
  if (frustum.intersectsSphere(part.set(center, radius))) return true;
  if (!light) return false;
  if (light.y > -.02) return true;
  const length = (center.y + radius - floor + SHADOW_DROP) / -light.y, count = Math.ceil(length / radius);
  step.copy(light).multiplyScalar(length / count);
  part.radius = radius + length / count / 2;
  part.center.copy(center).addScaledVector(step, -.5);
  for (let i = 0; i < count; i++) if (frustum.intersectsSphere(part.set(part.center.add(step), part.radius))) return true;
  return false;
}

// Standing height of a resident avatar: its rig's height at the scale it was
// instantiated with.
export const figureHeight = avatar => avatar.rig.source.height * avatar.rig.model.scale.y;

// Gives each skinned mesh under root (posed at rest, floor at y = 0) the figure
// sphere in its own space. A mesh carried by a bone moves the sphere with that
// bone, so it stays unculled. Returns the meshes it changed.
export function cullAvatarMeshes(root, height) {
  root.updateWorldMatrix(true, true);
  const center = new THREE.Vector3(0, FIGURE_SPHERE.center * height, 0), changed = [];
  root.traverse(mesh => {
    if (!mesh.isSkinnedMesh || mesh.userData.figureSphere) return;
    for (let node = mesh.parent; node && node !== root; node = node.parent) if (node.isBone) return;
    toLocal.copy(mesh.matrixWorld).invert().multiply(root.matrixWorld);
    mesh.boundingSphere = new THREE.Sphere(center.clone().applyMatrix4(toLocal), FIGURE_SPHERE.radius * height * toLocal.getMaxScaleOnAxis());
    mesh.userData.figureSphere = true; mesh.frustumCulled = true; changed.push(mesh);
  });
  return changed;
}
