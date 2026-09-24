import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { composeFrame, createRenderPipeline, OCCLUSION_CANDIDATE_REFRESH_MS } from '../src/render-pipeline.js';
import { shareSkeletons } from '../src/avatars.js';

function skinned(bones, inverses) {
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  mesh.bind(new THREE.Skeleton(bones, inverses?.map(matrix => matrix.clone())), new THREE.Matrix4());
  return mesh;
}

test('a skeleton uploads once per composed frame but explicit updates still run', () => {
  const skeleton = new THREE.Skeleton([new THREE.Bone()]);
  skeleton.computeBoneTexture();
  // Every recompute flags the bone texture for another GPU upload.
  const counting = () => { const before = skeleton.boneTexture.version; skeleton.update(); return skeleton.boneTexture.version - before; };
  const perPass = [];
  // Beauty, AO normals and refraction each call renderer.render().
  composeFrame(() => { for (let pass = 0; pass < 3; pass++) perPass.push(counting()); });
  assert.deepEqual(perPass, [1, 0, 0], 'later passes reuse the bone texture');
  composeFrame(() => { perPass.push(counting()); });
  assert.equal(perPass.at(-1), 1, 'the next animation frame recomputes');
  assert.equal(counting() + counting(), 2, 'head fit and hand contact measure fresh bones outside rendering');
});

test('body, clothing and hair clones share one skeleton when bound to the same bones', () => {
  const root = new THREE.Bone(), arm = new THREE.Bone(); root.add(arm);
  const inverses = [new THREE.Matrix4(), new THREE.Matrix4().makeTranslation(0, -1, 0)];
  const model = new THREE.Group();
  const body = skinned([root, arm], inverses), dress = skinned([root, arm], inverses), hair = skinned([root, arm], inverses);
  const prop = skinned([root, arm], [inverses[0], new THREE.Matrix4().makeTranslation(0, -2, 0)]);
  const stray = skinned([new THREE.Bone()]);
  model.add(root, body, dress, hair, prop, stray);
  const shared = shareSkeletons(model);
  assert.equal(dress.skeleton, body.skeleton);
  assert.equal(hair.skeleton, body.skeleton);
  assert.notEqual(prop.skeleton, body.skeleton, 'a different bind pose keeps its own skeleton');
  assert.notEqual(stray.skeleton, body.skeleton, 'different bones keep their own skeleton');
  assert.equal(shared.length, 3);
  assert.equal(body.bindMatrix.equals(new THREE.Matrix4()), true, 'bind matrices are untouched');
});

test('the AO pass hides excluded objects from a cached list that refreshes', () => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  let time = 0;
  const renderer = { capabilities: { maxSamples: 4 }, getPixelRatio: () => 1, shadowMap: { autoUpdate: true, needsUpdate: false }, autoClear: true,
    getClearColor: target => target, getClearAlpha: () => 1, setClearAlpha: () => {}, setClearColor: () => {}, setRenderTarget: () => {}, clear: () => {}, render: () => {} };
  const pipeline = createRenderPipeline(renderer, scene, camera, { now: () => time });
  const leaf = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()); leaf.userData.aoExclude = true; scene.add(leaf);
  const hiddenDuringPass = () => { const seen = []; renderer.render = () => scene.traverse(object => { if (object.isMesh && !object.visible) seen.push(object); }); pipeline.occlusion.render(renderer, { texture: {} }, { texture: {} }); return seen; };
  try {
    assert.deepEqual(hiddenDuringPass(), [leaf]);
    const late = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()); late.userData.aoExclude = true; scene.add(late);
    time += OCCLUSION_CANDIDATE_REFRESH_MS / 2;
    assert.deepEqual(hiddenDuringPass(), [leaf], 'no per-frame scene walk');
    time += OCCLUSION_CANDIDATE_REFRESH_MS;
    assert.deepEqual(hiddenDuringPass(), [leaf, late], 'late-loading foliage joins on refresh');
    const saucer = new THREE.Mesh(new THREE.PlaneGeometry(), new THREE.MeshBasicMaterial()); saucer.userData.aoExclude = true; scene.add(saucer);
    pipeline.refreshOcclusionCandidates();
    assert.equal(hiddenDuringPass().length, 3, 'an explicit refresh applies immediately');
    assert.ok(leaf.visible && late.visible && saucer.visible, 'visibility is restored after the pass');
  } finally { pipeline.dispose(); }
});

test('every shipped resident rig renders from one shared skeleton', async () => {
  const { loadCharacterRig } = await import('./helpers/character-rig.js');
  const { clone } = await import('three/addons/utils/SkeletonUtils.js');
  for (const profile of ['woman-casual', 'man-tailored', 'jevica']) {
    const model = clone((await loadCharacterRig(profile)).scene);
    const before = new Set(); model.traverse(item => { if (item.isSkinnedMesh) before.add(item.skeleton); });
    shareSkeletons(model);
    const after = new Set(); model.traverse(item => { if (item.isSkinnedMesh) after.add(item.skeleton); });
    assert.ok(before.size > 1, `${profile}: SkeletonUtils.clone splits the skeleton`);
    assert.equal(after.size, 1, `${profile}: one skeleton uploads per frame`);
  }
});
