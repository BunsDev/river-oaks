import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createSharedBuildLayer } from '../src/shared-build-layer.js';
import { BUILD_KINDS, BUILD_FINISHES } from '../src/shared-build.js';

test('every build catalog choice creates a bounded, grounded 3D object',()=>{
  const scene=new THREE.Scene(),layer=createSharedBuildLayer(scene);
  const items=BUILD_KINDS.flatMap((kind,index)=>BUILD_FINISHES.map((finish,variant)=>({
    id:`build-${1+index*4+variant}`,ownerId:'alice',ownerName:'Alice',kind:kind.id,finish:finish.id,
    position:[index*4,variant*4],ground:1.25,yaw:0,createdAt:index*4+variant,
  })));
  layer.sync(items);
  assert.equal(layer.stats().count,items.length);
  for(const entry of layer.object.children){
    const bounds=new THREE.Box3().setFromObject(entry);
    assert.ok(bounds.max.y-bounds.min.y>.3);
    assert.ok(Number.isFinite(bounds.min.x)&&Number.isFinite(bounds.max.z));
    assert.equal(entry.userData.build.ownerId,'alice');
  }
  const first=layer.object.children[0],before=first.children[0].geometry;
  layer.sync([{...items[0],position:[8,7],yaw:Math.PI/2},items[1]]);
  assert.equal(layer.stats().count,2);
  assert.equal(layer.object.children[0],first,'edits reuse the rendered model');
  assert.equal(first.children[0].geometry,before,'snapshot changes reuse catalog geometry');
  assert.deepEqual(first.position.toArray(),[8,1.25,-7]);
  layer.update(new THREE.Vector3(999,0,999));assert.equal(layer.stats().visible,0);
  layer.sync([]);assert.equal(layer.stats().count,0);
  layer.dispose();assert.equal(scene.children.length,0);
});
