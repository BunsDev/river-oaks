// Wingtip ribbons for the Ribbonwing's maneuvers (#777): a mint ribbon streams from each
// wingtip while a maneuver flies, and fades out behind it. Bounded: each tip keeps a fixed
// ring of SAMPLES world points in preallocated buffers (one draw per tip, no allocation per
// frame). Samples age out when the craft stops emitting, so the ribbons shrink away. With
// reduced motion nothing is drawn. dispose() frees both buffers and the material.
import * as THREE from 'three';
import { WING, RIBBONWING_PALETTE, wingHeightAt } from './ribbonwing-design.js';

export const SAMPLES = 40, LIFETIME = 1.1, HALF_WIDTH = .07;

/** @param {{object:THREE.Object3D,pivots:{wings:{side:number,group:THREE.Object3D}[]}}} craft */
export function createRibbonwingTrails(craft) {
  const material = new THREE.MeshBasicMaterial({ color: RIBBONWING_PALETTE.mint, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexColors: true });
  const up = new THREE.Vector3(), point = new THREE.Vector3(), quaternion = new THREE.Quaternion();
  // The tip in each wing pivot's frame, so the tuck carries it.
  const tipZ = 2.88, tipLocal = [1.3 - WING.pivot[0], wingHeightAt(tipZ) - WING.pivot[1], tipZ - WING.pivot[2]];
  // Every LOD level has its own wing pivots, all driven alike: one per side is enough.
  const wings = [1, -1].map(side => craft.pivots.wings.find(wing => wing.side === side)).filter(Boolean);
  const trails = wings.map(({ side, group }) => {
    const tip = new THREE.Object3D();tip.name = `Ribbonwing ${side > 0 ? 'left' : 'right'} wingtip trail`;
    tip.position.set(tipLocal[0], tipLocal[1], tipLocal[2]);group.add(tip);
    const geometry = new THREE.BufferGeometry(), positions = new Float32Array(SAMPLES * 2 * 3), colors = new Float32Array(SAMPLES * 2 * 4), index = [];
    for (let i = 0; i < SAMPLES - 1; i++) { const a = i * 2;index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    geometry.setIndex(index);geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
    geometry.setDrawRange(0, 0);
    // World-space ribbon: parented for lifetime, but its world matrix stays identity.
    const mesh = new THREE.Mesh(geometry, material);mesh.name = `${tip.name} ribbon`;mesh.frustumCulled = false;mesh.renderOrder = 2;
    mesh.matrixAutoUpdate = false;mesh.matrixWorldAutoUpdate = false;mesh.matrixWorld.identity();
    craft.object.add(mesh);
    return { tip, mesh, geometry, positions, colors, points: [], ages: [] };
  });
  let disposed = false;
  return {
    /** Advance by dt seconds; `emitting` while a maneuver flies. */
    update(dt, emitting, reducedMotion = false) {
      if (disposed) return;
      for (const trail of trails) {
        if (reducedMotion) { trail.points.length = trail.ages.length = 0; }
        for (let i = 0; i < trail.ages.length; i++) trail.ages[i] += dt;
        while (trail.ages.length && trail.ages[0] > LIFETIME) { trail.ages.shift();trail.points.shift(); }
        if (emitting && !reducedMotion) {
          trail.tip.updateWorldMatrix(true, false);trail.tip.getWorldPosition(point);trail.tip.getWorldQuaternion(quaternion);
          up.set(0, HALF_WIDTH, 0).applyQuaternion(quaternion);
          trail.points.push([point.x - up.x, point.y - up.y, point.z - up.z, point.x + up.x, point.y + up.y, point.z + up.z]);trail.ages.push(0);
          if (trail.points.length > SAMPLES) { trail.points.shift();trail.ages.shift(); }
        }
        const count = trail.points.length;
        for (let i = 0; i < count; i++) {
          trail.positions.set(trail.points[i], i * 6);
          const alpha = .55 * (1 - trail.ages[i] / LIFETIME) * (i / Math.max(1, count - 1));
          trail.colors.set([1, 1, 1, alpha, 1, 1, 1, alpha], i * 8);
        }
        trail.geometry.setDrawRange(0, count > 1 ? (count - 1) * 6 : 0);
        trail.geometry.attributes.position.needsUpdate = trail.geometry.attributes.color.needsUpdate = count > 0;
        trail.mesh.visible = count > 1;
      }
    },
    stats: () => ({ samples: trails.map(trail => trail.points.length), draws: trails.filter(trail => trail.mesh.visible).length }),
    dispose() {
      if (disposed) return;disposed = true;
      for (const trail of trails) { trail.mesh.removeFromParent();trail.tip.removeFromParent();trail.geometry.dispose(); }
      material.dispose();
    },
  };
}
