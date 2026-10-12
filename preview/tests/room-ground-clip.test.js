import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { planStoreRooms, roomAt } from '../src/store-rooms.js';
import { terrainHeight } from '../src/geometry.js';
import { STREET } from '../src/street-profile.js';
import { createRoomGroundClip, insideRoomFootprint, roomMask, MASK_SLOTS } from '../src/room-ground-clip.js';
import { seeThroughNearCamera } from '../src/near-camera-fade.js';
import { buildRoads } from '../src/street-roads.js';
import { buildDesignatedSidewalks } from '../src/sidewalks.js';
import { createWalkingEnvironment } from '../src/walking.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const rooms = planStoreRooms(world);
let seed = 7; const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// The fragment test, evaluated on the mask and packed uniforms exactly as the shader does.
function shaderDiscards(clip, east, y, south) {
  const { uniforms, mask } = clip;
  if (uniforms.roRoomClip.value < 0.5) return false;
  const data = uniforms.roRoomData.value.image.data, north = -south, grid = uniforms.roRoomGrid.value;
  const i = Math.floor((east - grid.x) / grid.z), j = Math.floor((north - grid.y) / grid.z);
  if (!(i >= 0 && j >= 0 && i < mask.width && j < mask.height)) return false;
  const base = (j * mask.width + i) * 4;
  for (let k = 0; k < MASK_SLOTS; k++) {
    const id = mask.data[base + k] - 1;
    if (id < 0) break;
    const [fx, fn, rx, rn, a0, a1, depth, floor] = data.slice(id * 8, id * 8 + 8);
    const relE = east - grid.x - fx, relN = north - grid.y - fn, a = relE * rx + relN * rn, d = relE * -rn + relN * rx;
    if (a > a0 && a < a1 && d > 0 && d < depth && y > floor - 1) return true;
  }
  return false;
}

test('the outdoor ground really rises through many walk-in floors (the defect this clips)', () => {
  const poking = rooms.filter(room => {
    for (let a = room.aMin + 0.1; a < room.aMax; a += 0.25) for (let d = 0.1; d < room.depth; d += 0.25) {
      const [east, north] = room.toWorld(a, d);
      if (terrainHeight(world.terrain, east, north) + STREET.plazaOffset > room.floor + 0.012) return true;
    }
    return false;
  });
  assert.ok(poking.length >= 10, `${poking.length} rooms have ground above the floor`);
});

test('the clip covers each room footprint and nothing outside it, including the door throat', () => {
  const clip = createRoomGroundClip(rooms);
  let insideCount = 0, throat = 0;
  for (const room of rooms) for (let k = 0; k < 400; k++) {
    const a = room.aMin - 1 + random() * (room.width + 2), d = -1.5 + random() * (room.depth + 2.5), [east, north] = room.toWorld(a, d);
    // float32 GPU maths cannot resolve a footprint edge to better than ~1 mm.
    if (rooms.some(other => { const [oa, od] = other.toLocal(east, north); return Math.min(Math.abs(oa - other.aMin), Math.abs(oa - other.aMax), Math.abs(od), Math.abs(od - other.depth)) < 1e-3; })) continue;
    assert.equal(insideRoomFootprint(room, east, north), room.contains(east, north, 0), `${room.name} footprint at ${a.toFixed(2)},${d.toFixed(2)}`);
    const anyRoom = rooms.some(other => insideRoomFootprint(other, east, north));
    assert.equal(shaderDiscards(clip, east, room.floor + 0.05, -north), anyRoom, `${room.name}: shader and footprint disagree at ${a.toFixed(2)},${d.toFixed(2)}`);
    if (anyRoom) insideCount++;
    if (d < 0 && roomAt(rooms, east, north) && !anyRoom) throat++;
  }
  assert.ok(insideCount > 1000 && throat > 0, 'samples covered rooms and the outdoor door throat');
  clip.setEnabled(false);
  const [east, north] = rooms[0].toWorld(rooms[0].center, rooms[0].depth / 2);
  assert.equal(shaderDiscards(clip, east, rooms[0].floor, -north), false, 'hidden interiors leave the ground whole');
});

test('the clip chains onto existing shader hooks and patches the standard shader', () => {
  const clip = createRoomGroundClip(rooms);
  const material = seeThroughNearCamera(new THREE.MeshStandardMaterial());
  const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.PlaneGeometry(), material), new THREE.Mesh(new THREE.PlaneGeometry(), material));
  assert.equal(clip.apply(group), 1, 'a shared material is patched once');
  assert.equal(clip.apply(group), 1, 'and only once');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  assert.equal(shader.uniforms.roRoomData, clip.uniforms.roRoomData);
  assert.match(shader.fragmentShader, /texelFetch\(roRoomMask[\s\S]*texelFetch\(roRoomData/, 'one mask fetch, then the candidate rooms only');
  assert.doesNotMatch(shader.fragmentShader, /roRoomFrame\[|roRoomSpan\[/, 'no dynamically indexed uniform arrays');
  assert.doesNotMatch(shader.fragmentShader, new RegExp(`i < ${rooms.length}`));
  assert.match(shader.fragmentShader, /discard;[\s\S]*discard;/, 'both the near-camera fade and the room clip discard');
  assert.match(shader.vertexShader, /vRoRoomWorld = /);
  assert.match(material.customProgramCacheKey(), /ro-see-through-near-camera\|ro-room-ground-mask-30$/);
});

test('the mask names every room that covers a cell, so the exact test sees it', () => {
  const mask = roomMask(rooms);
  assert.equal(mask.overflow, 0, 'no cell touches more rooms than the mask holds');
  assert.ok(mask.width * mask.height <= 512 * 512, `a small mask (${mask.width} x ${mask.height})`);
  for (const [index, room] of rooms.entries()) for (let k = 0; k < 300; k++) {
    const [east, north] = room.toWorld(room.aMin + random() * room.width, random() * room.depth);
    const i = Math.floor((east - mask.west) / mask.cell), j = Math.floor((north - mask.south) / mask.cell), base = (j * mask.width + i) * 4;
    assert.ok([0, 1, 2, 3].some(slot => mask.data[base + slot] === index + 1), `${room.name} missing from its cell at ${east.toFixed(1)},${north.toFixed(1)}`);
  }
});

// main.js clips only the terrain surface; that is only safe while roads and
// sidewalks stay below every walk-in floor. If one ever rises into a room, this
// fails and the clip must be applied to it too.
test('roads and sidewalks never rise above a walk-in floor, so only the terrain needs the clip', () => {
  const environment = createWalkingEnvironment(world);
  const groups = { roads: buildRoads(world), sidewalks: buildDesignatedSidewalks(world, (x, z) => environment.isFree(x, z) && !environment.roomAt(x, z)) };
  for (const [name, group] of Object.entries(groups)) {
    let checked = 0;
    group.traverse(mesh => {
      if (!mesh.isMesh) return;
      const position = mesh.geometry.attributes.position;
      for (let i = 0; i < position.count; i++, checked++) {
        const x = position.getX(i), y = position.getY(i), z = position.getZ(i);
        for (const room of rooms) if (insideRoomFootprint(room, x, -z)) assert.ok(y <= room.floor + 0.012, `${name} rises ${(y - room.floor).toFixed(3)} m into ${room.name}`);
      }
    });
    assert.ok(checked > 1000, `${name} geometry was checked`);
  }
});
