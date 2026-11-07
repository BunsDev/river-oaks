import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { exclusiveResources } from '../src/figure-resources.js';
import { FIGURE_GEOMETRIES, FIGURE_LISTENERS, FIGURE_TEXTURES, restoreBounds, withinResourceBounds } from '../e2e/resource-bounds.js';

const mesh = (geometry = new THREE.BufferGeometry(), map = new THREE.Texture()) => new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map }));

// The renderer adds one disposal listener to each resource it draws; model that for a scene.
const draw = scene => {
  const seen = new Set();
  scene.traverse(object => {
    const materials = [object.material].flat().filter(Boolean);
    for (const resource of [object.geometry, object.skeleton?.boneTexture, ...materials, ...materials.flatMap(material => Object.values(material).filter(value => value?.isTexture))])
      if (resource && !seen.has(resource)) { seen.add(resource); resource.addEventListener('dispose', () => {}); }
  });
};

test('a figure counts only what nothing else in the scene uses', () => {
  const sharedGeometry = new THREE.BufferGeometry(), sharedMap = new THREE.Texture();
  const scene = new THREE.Scene(), player = mesh(sharedGeometry, sharedMap);
  const figure = new THREE.Group();
  figure.add(mesh(sharedGeometry, sharedMap), mesh(), mesh());
  scene.add(player, figure);
  draw(scene);
  // Own: two geometries, two maps, and the three materials (one per mesh, the look-sharing one included).
  // The maps are the look's, so they count for listeners and not as textures.
  assert.deepEqual(exclusiveResources(scene, [figure]), { figures: 1, geometries: 2, textures: 0, listeners: 7 });
  assert.deepEqual(exclusiveResources(scene, []), { figures: 0, geometries: 0, textures: 0, listeners: 0 });
});

test('a figure not shown excuses nothing, so a real step cannot pass behind the camera', () => {
  const scene = new THREE.Scene(), figure = new THREE.Group();
  figure.add(mesh(), mesh());
  figure.visible = false;
  scene.add(figure);
  assert.deepEqual(exclusiveResources(scene, [figure]), { figures: 0, geometries: 0, textures: 0, listeners: 0 });
});

test('two figures sharing a look count it once; a drawn scene object claims it, a hidden one does not', () => {
  const look = new THREE.BufferGeometry(), map = new THREE.Texture(), own = new THREE.BufferGeometry();
  const scene = new THREE.Scene(), a = new THREE.Group(), b = new THREE.Group();
  a.add(mesh(look, map), mesh(own, map)); b.add(mesh(own, map));
  scene.add(a, b);
  draw(scene);
  assert.deepEqual(exclusiveResources(scene, [a, b]), { figures: 2, geometries: 2, textures: 0, listeners: 6 });
  // A boutique guest wearing the same look behind a hidden interior never draws it.
  const interior = new THREE.Group(), guest = mesh(look, map);
  interior.visible = false; interior.add(guest); scene.add(interior);
  assert.deepEqual(exclusiveResources(scene, [a, b]), { figures: 2, geometries: 2, textures: 0, listeners: 6 });
  interior.visible = true;
  assert.deepEqual(exclusiveResources(scene, [a, b]), { figures: 2, geometries: 1, textures: 0, listeners: 4 });
});

test("a figure's material textures are its look's, uploaded once for everyone wearing it, so none is its own", () => {
  const scene = new THREE.Scene(), figure = new THREE.Group();
  figure.add(mesh(), mesh());
  scene.add(figure);
  draw(scene);
  const { textures, listeners } = exclusiveResources(scene, [figure]);
  assert.deepEqual({ textures, listeners }, { textures: 0, listeners: 6 }, 'their listeners still count');
});

const morphing = () => {
  const geometry = new THREE.BufferGeometry();
  geometry.morphAttributes.position = [new THREE.Float32BufferAttribute([0, 0, 0], 3)];
  return geometry;
};

test('a morph-target texture counts once three has drawn its geometry, and only for a geometry the figure alone holds', () => {
  const scene = new THREE.Scene(), figure = new THREE.Group(), face = morphing(), shared = morphing();
  figure.add(mesh(face), mesh(shared), mesh());
  scene.add(figure, mesh(shared));
  assert.equal(exclusiveResources(scene, [figure]).textures, 0, 'not drawn yet');
  draw(scene);
  assert.equal(exclusiveResources(scene, [figure]).textures, 1, 'the face alone: the player draws the other');
});

const state = (geometries, textures, figures = 0, figureGeometries = 0, figureTextures = 0, objects = 9000) => ({ objects, renderer: { geometries, textures }, residentResources: { figures, geometries: figureGeometries, textures: figureTextures } });

test('the bound ignores a resident swing, and still catches anything retained', () => {
  const baseline = [state(769, 278)];
  // Raw evicted counts on 2026-11-04: 769/278 with no figures, 832/289 with three.
  assert.equal(withinResourceBounds([state(832, 289, 3, 63, 11)], baseline), true, 'three residents walked by');
  assert.equal(withinResourceBounds([state(832, 289)], baseline), false, 'the same raw count with no figures is retention');
  assert.equal(withinResourceBounds([state(790, 278)], baseline), false, '+21 geometries');
  assert.equal(withinResourceBounds([state(789, 288)], baseline), true, 'exactly at both limits');
  assert.equal(withinResourceBounds([state(769, 289)], baseline), false, '+11 textures');
  assert.equal(withinResourceBounds([state(769, 278, 0, 0, 0, 9021)], baseline), false, '+21 objects');
  assert.equal(withinResourceBounds([state(860, 289, 3, 63, 11)], baseline), false, 'figures plus 28 retained geometries');
  assert.equal(withinResourceBounds([state(769, 278)], [state(832, 289, 3, 63, 11)]), true, 'a baseline taken with figures is compared without them');
});

test('a live figure excuses only what one was measured to add', () => {
  const baseline = [state(769, 278)];
  assert.equal(withinResourceBounds([state(769 + FIGURE_GEOMETRIES + 20, 278, 1, FIGURE_GEOMETRIES)], baseline), true);
  assert.equal(withinResourceBounds([state(769 + 60, 278, 1, 60)], baseline), false, 'one figure holding 60 geometries has grown');
  assert.equal(withinResourceBounds([state(769, 278 + 20, 1, 0, 20)], baseline), false, 'one figure holding 20 textures has grown');
});

test("a figure's listeners are the ones on resources only it holds, its bone texture included", () => {
  const sharedGeometry = new THREE.BufferGeometry(), sharedMap = new THREE.Texture();
  const scene = new THREE.Scene(), player = mesh(sharedGeometry, sharedMap), figure = new THREE.Group();
  const bone = new THREE.Bone(), skinned = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  skinned.add(bone); skinned.bind(new THREE.Skeleton([bone])); skinned.skeleton.computeBoneTexture();
  figure.add(mesh(sharedGeometry, sharedMap), mesh(), skinned);
  scene.add(player, figure);
  draw(scene);
  sharedGeometry.addEventListener('dispose', () => {});
  // Own: one geometry, map and material in mesh(); geometry, material and bone texture in the skinned
  // mesh; and the material of the mesh that shares the player's look. The extra listener on the shared
  // geometry is not the figure's. Of the textures, only the bone texture is the figure's own.
  assert.deepEqual(exclusiveResources(scene, [figure]), { figures: 1, geometries: 2, textures: 1, listeners: 7 });
  figure.visible = false;
  assert.deepEqual(exclusiveResources(scene, [figure]), { figures: 0, geometries: 0, textures: 0, listeners: 0 });
});

// An avatar like resident-figures.js builds: body parts sharing one skeleton (avatar-skeletons.js)
// and a head bound to its own two-bone gaze skeleton (eye-tracking.js).
const avatar = () => {
  const figure = new THREE.Group(), root = new THREE.Bone(), eyes = [new THREE.Bone(), new THREE.Bone()];
  const body = new THREE.Skeleton([root, ...Array.from({ length: 40 }, () => new THREE.Bone())]);
  const parts = [0, 1, 2].map(() => new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial()));
  parts.forEach(part => part.bind(body)); parts[2].bind(new THREE.Skeleton(eyes));
  figure.add(root, ...parts);
  return { figure, body, gaze: parts[2].skeleton };
};

test("a figure's bone textures are textures it alone holds, once three has drawn its skeletons", () => {
  const scene = new THREE.Scene(), { figure, body, gaze } = avatar();
  scene.add(figure);
  // three creates and uploads a skeleton's bone texture on its first draw.
  assert.equal(exclusiveResources(scene, [figure]).textures, 0);
  body.computeBoneTexture(); gaze.computeBoneTexture(); draw(scene);
  assert.deepEqual([body.boneTexture.image.width, gaze.boneTexture.image.width], [16, 4]);
  assert.equal(exclusiveResources(scene, [figure]).textures, 2, 'one for the shared body skeleton, one for the gaze');
  // A drawn object outside the figures bound to the same skeleton keeps its bone texture counted.
  const mirror = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial());
  mirror.bind(body); scene.add(mirror);
  assert.equal(exclusiveResources(scene, [figure]).textures, 1);
  mirror.visible = false;
  assert.equal(exclusiveResources(scene, [figure]).textures, 2);
});

test('the streaming bound leaves out what the shown figures add, and still catches a retained texture', () => {
  // 2026-11-07, client 1 evicted: 267 textures with no figure shown, 272 on lap 2 with two figures
  // and 279 on lap 19 with three.
  const baseline = [state(718, 272, 2, 0, 5)];
  assert.equal(withinResourceBounds([state(718, 279, 3, 0, 12)], baseline), true, 'three figures adding 12');
  assert.equal(withinResourceBounds([state(718, 267)], baseline), true, 'no figure shown');
  assert.equal(withinResourceBounds([state(718, 267 + 10)], baseline), true, 'exactly at the limit');
  assert.equal(withinResourceBounds([state(718, 267 + 11)], baseline), false, '+11 textures with no figure shown');
  assert.equal(withinResourceBounds([state(718, 279 + 11, 3, 0, 12)], baseline), false, '+11 textures beside three figures');
  assert.equal(withinResourceBounds([state(718, 267 + FIGURE_TEXTURES + 11, 1, 0, FIGURE_TEXTURES + 11)], baseline), false, 'one figure cannot excuse more than its cap');
});

const sample = (geometries, textures, listeners, figures = 0, figureGeometries = 0, figureTextures = 0, figureListeners = 0) =>
  ({ memory: { geometries, textures }, listeners, residentResources: { figures, geometries: figureGeometries, textures: figureTextures, listeners: figureListeners } });

test('across restores a resident walking in passes, and a listener or resource leak still fails', () => {
  const first = sample(723, 214, 2553);
  // 2026-11-06 on #885: +2 geometries and +2 listeners on cycles 2 and 3, with no scene change.
  assert.deepEqual(restoreBounds([first, sample(725, 214, 2555, 1, 2, 0, 2), sample(723, 214, 2545)]), { listeners: true, memory: true });
  assert.deepEqual(restoreBounds([first, sample(725, 214, 2555)]), { listeners: false, memory: false }, 'the same step with no figure shown');
  assert.deepEqual(restoreBounds([first, sample(723, 214, 2574), sample(723, 214, 2595)]), { listeners: false, memory: true }, '21 listeners per restore (the control)');
  assert.deepEqual(restoreBounds([first, sample(725, 214, 2576, 1, 2, 0, 2)]), { listeners: false, memory: true }, 'a leak riding along with a figure');
  assert.deepEqual(restoreBounds([first, sample(726, 214, 2556, 1, 2, 0, 2)]), { listeners: false, memory: false }, 'a retained geometry beside a figure');
  assert.deepEqual(restoreBounds([sample(725, 214, 2555, 1, 2, 0, 2), sample(723, 214, 2553)]), { listeners: true, memory: true }, 'a figure shown only in the first sample');
});

test('a live figure excuses no more listeners than one was measured to hold', () => {
  const first = sample(723, 214, 2553);
  assert.equal(restoreBounds([first, sample(723, 214, 2553 + FIGURE_LISTENERS, 1, 0, 0, FIGURE_LISTENERS)]).listeners, true);
  assert.equal(restoreBounds([first, sample(723, 214, 2553 + FIGURE_LISTENERS + 21, 1, 0, 0, FIGURE_LISTENERS + 21)]).listeners, false, 'listeners growing inside a figure');
});
