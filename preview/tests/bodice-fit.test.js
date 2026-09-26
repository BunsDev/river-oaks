import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {loadCharacterRig} from './helpers/character-rig.js';
import {instantiateAvatar} from '../src/avatars.js';
import {createPlayerCostume} from '../src/player-costume.js';
import {createBodiceProbe} from '../e2e/fixtures/bodice-clearance.js';

test('Jevica bodice fits the bind-pose shoulder skin without changing the cached asset or garment topology',async()=>{
  const source=await loadCharacterRig('jevica'),original=source.scene.getObjectByName('Jevica_fitted_bodice').geometry;
  const positions=original.attributes.position.array.slice(),indices=original.index.array.slice();
  const rig=instantiateAvatar(source,{targetHeight:1.685}),object=new THREE.Group();object.add(rig.model);
  rig.model.traverse(bone=>{const original=source.scene.getObjectByName(bone.name);if(bone.isBone&&original)bone.quaternion.copy(original.quaternion);});
  const avatar={rig,object},before=createBodiceProbe(avatar)();
  assert.ok(before.minimumClearance<-.001,'The shipped source reproduces the skin overlap');
  const costume=createPlayerCostume(avatar,'jevica');
  try {
    const probe=createBodiceProbe(avatar),result=probe();
    assert.ok(result.checked>1000);assert.equal(result.uncovered,0);
    assert.ok(result.minimumClearance>.001,JSON.stringify(result));
    const fitted=rig.model.getObjectByName('Jevica_fitted_bodice').geometry;
    assert.notEqual(fitted,original);assert.deepEqual(fitted.index.array,indices);
    assert.deepEqual(original.attributes.position.array,positions);
    for(let i=0;i<fitted.attributes.skinWeight.count;i++) {
      const total=[0,1,2,3].reduce((sum,j)=>sum+fitted.attributes.skinWeight.getComponent(i,j),0);
      assert.ok(Math.abs(total-1)<1e-6,'Retargeted skin weights remain normalized');
    }
    let maximum=0;
    for(let i=0;i<positions.length;i+=3)maximum=Math.max(maximum,Math.hypot(...[0,1,2].map(j=>fitted.attributes.position.array[i+j]-positions[i+j])));
    assert.ok(maximum<.025,'Fit correction must retain the authored silhouette');
  } finally {costume.dispose();rig.dispose();}
});
