// The Gardens' interior ceilings (#508): a plaster soffit under every occupied floor's slab,
// inside the glass line, so a resident walking a gallery, spine or lobby looks up at a lit
// ceiling instead of the slab's unlit underside. A faint emissive stands in for light
// bounced off the floor; it adds no scene light. Drawn as one instanced mesh in the campus
// root's own frame (x = u, y = z, -z = v), as a child of buildGardenCampus's group.
import * as THREE from 'three';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS } from '../../shared/garden-campus-layout.js';
import { applyKitFields, campusKitFinish } from './garden-campus-kit-finish.js';

export const CEILING_INSET = 0.1, CEILING_THICKNESS = 0.02;

/** One ceiling rect per occupied floor: { id, rect: [u0, v0, u1, v1], z0, z1 } in campus metres. */
export function campusCeilings(layout = CAMPUS) {
  const slab = layout.bridges[0].slab;
  return layout.towers.flatMap(tower => tower.levels.map(floor => {
    const [u0, v0, u1, v1] = floor.rect, top = floor.z1 - slab;
    return { id: `${floor.id}/ceiling`, rect: [u0 + CEILING_INSET, v0 + CEILING_INSET, u1 - CEILING_INSET, v1 - CEILING_INSET], z0: top - CEILING_THICKNESS, z1: top };
  }));
}

/** The ceilings as a group to add to the campus root; it releases what it owns. `kitFinish` recolours only. */
export function buildCampusCeilings(layout = CAMPUS, { kitFinish } = {}) {
  const ceilings = campusCeilings(layout), group = new THREE.Group();group.name = 'campus:ceilings';
  const material = new THREE.MeshStandardMaterial({ name: 'campus:ceiling', color: '#f2eee6', emissive: '#f2eee6', emissiveIntensity: 0.22, roughness: 0.9 });
  applyKitFields(material, campusKitFinish(kitFinish).ceiling);
  const unit = new THREE.BoxGeometry(1, 1, 1), mesh = new THREE.InstancedMesh(unit, material, ceilings.length), dummy = new THREE.Object3D();
  ceilings.forEach(({ rect: [u0, v0, u1, v1], z0, z1 }, index) => {
    dummy.position.set((u0 + u1) / 2, (z0 + z1) / 2, -(v0 + v1) / 2);dummy.scale.set(u1 - u0, z1 - z0, v1 - v0);dummy.updateMatrix();mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.name = 'campus:ceiling';mesh.receiveShadow = true;group.add(mesh);
  group.userData.dispose = () => { mesh.dispose();unit.dispose();material.dispose(); };
  return group;
}
