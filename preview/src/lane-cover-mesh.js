import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { laneCover } from './lane-cover.js';
import { groundSurfaceHeight } from './world-surface.js';

// The south lane's service yard (lane-cover.js) as drawn: crate stacks two high and a
// roll-off container, filling exactly the boxes the walking model and police sight use.
// One merged mesh per material, so the yard costs three draws in view and none out of it.
const CRATE_HEIGHT = 0.95;
export function buildLaneCover(world) {
  const group = new THREE.Group(); group.name = 'Lane service yard';
  const pieces = laneCover(world);
  if (!pieces.length) return group;
  const groundAt = ([east, north]) => groundSurfaceHeight(world, east, -north);
  const origin = new THREE.Vector3(pieces[0].center[0], groundAt(pieces[0].center), -pieces[0].center[1]);
  group.position.copy(origin);
  const box = new THREE.BoxGeometry(1, 1, 1), wood = [], slats = [], steel = [];
  const add = (list, [east, y, north], [sx, sy, sz]) => list.push(box.clone().scale(sx, sy, sz).translate(east - origin.x, y - origin.y, -north - origin.z));
  for (const piece of pieces) {
    const [cx, cn] = piece.center, [sx, sn] = piece.size, base = groundAt(piece.center);
    if (piece.kind === 'container') {
      add(steel, [cx, base + piece.height / 2, cn], [sx, piece.height, sn]);
      // A lip around the open top and two lifting ribs on each long side.
      add(steel, [cx, base + piece.height - 0.04, cn], [sx + 0.08, 0.08, sn + 0.08]);
      for (const f of [-0.3, 0.3]) add(steel, [cx, base + piece.height / 2, cn + f * sn], [sx + 0.06, piece.height * 0.9, 0.08]);
      continue;
    }
    const long = sx >= sn ? 0 : 1, count = Math.max(1, Math.round((long ? sn : sx) / 1.2)), step = (long ? sn : sx) / count;
    for (let i = 0; i < count; i++) for (let level = 0; level < 2; level++) {
      const offset = -((long ? sn : sx) / 2) + step * (i + 0.5), at = long ? [cx, cn + offset] : [cx + offset, cn];
      const size = long ? [sx - 0.04, CRATE_HEIGHT - 0.02, step - 0.04] : [step - 0.04, CRATE_HEIGHT - 0.02, sn - 0.04];
      const y = base + CRATE_HEIGHT * (level + 0.5);
      add(wood, [at[0], y, at[1]], size);
      // Darker bands top and bottom of each crate.
      for (const band of [-0.4, 0.4]) add(slats, [at[0], y + band * CRATE_HEIGHT, at[1]], [size[0] + 0.02, 0.06, size[2] + 0.02]);
    }
  }
  const mesh = (list, color, name, roughness, metalness = 0) => {
    const object = new THREE.Mesh(mergeGeometries(list), new THREE.MeshStandardMaterial({ color, roughness, metalness }));
    object.name = name; object.castShadow = object.receiveShadow = true; group.add(object);
    list.forEach(geometry => geometry.dispose());
  };
  mesh(wood, '#8a6a45', 'Yard crates', 0.86);
  mesh(slats, '#4b3a28', 'Yard crate bands', 0.8);
  mesh(steel, '#2f4a3a', 'Yard roll-off container', 0.55, 0.45);
  box.dispose();
  group.userData.counts = { pieces: pieces.length };
  return group;
}
