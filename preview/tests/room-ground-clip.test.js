import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { planStoreRooms, roomAt } from '../src/store-rooms.js';
import { terrainHeight } from '../src/geometry.js';
import { STREET } from '../src/street-profile.js';
import { createRoomGroundClip, insideRoomFootprint } from '../src/room-ground-clip.js';
import { seeThroughNearCamera } from '../src/near-camera-fade.js';

const world = JSON.parse(readFileSync(new URL('../public/data/district.json', import.meta.url)));
const rooms = planStoreRooms(world);
let seed = 7; const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;

// The fragment test, evaluated on the packed uniforms exactly as the shader does.
function shaderDiscards(uniforms, east, y, south) {
  if (uniforms.roRoomClip.value < 0.5) return false;
  const frame = uniforms.roRoomFrame.value, span = uniforms.roRoomSpan.value, north = -south;
  for (let i = 0; i < frame.length / 4; i++) {
    const [fx, fn, rx, rn] = frame.slice(i * 4, i * 4 + 4), [a0, a1, depth, floor] = span.slice(i * 4, i * 4 + 4);
    const relE = east - fx, relN = north - fn, a = relE * rx + relN * rn, d = relE * -rn + relN * rx;
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
    assert.equal(insideRoomFootprint(room, east, north), room.contains(east, north, 0), `${room.name} footprint at ${a.toFixed(2)},${d.toFixed(2)}`);
    const anyRoom = rooms.some(other => insideRoomFootprint(other, east, north));
    assert.equal(shaderDiscards(clip.uniforms, east, room.floor + 0.05, -north), anyRoom, `${room.name}: shader and footprint disagree at ${a.toFixed(2)},${d.toFixed(2)}`);
    if (anyRoom) insideCount++;
    if (d < 0 && roomAt(rooms, east, north) && !anyRoom) throat++;
  }
  assert.ok(insideCount > 1000 && throat > 0, 'samples covered rooms and the outdoor door throat');
  clip.setEnabled(false);
  const [east, north] = rooms[0].toWorld(rooms[0].center, rooms[0].depth / 2);
  assert.equal(shaderDiscards(clip.uniforms, east, rooms[0].floor, -north), false, 'hidden interiors leave the ground whole');
});

test('the clip chains onto existing shader hooks and patches the standard shader', () => {
  const clip = createRoomGroundClip(rooms);
  const material = seeThroughNearCamera(new THREE.MeshStandardMaterial());
  const group = new THREE.Group(); group.add(new THREE.Mesh(new THREE.PlaneGeometry(), material), new THREE.Mesh(new THREE.PlaneGeometry(), material));
  assert.equal(clip.apply(group), 1, 'a shared material is patched once');
  assert.equal(clip.apply(group), 1, 'and only once');
  const shader = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader };
  material.onBeforeCompile(shader, null);
  assert.equal(shader.uniforms.roRoomFrame, clip.uniforms.roRoomFrame);
  assert.match(shader.fragmentShader, new RegExp(`uniform vec4 roRoomSpan\\[${rooms.length}\\]`));
  assert.match(shader.fragmentShader, /discard;[\s\S]*discard;/, 'both the near-camera fade and the room clip discard');
  assert.match(shader.vertexShader, /vRoRoomWorld = /);
  assert.match(material.customProgramCacheKey(), /ro-see-through-near-camera\|ro-room-ground-clip-30$/);
});
