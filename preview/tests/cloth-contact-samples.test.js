import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import * as sampler from '../src/skinned-vertex-sampler.js';
import { loadCharacterRig } from './helpers/character-rig.js';

const select = (geometry, indices) => {
  assert.equal(typeof sampler.createUniqueSkinnedVertexSamples, 'function', 'Contact sampling can reuse identical deformations');
  return sampler.createUniqueSkinnedVertexSamples(geometry, indices);
};
function fixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute([1,2,3, 1,2,3, 1,2,3], 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([0,0,0,0, 0,0,0,0, 1,0,0,0], 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([1,0,0,0, 1,0,0,0, 1,0,0,0], 4));
  return geometry;
}
test('contact samples only combine vertices with identical position, influences and every position morph', () => {
  const geometry = fixture(), indices = [0,1,2];
  assert.deepEqual(select(geometry,indices)(geometry), [0,2]);
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0,0,0, 0,.1,0, 0,0,0],3)];
  assert.deepEqual(select(geometry,indices)(geometry), indices, 'A morph can separate coincident vertices');
  geometry.morphAttributes.position = [];
  geometry.attributes.skinWeight.setX(1,.5);
  assert.deepEqual(select(geometry,indices)(geometry), indices, 'Different weights must remain independent');
});
test('changed geometry or deformation attributes fall back to all original samples', () => {
  for (const mutate of [
    g => g.attributes.position.needsUpdate = true,
    g => g.attributes.skinIndex.needsUpdate = true,
    g => g.attributes.skinWeight.needsUpdate = true,
    g => g.setAttribute('position',g.attributes.position.clone()),
    g => g.attributes.position.array = g.attributes.position.array.slice(),
    g => g.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(9),3)],
  ]) {
    const geometry=fixture(),indices=[0,1,2],samples=select(geometry,indices);
    assert.deepEqual(samples(geometry),[0,2]);mutate(geometry);
    assert.deepEqual(samples(geometry),indices);
  }
  const geometry=fixture(),indices=[0,1,2],samples=select(geometry,indices);
  assert.deepEqual(samples(geometry.clone()),indices);
});
test('the shipped cloth contact set loses only redundant positions across poses and morphs',async()=>{
  const {scene}=await loadCharacterRig('jevica'),body=scene.getObjectByName('Jevica'),geometry=body.geometry;
  const bones=new Set(body.skeleton.bones.flatMap((b,i)=>/^(spine_01|pelvis|thigh_|calf_)/.test(b.name)?[i]:[]));
  const indices=[];
  for(let i=0;i<geometry.attributes.skinIndex.count;i++)
    if([0,1,2,3].some(j=>bones.has(geometry.attributes.skinIndex.getComponent(i,j))&&geometry.attributes.skinWeight.getComponent(i,j)>.05))indices.push(i);
  const unique=select(geometry,indices)(geometry);
  assert.ok(unique.length<indices.length*.9,'Remove repeated skin samples from the actual shipped rig');
  const point=new THREE.Vector3();
  for(let frame=0;frame<4;frame++) {
    scene.rotation.y=frame*.7;scene.getObjectByName('thigh_l').rotation.x=frame*.3;
    body.morphTargetInfluences.fill(frame/4);scene.updateMatrixWorld(true);
    const positions=new Set(unique.map(i=>body.getVertexPosition(i,point).toArray().join(',')));
    for(const i of indices)assert.ok(positions.has(body.getVertexPosition(i,point).toArray().join(',')),`Pose ${frame}, vertex ${i} retained`);
  }
});
