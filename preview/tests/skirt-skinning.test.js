import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { loadCharacterRig } from './helpers/character-rig.js';
import { instantiateAvatar } from '../src/avatars.js';
import { createReferenceStyle } from '../src/reference-archetypes.js';
import { sharedAppearance } from '../src/shared-appearances.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { loadResidentAvatar } from '../src/avatars.js';
import { skirtContactFixture } from './helpers/skirt-contact.js';

for(const appearanceId of ['sable-human','woman-tailored'])test(`${appearanceId}: skirt covers actual upper thighs through opposing walking strides`,async()=>{
  const source=await loadCharacterRig('jevica'),avatar=instantiateAvatar(source,{targetHeight:1.685,id:'skirt-fixture'});
  const root=new THREE.Group();root.add(avatar.model);
  const look=createReferenceStyle(avatar,sharedAppearance(appearanceId)),model=avatar.model,body=model.getObjectByName('Jevica'),skirt=model.getObjectByName('Sable ivory mini dress')??model.getObjectByName('Vesper velvet wrap skirt');
  const point=new THREE.Vector3(),candidates=[];
  model.updateMatrixWorld(true);const pelvis=model.getObjectByName('pelvis');
  const restInverse=new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3())).invert();
  for(let i=0;i<body.geometry.attributes.position.count;i++){
    body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld).applyMatrix4(restInverse);
    if(point.y>-.075&&point.y<-.035&&Math.abs(point.x)>.04&&Math.abs(point.x)<.14&&point.z>.065)candidates.push(i);
  }
  assert.ok(candidates.length>20,`Actual thigh sample count: ${candidates.length}`);
  const left=model.getObjectByName('thigh_l'),right=model.getObjectByName('thigh_r');
  try{
    for(const transformed of [false,true])for(const angle of [0,.45,-.45,.75,-.75]){
      root.position.set(transformed?3:0,transformed?2:0,transformed?-5:0);root.rotation.y=transformed?.7:0;root.scale.setScalar(transformed?1.2:1);
      for(const [bone,sign] of [[left,1],[right,-1]])bone.quaternion.copy(avatar.rest.get(bone)).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone).x,angle*sign));
      root.updateMatrixWorld(true);look.update();skirt.computeBoundingSphere?.();let exposed=0;
      const forward=new THREE.Vector3(0,0,1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
      for(const i of candidates){
        body.getVertexPosition(i,point).applyMatrix4(body.matrixWorld);
        const ray=new THREE.Raycaster(point.clone().add(forward),forward.clone().negate(),0,1.002);
        if(!ray.intersectObject(skirt,false).length)exposed++;
      }
      assert.equal(exposed,0,`Transformed ${transformed}, stride ${angle}: ${exposed}/${candidates.length} thigh samples penetrate garment`);
    }
  }finally{look.dispose();avatar.dispose();}
});

for (const appearanceId of ['sable-human', 'woman-tailored']) test(`${appearanceId}: the skirt corrective follows symmetric and asymmetric bends under transformed roots`, async () => {
  const source = await loadCharacterRig('jevica'), avatar = instantiateAvatar(source, {targetHeight: 1.685, id: 'skirt-bends'});
  const root = new THREE.Group(); root.add(avatar.model);
  const look = createReferenceStyle(avatar, sharedAppearance(appearanceId));
  const model = avatar.model, body = model.getObjectByName('Jevica'), skirt = model.getObjectByName('Sable ivory mini dress') ?? model.getObjectByName('Vesper velvet wrap skirt');
  const contact = skirtContactFixture(model, body, skirt), originals = skirt.geometry.attributes.position.array.slice(), failures = [];
  try {
    for (const [left, right] of [[0, 0], [20, 20], [40, 40], [60, 60], [90, 90], [60, 90], [90, 60], [45, 90], [90, 45], [30, 90], [90, 30]]) {
      root.position.set(3, 2, -5); root.rotation.set(.1, .7, -.15); root.scale.setScalar(1.2);
      for (const [side, degrees] of [['l', left], ['r', right]]) for (const [name, sign] of [['thigh', -1], ['calf', 1]]) {
        const bone = model.getObjectByName(`${name}_${side}`);
        bone.quaternion.copy(avatar.rest.get(bone)).multiply(new THREE.Quaternion().setFromAxisAngle(avatar.axes.get(bone).x, sign * degrees * Math.PI / 180));
      }
      look.update();
      const result = contact.sample();
      assert(result.tested > 150);
      if (result.penetrating) failures.push({left, right, ...result});
      assert.deepEqual(skirt.geometry.attributes.position.array, originals, 'animation never rewrites rest vertices');
    }
    assert.deepEqual(failures, [], 'all tested bends clear the upper thighs');
  } finally { contact.dispose(); look.dispose(); avatar.dispose(); }
});

for (const appearanceId of ['sable-human', 'sable-human', 'woman-tailored', 'woman-tailored']) test(`${appearanceId}: the runtime seated skirt clears the actual upper thighs and restores standing`, async t => {
  const source = await loadCharacterRig('jevica'), previousLoad = GLTFLoader.prototype.loadAsync;
  const previousWindow = globalThis.window, previousDocument = globalThis.document;
  GLTFLoader.prototype.loadAsync = async () => ({scene: source.scene});
  globalThis.window = {matchMedia: () => ({matches: false})};
  globalThis.document = {createElement: () => ({getContext: () => new Proxy({}, {get: () => () => {}})})};
  t.after(() => { GLTFLoader.prototype.loadAsync = previousLoad; globalThis.window = previousWindow; globalThis.document = previousDocument; });
  const avatar = await loadResidentAvatar(4, 'remote-skirt-test', 'jevica', {folk: false, appearanceId, faceRecipe: {}});
  const model = avatar.rig.model, skirt = model.getObjectByName('Sable ivory mini dress') ?? model.getObjectByName('Vesper velvet wrap skirt'), body = model.getObjectByName('Jevica');
  const contact = skirtContactFixture(model, body, skirt);
  try {
    avatar.object.position.y = .55 - avatar.rig.hipHeight + .025;
    for (let frame = 0; frame <= 10; frame++) avatar.update(frame * 1000 / 60, 'continue', false, {speed: 0, distance: 0, riding: true, ridingKind: 'seat', seatToFloor: .55}, () => 0);
    avatar.object.updateMatrixWorld(true);
    const result = contact.sample();
    assert(result.tested > 200, 'a substantial front garment surface was tested');
    assert.equal(result.penetrating, 0, `seated garment crosses the upper thighs: ${JSON.stringify(result)}`);
    const trim = model.getObjectByName('Vesper wrap trim');
    if (['woman-tailored', 'woman-tailored'].includes(appearanceId)) assert(trim?.isSkinnedMesh, 'Vesper keeps her fitted decorative trim');
    if (trim) {
      assert.equal(trim.skeleton, skirt.skeleton, 'detail shares the garment skeleton');
      assert.equal(trim.morphTargetInfluences.length, 2);
      const vertices = Array.from({length: skirt.geometry.attributes.position.count}, (_, i) => skirt.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(skirt.matrixWorld));
      const triangles = Array.from({length: skirt.geometry.index.count / 3}, (_, n) => new THREE.Triangle(...[0, 1, 2].map(c => vertices[skirt.geometry.index.getX(n * 3 + c)])));
      const point = new THREE.Vector3(), closest = new THREE.Vector3();
      let maximumGap = 0;
      for (let i = 0; i < trim.geometry.attributes.position.count; i++) {
        trim.getVertexPosition(i, point).applyMatrix4(trim.matrixWorld);
        let distance = Infinity;
        for (const triangle of triangles) distance = Math.min(distance, triangle.closestPointToPoint(point, closest).distanceTo(point));
        maximumGap = Math.max(maximumGap, distance);
      }
      assert(maximumGap < .03, `wrap trim detached from seated cloth: ${maximumGap}m`);
      t.diagnostic(`Seated trim maximum surface offset: ${maximumGap}m`);
    }
    avatar.object.position.y = 0;
    avatar.update(1000, 'continue', false, {speed: 0, distance: 0}, () => 0);
    if (trim) assert(trim.morphTargetInfluences.every(value => value === 0), 'standing restores the decorative trim');
    assert(skirt.morphTargetInfluences.every(value => value === 0), 'standing restores the authored garment');
  } finally { contact.dispose(); avatar.dispose(); }
});
