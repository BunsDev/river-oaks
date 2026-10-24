import * as THREE from 'three';
import { createSpaceScene } from './studio/space-scene.js';
import { STREET } from './street-profile.js';

export const TERRACE_LIFT_M = 0.005;

// Draw an approved furnished space (#420) from its server plan with the reviewed Studio
// forms. The plan's objects are already in world metres, so this builds meshes only:
// collision, doors and routes come from the same plan through the walking contract.
// `part` is 'indoor' (streamed near the door), 'outdoor' (the terrace, always shown)
// or 'all'.
export function buildApprovedSpaceInterior(room, { part = 'all' } = {}) {
  const plan = room?.approvedSpace;
  if (plan?.kind !== 'approved-space' || plan.adapterVersion !== 1) throw new Error('This world needs a newer version of River Oaks');
  const objects = plan.space.objects.filter(item => part === 'all' || (part === 'outdoor') === Boolean(item.outdoor));
  const xs = objects.map(item => item.east), ys = objects.map(item => item.north);
  const bounds = objects.length ? [Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1] : [0, 0, 1, 1];
  const scene = createSpaceScene({ schema_version: 1, document_type: 'studio-space', name: plan.source.name, lighting: plan.space.lighting,
    bounds_m: bounds, spawn: plan.routes.arrival, objects });
  const group = new THREE.Group(); group.name = `Approved ${plan.source.name} ${part} (${plan.buildingId})`;
  // Creator regions draw their plaza paving STREET.plazaOffset above the terrain, and
  // visitors stand on it; the terrace stands on that paving. Studio floors hang below
  // their datum, so the terrace's top would be coplanar with the paving: lift it 5 mm
  // (#418's contact tolerance). Display only: collision and routes are the plan's.
  group.position.y = plan.levels[0].floorElevation + (part === 'outdoor' ? STREET.plazaOffset + TERRACE_LIFT_M : 0);
  // Studio's ground plane, sky fill and arrival marker belong to the editor, not the town.
  for (const name of ['@environment', 'Arrival']) scene.group.getObjectByName(name)?.removeFromParent();
  group.add(scene.group);
  if (part !== 'outdoor') {
    // Studio leaves the roof open for editing; in town the room has a plaster ceiling.
    const [a, b, , d] = plan.levels[0].rooms[0].footprint, width = Math.hypot(b[0] - a[0], b[1] - a[1]), depth = Math.hypot(d[0] - a[0], d[1] - a[1]);
    const ceiling = new THREE.Mesh(new THREE.BoxGeometry(width, 0.12, depth), new THREE.MeshStandardMaterial({ color: '#ece6da', roughness: 0.92 }));
    const center = plan.levels[0].rooms[0].footprint.reduce((sum, p) => [sum[0] + p[0] / 4, sum[1] + p[1] / 4], [0, 0]);
    ceiling.position.set(center[0], plan.levels[0].clearHeight + 0.06, -center[1]);
    ceiling.rotation.y = Math.atan2(b[1] - a[1], b[0] - a[0]);
    ceiling.name = 'Ceiling'; ceiling.receiveShadow = true; group.add(ceiling);
  }
  group.updateMatrixWorld(true);
  // Pendant lamps join the town's pooled interior lights instead of adding their own.
  const lights = [];
  group.traverse(node => { if (node.isPointLight) lights.push(node); });
  group.userData.lightPositions = lights.map(light => ({ room, position: light.getWorldPosition(new THREE.Vector3()) }));
  for (const light of lights) light.removeFromParent();
  group.userData.dispose = () => {
    const geometries = new Set(), materials = new Set();
    group.traverse(node => { if (node.geometry) geometries.add(node.geometry); for (const material of [node.material].flat()) if (material) materials.add(material); });
    // Textures stay: they belong to the shared PBR cache (materials.js).
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
    group.clear();
  };
  return group;
}
