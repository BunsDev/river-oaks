import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadDistrictData } from '../../server/district-data.js';
import { buildEastGardenCommons } from '../src/east-garden-commons.js';

test('eviction disposes loaded landscape buffers and materials without destroying cached textures', async () => {
  const world = await loadDistrictData({districtRevision:'east-garden-commons-market-1'});
  const group = buildEastGardenCommons(world.eastGardenCommons);
  let trees; group.traverse(item => { if (item.name.endsWith(' trees')) trees = item; });
  const geometry = new THREE.BoxGeometry(), texture = new THREE.Texture(), material = new THREE.MeshStandardMaterial({map:texture});
  const mesh = new THREE.InstancedMesh(geometry, material, 2); trees.add(mesh);
  const events = {geometry:0,material:0,mesh:0,texture:0};
  for (const [name,item] of Object.entries({geometry,material,mesh,texture})) item.addEventListener('dispose',()=>events[name]++);
  group.userData.dispose(); group.userData.dispose();
  assert.deepEqual(events,{geometry:1,material:1,mesh:1,texture:0});
});
