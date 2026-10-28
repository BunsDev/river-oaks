import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cityBikeRacks, rackSlots } from './bike-racks.js';
import { createRoadVehicle } from './road-vehicles.js';
import { groundSurfaceHeight } from './world-surface.js';

// The curbside bike racks (bike-racks.js). All the bars are one bronze mesh,
// shaped as the plaza's (plaza-salon.js). The parked bikes are the
// road vehicle's bicycle merged by material and instanced per rack, so a rack
// in view costs one draw per material and a rack out of view none; one hidden
// proxy per rack casts its bikes' shadows (main.js castShadowsFromProxies). A
// bike whose slot is out shrinks to nothing until the town hands it back.
const scene = ([east, north]) => [east, -north];
function hideAfterShadow() { this.visible = false; }

export function buildCityBikeRacks(world) {
  const group = new THREE.Group(); group.name = 'City bike racks';
  group.userData.shadowProxies = [];
  const racks = cityBikeRacks(world);
  if (!racks.length) return group;
  const base = item => { const [x, z] = scene([item.x, item.north]); return new THREE.Vector3(x, groundSurfaceHeight(world, x, z), z); };
  // Vertices and instances sit relative to the racks' middle, so float32 keeps them exact.
  const origin = racks.reduce((sum, rack) => sum.add(base(rack)), new THREE.Vector3()).divideScalar(racks.length);
  group.position.copy(origin);

  // The bars: a bronze rail on two posts with foot discs, along the rack's heading.
  const box = new THREE.BoxGeometry(1, 1, 1), post = new THREE.CylinderGeometry(0.5, 0.5, 1, 10), disc = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);
  const pieces = [], dummy = new THREE.Object3D();
  for (const rack of racks) {
    const at = base(rack).sub(origin), yaw = rack.heading;
    const part = (geometry, [lx, ly, lz], scale) => {
      dummy.position.set(at.x + lx * Math.cos(yaw) + lz * Math.sin(yaw), at.y + ly, at.z - lx * Math.sin(yaw) + lz * Math.cos(yaw));
      dummy.rotation.set(0, yaw, 0); dummy.scale.fromArray(scale); dummy.updateMatrix();
      pieces.push(geometry.clone().applyMatrix4(dummy.matrix));
    };
    part(box, [0, 0.8, 0], [rack.length, 0.05, 0.05]);
    for (const lx of [-1, 1].map(side => side * (rack.length / 2 - 0.3))) {
      part(post, [lx, 0.4, 0], [0.07, 0.8, 0.07]);
      part(disc, [lx, 0.015, 0], [0.22, 0.03, 0.22]);
    }
  }
  const bronze = new THREE.MeshStandardMaterial({ color: '#5f4a33', metalness: 0.82, roughness: 0.36 });
  const bars = new THREE.Mesh(mergeGeometries(pieces), bronze); bars.name = 'Bike rack bars';
  bars.castShadow = bars.receiveShadow = true; group.add(bars);
  for (const geometry of [...pieces, box, post, disc]) geometry.dispose();

  // The bike, merged by material (its parts share position, normal and uv), and
  // its silhouette for the shadow proxy.
  const model = createRoadVehicle('bicycle'); model.object.updateMatrixWorld(true);
  const parts = new Map();
  model.object.traverse(mesh => {
    if (!mesh.isMesh) return;
    const geometry = (mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone()).applyMatrix4(mesh.matrixWorld);
    geometry.clearGroups();
    if (!parts.has(mesh.material)) parts.set(mesh.material, []);
    parts.get(mesh.material).push(geometry);
  });
  const batches = [...parts].map(([material, geometries]) => {
    const geometry = mergeGeometries(geometries); geometries.forEach(item => item.dispose());
    return { geometry, material };
  });
  const silhouette = mergeGeometries(batches.map(({ geometry }) => new THREE.BufferGeometry().setAttribute('position', geometry.attributes.position)));
  // Plain, so three draws the proxy with its default depth material.
  const shadowMaterial = new THREE.MeshBasicMaterial();

  // A parked bike stands on its slot facing the way it points; the mesh faces
  // local -X, so a heading turns it a further quarter (as at the plaza rack).
  const up = new THREE.Vector3(0, 1, 0), turn = new THREE.Quaternion(), shown = new THREE.Vector3(1, 1, 1), gone = new THREE.Vector3(0, 0, 0);
  const pose = (slot, scale) => new THREE.Matrix4().compose(base(slot).sub(origin), turn.setFromAxisAngle(up, slot.heading + Math.PI / 2), scale);
  const bikes = new THREE.Group(); bikes.name = 'Parked bikes'; group.add(bikes);
  const stands = racks.map(rack => {
    const slots = rackSlots(rack);
    const meshes = batches.map(({ geometry, material }) => {
      const mesh = new THREE.InstancedMesh(geometry, material, slots.length); mesh.name = rack.id;
      mesh.castShadow = false; mesh.receiveShadow = true; bikes.add(mesh); return mesh;
    });
    const proxy = new THREE.InstancedMesh(silhouette, shadowMaterial, slots.length); proxy.name = 'Parked bikes shadow';
    proxy.castShadow = true; proxy.receiveShadow = false; proxy.visible = false; proxy.onAfterShadow = hideAfterShadow;
    group.add(proxy); group.userData.shadowProxies.push(proxy);
    meshes.push(proxy);
    slots.forEach((slot, i) => { const matrix = pose(slot, shown); for (const mesh of meshes) mesh.setMatrixAt(i, matrix); });
    for (const mesh of meshes) mesh.computeBoundingSphere();
    return { slots, meshes };
  });

  const parked = stands.flatMap(({ slots }) => slots.map(() => true));
  group.userData.rack = {
    slots: parked.length,
    parked: () => parked.slice(),
    // Hide the bikes whose slots are taken (slot ids from the cycling snapshot); true when anything changed.
    setTaken(taken) {
      const held = new Set(taken ?? []); let changed = false, index = 0;
      for (const { slots, meshes } of stands) slots.forEach((slot, i) => {
        const show = !held.has(slot.id), k = index++;
        if (parked[k] === show) return;
        parked[k] = show; changed = true;
        const matrix = pose(slot, show ? shown : gone);
        for (const mesh of meshes) { mesh.setMatrixAt(i, matrix); mesh.instanceMatrix.needsUpdate = true; }
      });
      return changed;
    },
    // The world reload disposes the group's own geometries and materials (main.js); the source bike goes here.
    dispose: () => model.dispose(),
  };
  group.userData.counts = { racks: racks.length, rackSlots: parked.length, bikeBatches: batches.length };
  return group;
}
