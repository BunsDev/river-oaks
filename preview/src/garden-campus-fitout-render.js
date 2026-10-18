// The Gardens' fit-out, drawn (#510): every suite's desks, chairs and meeting tables on
// their own floor, and the halls' and café's tables, counters, workbenches and seats, from
// shared/garden-campus-fitout.js and nothing else. Collision footprints are drawn as the
// furniture's own extent; chairs are drawn at their seat positions. Desk monitors use one
// dark, neutral screen material: nothing anyone writes at a desk is ever drawn in 3D.
//
// One root in campus metres (x = u, y = z, -z = v), turned onto the plot's grid bearing
// like garden-campus.js, and one instanced draw per finish. Never registered as ground.
import * as THREE from 'three';
import { GARDEN_CAMPUS_LAYOUT as CAMPUS, campusLevels, campusToScene } from '../../shared/garden-campus-layout.js';
import { campusFitout } from '../../shared/garden-campus-fitout.js';

const LEG = 0.05, TOP = 0.04, SCREEN = { w: 0.55, h: 0.34, d: 0.03 };

/** The fit-out as a Three.js group with dispose(); null without the campus. */
export function buildGardenCampusFitout(world) {
  if (!world?.gardenCampus) return null;
  const root = new THREE.Group();root.name = 'The Gardens fit-out';
  const [x0, y0, z0] = campusToScene([0, 0, 0]), east = CAMPUS.frame.east;
  root.position.set(x0, y0, z0);root.rotation.y = Math.atan2(east[1], east[0]);
  const materials = {
    walnut: new THREE.MeshStandardMaterial({ name: 'campus-fitout:walnut', color: '#6b4a32', roughness: 0.6 }),
    oak: new THREE.MeshStandardMaterial({ name: 'campus-fitout:oak', color: '#b08a5a', roughness: 0.66 }),
    frame: new THREE.MeshStandardMaterial({ name: 'campus-fitout:frame', color: '#2f2f2c', metalness: 0.5, roughness: 0.45 }),
    fabric: new THREE.MeshStandardMaterial({ name: 'campus-fitout:fabric', color: '#5d6b5a', roughness: 0.95 }),
    stone: new THREE.MeshStandardMaterial({ name: 'campus-fitout:stone', color: '#d8cfbf', roughness: 0.5 }),
    screen: new THREE.MeshStandardMaterial({ name: 'campus-fitout:screen', color: '#111416', metalness: 0.2, roughness: 0.35 }),
  };
  const batches = new Map(Object.keys(materials).map(key => [key, []]));
  const box = (finish, u0, v0, u1, v1, za, zb) => { if (u1 - u0 > 1e-6 && v1 - v0 > 1e-6 && zb - za > 1e-6) batches.get(finish).push([u0, v0, u1, v1, za, zb]); };
  const legs = (rect, z, top) => { const [u0, v0, u1, v1] = rect;for (const [u, v] of [[u0, v0], [u1 - LEG, v0], [u0, v1 - LEG], [u1 - LEG, v1 - LEG]]) box('frame', u, v, u + LEG, v + LEG, z, z + top - TOP); };
  const table = (rect, z, height, finish) => { legs(rect, z, height);box(finish, rect[0], rect[1], rect[2], rect[3], z + height - TOP, z + height); };
  const chair = ([u, v], facing, z, height = 0.5) => {
    box('fabric', u - 0.24, v - 0.24, u + 0.24, v + 0.24, z + height - 0.08, z + height);
    box('frame', u - 0.03, v - 0.03, u + 0.03, v + 0.03, z, z + height - 0.08);
    // The back stands behind the sitter: opposite the way the seat faces.
    const [bu, bv] = [u - facing[0] * 0.22, v - facing[1] * 0.22], wide = Math.abs(facing[0]) > 0.5;
    wide ? box('fabric', bu - 0.03, bv - 0.24, bu + 0.03, bv + 0.24, z + height, z + height + 0.45) : box('fabric', bu - 0.24, bv - 0.03, bu + 0.24, bv + 0.03, z + height, z + height + 0.45);
  };
  const levels = new Map(campusLevels().map(level => [level.id, level.z]));
  const fitout = campusFitout();
  for (const entry of fitout.levels) {
    const z = levels.get(entry.levelId);
    for (const item of entry.obstacles) {
      if (item.kind === 'desk') {
        table(item.rect, z, item.height, 'walnut');
        // One neutral monitor at the desk's back edge, toward the far wall it faces.
        const [u0, v0, u1, v1] = item.rect, cu = (u0 + u1) / 2, cv = (v0 + v1) / 2, seat = entry.seats.find(s => s.workstation === item.id);
        const back = seat ? cu - seat.facing[0] * -0.25 : cu;
        box('screen', back - SCREEN.d / 2, cv - SCREEN.w / 2, back + SCREEN.d / 2, cv + SCREEN.w / 2, z + item.height + 0.12, z + item.height + 0.12 + SCREEN.h);
        box('frame', back - 0.02, cv - 0.02, back + 0.02, cv + 0.02, z + item.height, z + item.height + 0.12);
      } else if (item.kind === 'table') table(item.rect, z, item.height, 'oak');
    }
    for (const seat of entry.seats) chair(seat.position, seat.facing, z, seat.height);
  }
  for (const room of fitout.ground) {
    for (const item of room.obstacles) {
      if (item.kind === 'counter') box('stone', item.rect[0], item.rect[1], item.rect[2], item.rect[3], 0, item.height);
      else table(item.rect, 0, item.height, item.kind === 'workbench' ? 'walnut' : 'oak');
    }
    for (const seat of room.seats) chair(seat.position, seat.facing, 0, seat.height);
  }

  const unit = new THREE.BoxGeometry(1, 1, 1), dummy = new THREE.Object3D(), meshes = [];
  for (const [finish, parts] of batches) {
    if (!parts.length) continue;
    const mesh = new THREE.InstancedMesh(unit, materials[finish], parts.length);mesh.name = `campus-fitout:${finish}`;
    parts.forEach(([u0, v0, u1, v1, za, zb], index) => {
      dummy.position.set((u0 + u1) / 2, (za + zb) / 2, -(v0 + v1) / 2);dummy.scale.set(u1 - u0, zb - za, v1 - v0);dummy.updateMatrix();mesh.setMatrixAt(index, dummy.matrix);
    });
    mesh.castShadow = finish !== 'screen';mesh.receiveShadow = true;root.add(mesh);meshes.push(mesh);
  }
  root.userData.counts = Object.fromEntries([...batches].map(([finish, parts]) => [finish, parts.length]));
  root.userData.dispose = () => { for (const mesh of meshes) mesh.dispose();unit.dispose();Object.values(materials).forEach(material => material.dispose()); };
  return root;
}
