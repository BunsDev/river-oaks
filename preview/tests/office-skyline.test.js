import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOfficeSkyline, officeSkylineEye, officeSkylineSize } from '../src/office-skyline.js';
import { captureOfficeStreet } from '../src/office-world-presentation.js';
import { createOfficeWorldScene } from '../src/office-world-scene.js';
import { officeLayout, OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE } from '../src/office-layouts.js';

// A renderer that records every draw: enough of the WebGLRenderer surface for the capture,
// with no GPU. `onRender` sees each district face (drawn into the capture's temporary 2D
// target); `onCopy` sees each copy of a face into the resident cube.
function fakeRenderer(onRender = () => {}, onCopy = () => {}) {
  let target = null, face = 0, level = 0;
  const watched = new WeakSet();
  return {
    coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: false }, autoClear: false,
    shadowMap: { autoUpdate: true, needsUpdate: false }, renders: [], disposed: new Set(),
    getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => level,
    setRenderTarget(next, nextFace = 0, nextLevel = 0) {
      target = next; face = nextFace; level = nextLevel;
      if (next && !watched.has(next)) { watched.add(next); next.addEventListener('dispose', () => this.disposed.add(next)); }
    },
    // The first draw compiles one shader program; a capture must never wait on the GPU.
    info: { programs: [] }, finished: 0,
    render(scene, camera) {
      if (!this.renders.length) this.info.programs.push({});
      const draw = { face, level, target, scene, view: camera.matrixWorld.clone(), projection: camera.projectionMatrix.clone(), autoClear: this.autoClear, shadows: this.shadowMap.autoUpdate, xr: this.xr.enabled };
      // A copy's material, and the texture it samples as it is drawn.
      if (target?.isWebGLCubeRenderTarget) { draw.material = scene.children[0]?.material; draw.sampled = draw.material?.uniforms?.face?.value ?? null; }
      this.renders.push(draw);
      if (target?.isWebGLCubeRenderTarget) onCopy(draw); else onRender(scene, camera);
    },
    getContext() { return { finish: () => { this.finished++; } }; },
  };
}
// The district faces, and the copies into the cube's faces.
const faces = renderer => renderer.renders.filter(draw => !draw.target?.isWebGLCubeRenderTarget);
const copies = renderer => renderer.renders.filter(draw => draw.target?.isWebGLCubeRenderTarget);
const closeMatrix = (actual, expected, message) => assert.ok(actual.elements.every((value, i) => Math.abs(value - expected.elements[i]) < 1e-9), `${message}: ${actual.elements} vs ${expected.elements}`);

// A district with one instanced facade batch: the host tower's curtain wall above
// the office floor, its podium below, and a neighbour's tower at the same height.
function district({ floorY = 30 } = {}) {
  const scene = new THREE.Scene(), group = new THREE.Group(), stage = new THREE.Group(), body = new THREE.Group();
  scene.add(group, stage, body);
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 3), part = new THREE.Object3D();
  const place = (index, [x, y, z], height) => { part.position.set(x, y, z); part.scale.set(1, height, 1); part.updateMatrix(); mesh.setMatrixAt(index, part.matrix); };
  place(0, [0, floorY + 1, 0], 4);       // host mullion reaching above the office floor
  place(1, [0, floorY - 10, 0], 4);      // host podium band, wholly below the floor
  place(2, [40, floorY + 1, 0], 4);      // a neighbour at the same height
  mesh.userData.buildingIndices = [0, 0, 1];
  const mass = new THREE.Mesh(new THREE.BoxGeometry(10, 28, 10), new THREE.MeshStandardMaterial());
  mass.position.y = floorY - 10; mass.userData.districtBuilding = 'host';
  group.add(mesh, mass); scene.updateMatrixWorld(true);
  const background = new THREE.Color('#88aacc');
  Object.assign(scene, { background, backgroundIntensity: 0.7, backgroundBlurriness: 0.2 });
  return { scene, group, stage, body, mesh, mass, background, floorY };
}
// The instance's height: its matrix's y column (decompose reports 1 for a collapsed matrix).
const scaleOf = (mesh, index) => { const m = new THREE.Matrix4(); mesh.getMatrixAt(index, m); return new THREE.Vector3().setFromMatrixColumn(m, 1).length(); };

test('only a layout that opens to the outside gets a skyline eye', () => {
  assert.equal(officeSkylineEye(officeLayout(OFFICE_LAYOUT_LEGACY)), null, 'the windowless legacy room has nothing to look at');
  assert.equal(officeSkylineEye(null), null);
  const eye = officeSkylineEye(officeLayout(OFFICE_LAYOUT_PENTHOUSE));
  assert.deepEqual(eye, [-4, 1.68, 10], 'the penthouse eye is the centre of the main floor and terrace, at standing height');
});

test('capture sizes: phones, tablets and a reduced render scale take 512 faces, within the device limits', () => {
  assert.equal(officeSkylineSize({ scale: 1 }), 1024);
  assert.equal(officeSkylineSize(), 1024);
  assert.equal(officeSkylineSize({ scale: 0.75 }), 1024, 'Smoothest (three-quarter scale) keeps full faces');
  assert.equal(officeSkylineSize({ scale: 0.5 }), 512);
  assert.equal(officeSkylineSize({ scale: 1, coarsePointer: true }), 512, 'a touch-first device, phone or tablet, takes a quarter of the memory');
  assert.equal(officeSkylineSize({ scale: 0.5, coarsePointer: true }), 512);
  assert.equal(officeSkylineSize({ scale: 1, maxCubemapSize: 256 }), 256);
  assert.equal(officeSkylineSize({ scale: 1, maxTextureSize: 512 }), 512, 'the temporary 2D face has to fit too');
});

test('the penthouse captures the district once, without the host tower, the stage or the visitor', () => {
  const f = district(), seen = [];
  const renderer = fakeRenderer(scene => seen.push({ host: scaleOf(f.mesh, 0), podium: scaleOf(f.mesh, 1), neighbour: scaleOf(f.mesh, 2), stage: f.stage.visible, body: f.body.visible, mass: f.mass.visible, background: scene.background }));
  const skyline = createOfficeSkyline({ renderer, scene: f.scene, eye: new THREE.Vector3(0, f.floorY + 1.68, 0), floorY: f.floorY, hostBuildingIndex: 0, hostBuildingId: 'host', hide: [f.stage, f.body], size: 16, far: 6000 });
  assert.equal(skyline.capture(), true);
  assert.equal(faces(renderer).length, 6, 'one cube: six faces');
  assert.equal(copies(renderer).length, 6, 'each copied into the cube once');
  assert.ok(seen.every(face => face.host === 0 && face.mass === false), 'the host tower above the office floor is not in the picture');
  assert.ok(seen.every(face => face.podium === 4 && face.neighbour === 4), 'its podium and the neighbours stay');
  assert.ok(seen.every(face => !face.stage && !face.body), 'the office stage and the visitor are hidden while capturing');
  assert.ok(seen.every(face => face.background === f.background), 'the faces record the real sky behind the district');
  assert.ok(renderer.renders.every(face => face.autoClear && !face.shadows), 'each face clears, and the shadow maps are reused rather than redrawn');
  assert.equal(scaleOf(f.mesh, 0), 4, 'the host tower comes back after the capture');
  assert.equal(f.mass.visible, true); assert.equal(f.stage.visible, true); assert.equal(f.body.visible, true);
  assert.equal(renderer.autoClear, false); assert.equal(renderer.shadowMap.autoUpdate, true); assert.equal(renderer.getRenderTarget(), null);
  assert.equal(f.scene.background, skyline.texture, 'the capture becomes the backdrop');
  assert.equal(f.scene.backgroundIntensity, 1, 'the sky intensity is already in the captured faces');
  assert.equal(skyline.capture(), false, 'a second request does not capture again');
  assert.equal(renderer.renders.length, 12);
  assert.equal(skyline.stats.state, 'captured'); assert.equal(skyline.stats.size, 16); assert.equal(skyline.stats.hiddenInstances, 1);
  assert.equal(renderer.finished, 0, 'the capture never stalls on the GPU');
  assert.equal(skyline.stats.newPrograms, 1, 'programs first compiled for the faces are counted');
  for (const key of ['traverseMs', 'submitMs', 'ms']) assert.ok(skyline.stats[key] >= 0, key);
  assert.ok(skyline.stats.ms >= skyline.stats.traverseMs + skyline.stats.submitMs - 0.2, 'the total includes the host search');
  assert.equal(skyline.pending, false);
  assert.equal(skyline.stats.bytes, 16 * 16 * 6 * 8, 'colour only: RGBA half float, no depth kept');
  skyline.dispose();
  assert.equal(f.scene.background, f.background); assert.equal(f.scene.backgroundIntensity, 0.7); assert.equal(f.scene.backgroundBlurriness, 0.2);
});

test('each face is drawn through the camera three.js CubeCamera uses for it, then copied into that cube face, in order', () => {
  const f = district(), eye = new THREE.Vector3(3, f.floorY + 1.68, -2), renderer = fakeRenderer();
  const previous = new THREE.WebGLRenderTarget(4, 4); renderer.setRenderTarget(previous, 0, 0); renderer.xr.enabled = true;
  const skyline = createOfficeSkyline({ renderer, scene: f.scene, eye, floorY: f.floorY, size: 16, far: 6000 });
  assert.equal(skyline.capture(), true);
  // The reference: three's own CubeCamera at the same eye, drawn through the same kind of fake.
  const reference = fakeRenderer(), cube = new THREE.CubeCamera(0.5, 6000, new THREE.WebGLCubeRenderTarget(16));
  cube.position.copy(eye); cube.updateMatrixWorld(); cube.update(reference, f.scene);
  const drawn = faces(renderer), copied = copies(renderer);
  assert.deepEqual(renderer.renders.map(draw => draw.target.isWebGLCubeRenderTarget === true), [false, true, false, true, false, true, false, true, false, true, false, true], 'each face is copied before the next is drawn');
  assert.deepEqual(copied.map(draw => draw.face), [0, 1, 2, 3, 4, 5], '+x, -x, +y, -y, +z, -z');
  assert.ok(copied.every(draw => draw.level === 0));
  assert.deepEqual(reference.renders.map(draw => draw.face), [0, 1, 2, 3, 4, 5]);
  reference.renders.forEach((expected, face) => {
    closeMatrix(drawn[face].view, expected.view, `face ${face} looks the way CubeCamera's does`);
    closeMatrix(drawn[face].projection, expected.projection, `face ${face} has CubeCamera's projection (90 degrees, mirrored)`);
  });
  assert.ok(renderer.renders.every(draw => draw.xr === false), 'XR is off for the capture');
  assert.equal(renderer.xr.enabled, true); assert.equal(renderer.getRenderTarget(), previous, 'the previous target comes back');
  skyline.dispose();
});

test('the backdrop keeps no depth buffer: faces draw into one temporary target, released right after the capture', () => {
  const f = district(), renderer = fakeRenderer();
  const skyline = createOfficeSkyline({ renderer, scene: f.scene, eye: new THREE.Vector3(0, f.floorY + 1.68, 0), floorY: f.floorY, size: 16 });
  assert.equal(skyline.stats.bytes, 16 * 16 * 6 * 8, 'the resident colour is known before the capture');
  assert.equal(skyline.capture(), true);
  const temporary = [...new Set(faces(renderer).map(draw => draw.target))], resident = [...new Set(copies(renderer).map(draw => draw.target))];
  assert.equal(temporary.length, 1, 'one temporary target, reused for all six faces');
  assert.equal(resident.length, 1);
  const [scratch] = temporary, [cube] = resident;
  assert.ok(!scratch.isWebGLCubeRenderTarget && scratch.depthBuffer, 'the faces draw with depth, into a 2D target');
  assert.deepEqual([scratch.width, scratch.height, scratch.texture.type], [16, 16, THREE.HalfFloatType]);
  assert.equal(cube.depthBuffer, false, 'the resident cube holds colour only');
  assert.deepEqual([cube.width, cube.texture.type], [16, THREE.HalfFloatType]);
  assert.equal(cube.texture, skyline.texture); assert.equal(f.scene.background, cube.texture, 'and is the backdrop');
  assert.ok(renderer.disposed.has(scratch), 'the temporary is released as soon as the capture ends');
  assert.ok(!renderer.disposed.has(cube), 'the backdrop stays for the visit');
  assert.equal(skyline.stats.bytes, 16 * 16 * 6 * 8, 'resident: colour only, RGBA half float');
  assert.equal(skyline.stats.peakBytes, 16 * 16 * 6 * 8 + 16 * 16 * (8 + 4), 'while capturing: plus one face with its depth');
  skyline.dispose();
  assert.ok(renderer.disposed.has(cube), 'leaving releases the backdrop');
});

test('every copy reads the face just drawn, and a later visit reuses the copy program rather than compiling it again', () => {
  const f = district(), renderer = fakeRenderer();
  const visits = [0, 1].map(() => {
    const skyline = createOfficeSkyline({ renderer, scene: f.scene, eye: new THREE.Vector3(0, f.floorY + 1.68, 0), floorY: f.floorY, size: 16 });
    assert.equal(skyline.capture(), true);
    const visit = { drawn: faces(renderer).slice(-6), copied: copies(renderer).slice(-6) };
    skyline.dispose();
    return visit;
  });
  for (const { drawn, copied } of visits) copied.forEach((draw, face) => assert.equal(draw.sampled, drawn[face].target.texture, `face ${face} copies the temporary it was just drawn into`));
  assert.notEqual(visits[0].drawn[0].target, visits[1].drawn[0].target, 'each capture draws into its own temporary');
  const materials = new Set(visits.flatMap(visit => visit.copied.map(draw => draw.material)));
  assert.equal(materials.size, 1, 'one copy material for every visit, so its program is compiled once per page');
  assert.equal([...materials][0].uniforms.face.value, null, 'between captures the copy holds no texture');
});

test('anything standing in the host footprint above the office floor is left out, whatever tagged it', () => {
  const f = district(), ring = [[-10, -10], [10, -10], [10, 10], [-10, 10]];
  // Rooftop ornaments and edge parts from other modules carry no building index.
  const loose = new THREE.InstancedMesh(new THREE.SphereGeometry(1), new THREE.MeshStandardMaterial(), 5), part = new THREE.Object3D();
  [[2, f.floorY + 3, 1], [40, f.floorY + 3, 0], [0, f.floorY - 5, 0], [10.5, f.floorY + 2, 0], [13, f.floorY + 2, 0]].forEach(([x, y, z], i) => { part.position.set(x, y, z); part.updateMatrix(); loose.setMatrixAt(i, part.matrix); });
  const finial = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1), new THREE.MeshStandardMaterial()); finial.position.set(3, f.floorY + 2, 3);
  const signs = new THREE.Mesh(new THREE.BoxGeometry(200, 4, 200), new THREE.MeshStandardMaterial()); signs.position.y = f.floorY;
  f.group.add(loose, finial, signs); f.scene.updateMatrixWorld(true);
  const seen = [], renderer = fakeRenderer(() => seen.push({ loose: [0, 1, 2, 3, 4].map(i => scaleOf(loose, i)), finial: finial.visible, signs: signs.visible }));
  const skyline = createOfficeSkyline({ renderer, scene: f.scene, eye: new THREE.Vector3(0, f.floorY + 1.68, 0), floorY: f.floorY, hostRing: ring, size: 16 });
  skyline.capture();
  assert.deepEqual(seen[0].loose.map(height => height > 0), [false, true, true, false, true], 'the ornament and the part on the wall go; the neighbour, the low part and one 3 m out stay');
  assert.equal(seen[0].finial, false, 'a small mesh on the tower top goes');
  assert.equal(seen[0].signs, true, 'a district-wide merged mesh that happens to overlap stays');
  assert.equal(scaleOf(loose, 0), 1); assert.equal(finial.visible, true);
  assert.equal(scaleOf(f.mesh, 0) > 0 && seen[0].loose.length === 5, true);
  assert.equal(skyline.stats.hiddenInstances, 3, 'the two loose parts and, by footprint alone, the indexed host mullion');
  assert.equal(skyline.stats.hiddenMeshes, 2, 'the finial and the host massing, by footprint alone');
  skyline.dispose();
});

test('from inside the host, none of its own facade shows, at any height: its floor lines drew dark rings', () => {
  // The first combined captures showed two navy rings below the horizon: the host tower's
  // floor-line bands just under the office floor, seen from inside the tower.
  const f = district(), ring = [[-30, -30], [30, -30], [30, 30], [-30, 30]], part = new THREE.Object3D();
  const bands = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 3);
  [[0, f.floorY - 0.14, 19], [0, f.floorY - 4, 20], [80, f.floorY - 4, 0]].forEach(([x, y, z], i) => { part.position.set(x, y, z); part.scale.set(8, 0.14, 0.2); part.updateMatrix(); bands.setMatrixAt(i, part.matrix); });
  bands.userData.buildingIndices = [0, 0, 1]; f.group.add(bands); f.scene.updateMatrixWorld(true);
  const seen = [], renderer = fakeRenderer(() => seen.push({ bands: [0, 1, 2].map(i => scaleOf(bands, i) > 0), podium: scaleOf(f.mesh, 1) > 0, neighbour: scaleOf(f.mesh, 2) > 0, mass: f.mass.visible }));
  const inside = createOfficeSkyline({ renderer, scene: f.scene, eye: new THREE.Vector3(0, f.floorY + 1.68, 0), floorY: f.floorY, hostBuildingIndex: 0, hostBuildingId: 'host', hostRing: ring, size: 16 });
  inside.capture();
  assert.deepEqual(seen[0].bands, [false, false, true], 'both host floor lines go; a neighbour band at the same height stays');
  assert.equal(seen[0].podium, false, 'so does the rest of the host facade below the floor');
  assert.equal(seen[0].neighbour, true);
  assert.equal(seen[0].mass, false, 'the massing above the floor goes as before');
  assert.ok([0, 1, 2].every(i => scaleOf(bands, i) > 0), 'every band is back after the capture');
  inside.dispose();
  // With the eye outside the footprint, only what reaches above the floor goes.
  const outsideSeen = [], other = fakeRenderer(() => outsideSeen.push([0, 1].map(i => scaleOf(bands, i) > 0)));
  const outside = createOfficeSkyline({ renderer: other, scene: f.scene, eye: new THREE.Vector3(60, f.floorY + 1.68, 0), floorY: f.floorY, hostBuildingIndex: 0, hostRing: ring, size: 16 });
  outside.capture();
  assert.deepEqual(outsideSeen[0], [true, true]);
  outside.dispose();
});

test('a stepped host keeps its lower wing: only the tower above the wing roof is skin the eye stands in', () => {
  // The Equinox block is a two-storey wing with the tower rising beside it. From the terrace
  // the wing's parapet is seen from above; the tower's own floor lines never are.
  const f = district(), ring = [[-30, -30], [30, -30], [30, 30], [-30, 30]], part = new THREE.Object3D(), wingRoof = f.floorY - 14;
  f.mass.geometry.dispose(); f.mass.geometry = new THREE.BoxGeometry(10, 10, 10); f.mass.position.y = wingRoof - 5; // the wing's massing, top at its roof
  const parts = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial(), 4);
  [[wingRoof + 0.5, 1], [f.floorY - 4, 0.14], [f.floorY - 11, 0.6], [2, 4]].forEach(([y, h], i) => { part.position.set(0, y, 19); part.scale.set(8, h, 0.2); part.updateMatrix(); parts.setMatrixAt(i, part.matrix); });
  parts.userData.buildingIndices = [0, 0, 0, 0]; f.group.add(parts); f.scene.updateMatrixWorld(true);
  const seen = [], renderer = fakeRenderer(() => seen.push([0, 1, 2, 3].map(i => scaleOf(parts, i) > 0)));
  const skyline = createOfficeSkyline({ renderer, scene: f.scene, eye: new THREE.Vector3(0, f.floorY + 1.68, 0), floorY: f.floorY, hostBuildingIndex: 0, hostBuildingId: 'host', hostRing: ring, size: 16 });
  skyline.capture();
  assert.deepEqual(seen[0], [true, false, false, true], 'the wing parapet and the street frontage stay; the tower floor line and podium cornice go');
  skyline.dispose();
});

test('a failed capture restores everything it borrowed, shows no backdrop and keeps no target', () => {
  // A lost context on the first face, or part way through the copies.
  const failures = [[() => { throw new Error('context lost'); }, () => {}], [() => {}, draw => { if (draw.face === 2) throw new Error('context lost'); }]];
  for (const [onRender, onCopy] of failures) {
    const f = district(), renderer = fakeRenderer(onRender, onCopy);
    const skyline = createOfficeSkyline({ renderer, scene: f.scene, eye: new THREE.Vector3(0, f.floorY + 1.68, 0), floorY: f.floorY, hostBuildingIndex: 0, hide: [f.stage], size: 16 });
    assert.equal(skyline.capture(), false);
    assert.equal(skyline.stats.state, 'failed'); assert.equal(skyline.stats.error, 'context lost');
    assert.equal(scaleOf(f.mesh, 0), 4); assert.equal(f.stage.visible, true); assert.equal(renderer.autoClear, false); assert.equal(renderer.shadowMap.autoUpdate, true);
    assert.equal(renderer.getRenderTarget(), null);
    assert.equal(f.scene.background, f.background);
    const used = new Set(renderer.renders.map(draw => draw.target));
    assert.ok(used.size >= 1 && [...used].every(target => renderer.disposed.has(target)), 'the temporary, and the cube it never filled, are released at once');
    skyline.dispose();
  }
});

test('a capture requested after the visit ended is ignored, and a changed sky is left alone', () => {
  const late = district(), renderer = fakeRenderer();
  const skyline = createOfficeSkyline({ renderer, scene: late.scene, eye: new THREE.Vector3(), floorY: late.floorY, size: 16 });
  skyline.dispose(); skyline.dispose();
  assert.equal(skyline.capture(), false); assert.equal(renderer.renders.length, 0); assert.equal(late.scene.background, late.background);

  const f = district(), other = fakeRenderer(), next = new THREE.Color('#223344');
  const visit = createOfficeSkyline({ renderer: other, scene: f.scene, eye: new THREE.Vector3(), floorY: f.floorY, size: 16 });
  visit.capture();
  f.scene.background = next; f.scene.backgroundIntensity = 0.4; // time of day changed while inside
  visit.dispose();
  assert.equal(f.scene.background, next, 'restoring would bring back a stale sky');
  assert.equal(f.scene.backgroundIntensity, 0.4);
});

// The real visit: the presentation lease, the arrival and the office scene.
function street({ layout, skyline = { size: 16 } }) {
  const scene = new THREE.Scene(), districtGroup = new THREE.Group(), object = new THREE.Group(), body = new THREE.Group(); scene.add(districtGroup, body); districtGroup.add(object);
  object.position.set(-2741, 18.4, 1392); object.rotation.y = 3.13; object.updateMatrixWorld();
  const camera = new THREE.PerspectiveCamera(58, 1.44, .1, 2000); camera.position.set(-2743, 21.2, 1373); camera.lookAt(-2742, 19.8, 1380); camera.updateMatrixWorld();
  body.position.set(-2742, 18.4, 1378);
  const background = new THREE.Color('#99bbdd'); scene.background = background; scene.backgroundIntensity = 0.7;
  const avatar = { object: body, ready: true, setPresentation(value) { this.presentation = value; } }, lobby = { object, setEntryOpen() {}, update() {} };
  // One light of the district's fixed pool, lighting a shop near the lobby.
  const lamp = new THREE.PointLight('#ffd9ae', 10, 10, 2); lamp.position.set(-2745, 20, 1390); scene.add(lamp);
  const seen = [], renderer = fakeRenderer(() => seen.push({ district: districtGroup.visible, body: body.visible, lobby: object.visible, lamp: lamp.intensity, lampAt: lamp.position.clone() }));
  const captured = captureOfficeStreet({ scene, camera, pipeline: { render() {} }, renderer, skyline, lights: [lamp], avatar, lobby, world: { buildings: [] }, pose: { position: [-2742, 20.08, 1378], velocity: [0, 0] } });
  return { scene, districtGroup, background, renderer, seen, lamp, captured, self: { id: 'self', office: { id: 'jevica-office', layout, levelId: 'jevica-office/l0' } } };
}
function visit(t, s) {
  const previous = globalThis.document, element = () => ({ style: {}, classList: {}, append() {}, setAttribute() {}, remove() {} });
  globalThis.document = { createElement: element }; t.after(() => { globalThis.document = previous; });
  const scene = createOfficeWorldScene({ street: s.captured, host: { ...element(), clientWidth: 1440, clientHeight: 1000 }, self: s.self });
  t.after(() => scene.dispose());
  const phases = [];
  const draw = now => { scene.prepare(now); const frame = scene.render(now, [0, 1.5], 0, []); phases.push(frame.phase); return frame; };
  return { scene, phases, draw };
}

test('a penthouse visit captures while the doors close, before the district is hidden, and restores the sky on leaving', t => {
  const s = street({ layout: OFFICE_LAYOUT_PENTHOUSE }), v = visit(t, s);
  v.draw(0);
  for (let i = 1; i <= 1500 && s.renderer.renders.length === 0; i++) v.draw(i * 1000 / 60);
  assert.equal(faces(s.renderer).length, 6, 'one capture during the arrival');
  assert.ok(s.seen.every(face => face.district && !face.body && !face.lobby), 'the faces see the district, never the visitor or the cabin');
  assert.equal(s.captured.lobby.object.visible, true, 'the cabin is shown again after the capture');
  assert.ok(s.seen.every(face => face.lamp === 10 && face.lampAt.distanceTo(new THREE.Vector3(-2745, 20, 1390)) < 1e-9), 'the faces see the street lit by its own pool, not the cabin lights');
  assert.notEqual(s.lamp.intensity, 10, 'the pool goes back to lighting the cabin right after');
  assert.ok(['closing', 'ascending'].includes(v.phases.at(-1)), `captured as the doors close, not later: ${v.phases.at(-1)}`);
  assert.equal(s.districtGroup.visible, false, 'the district is hidden right after');
  assert.equal(s.scene.background.isTexture, true);
  for (let i = 1; i <= 1500; i++) v.draw(30000 + i * 1000 / 60);
  assert.equal(v.phases.at(-1), 'office'); assert.equal(faces(s.renderer).length, 6, 'no further captures while inside');
  assert.equal(v.scene.inspect().skyline.state, 'captured');
  v.scene.dispose();
  assert.equal(s.scene.background, s.background); assert.equal(s.scene.backgroundIntensity, 0.7); assert.equal(s.districtGroup.visible, true);
});

test('skipping the arrival still captures once, on the first frame inside', t => {
  const s = street({ layout: OFFICE_LAYOUT_PENTHOUSE }), v = visit(t, s);
  v.scene.skip(); v.draw(0); v.draw(16);
  assert.equal(faces(s.renderer).length, 6); assert.ok(s.seen.length === 6 && s.seen.every(face => face.district));
  assert.equal(s.districtGroup.visible, false);
});

test('the legacy room and the off switch never capture or change the sky', t => {
  for (const s of [street({ layout: OFFICE_LAYOUT_LEGACY }), street({ layout: OFFICE_LAYOUT_PENTHOUSE, skyline: null })]) {
    const v = visit(t, s);
    for (let i = 0; i <= 1500; i++) v.draw(i * 1000 / 60);
    assert.equal(v.phases.at(-1), 'office');
    assert.equal(s.renderer.renders.length, 0); assert.equal(s.scene.background, s.background);
    assert.equal(v.scene.inspect().skyline, null);
    v.scene.dispose();
  }
});

test('live skyline draws current district without a cubemap, filters host only during each draw, and restores on errors', () => {
  const f = district(), renderer = fakeRenderer(), roof = new THREE.Mesh(new THREE.BoxGeometry(2,2,2), new THREE.MeshStandardMaterial());
  roof.position.set(0, f.floorY + 2, 0); f.stage.add(roof); f.scene.updateMatrixWorld(true);
  const skyline = createOfficeSkyline({ mode: 'live', hostRoot: f.group, renderer, scene: f.scene, eye: new THREE.Vector3(0,f.floorY+1.68,0), floorY:f.floorY, hostBuildingIndex:0,hostBuildingId:'host',hide:[f.stage] });
  assert.equal(skyline.texture, null); assert.equal(skyline.stats.bytes,0);
  const actor = new THREE.Mesh(new THREE.BoxGeometry(1,2,1),new THREE.MeshStandardMaterial());actor.position.set(0,f.floorY+2,0);f.scene.add(actor);f.scene.updateMatrixWorld(true);
  const standIns = () => f.group.children.filter(node => node.userData.officeOutlookStandIn);
  const draw = () => {
    assert.equal(actor.visible,true,'live filtering never adopts moving actors');
    const [copy] = standIns();
    assert.equal(f.mesh.visible,false,'the host mesh is out of the draw');
    assert.ok(copy?.visible && copy.geometry === f.mesh.geometry && copy.material === f.mesh.material, 'its stand-in draws the same geometry and material');
    assert.equal(copy.count,2,'without the host instance above the floor');
    assert.deepEqual([0,1].map(i => scaleOf(copy,i)),[scaleOf(f.mesh,1),scaleOf(f.mesh,2)],'keeping the podium band and the neighbour');
    assert.equal(f.mass.visible,false);assert.equal(roof.visible,true);assert.equal(f.stage.visible,true);
  };
  const versions = () => [f.mesh.instanceMatrix.version, standIns()[0]?.instanceMatrix.version];
  skyline.render(draw);
  assert.ok(scaleOf(f.mesh,0)>0 && f.mesh.visible && !standIns()[0].visible && f.mass.visible, 'between draws the district is untouched');
  const after = versions();
  actor.position.x=50;actor.updateMatrixWorld(true);
  const dusk = new THREE.Color('#443344');f.scene.background=dusk;
  for (let i = 0; i < 5; i++) skyline.render(()=>{draw();assert.equal(f.scene.background,dusk);});
  assert.deepEqual(versions(), after, 'no instance data is written again frame after frame');
  assert.equal(standIns().length,1,'one stand-in per host mesh for the visit');
  assert.throws(()=>skyline.render(()=>{draw();throw new Error('draw failed');}),/draw failed/);
  assert.ok(scaleOf(f.mesh,0)>0);assert.equal(f.mesh.visible,true);assert.equal(standIns()[0].visible,false);assert.equal(f.mass.visible,true);assert.equal(f.scene.background,dusk);
  assert.equal(renderer.renders.length,0,'no six-face renderer submissions');assert.equal(skyline.stats.state,'live');
  let released = 0; standIns()[0].addEventListener('dispose', () => released++);
  skyline.dispose();skyline.dispose();assert.equal(skyline.render(()=>assert.fail('disposed view draws')),false);
  assert.equal(standIns().length,0,'leaving removes the stand-ins');assert.equal(released,1,'and frees their instance buffers');
  assert.equal(f.mesh.visible,true);assert.ok(scaleOf(f.mesh,0)>0);
});

test('a host mesh whose instances change during the visit gets a fresh stand-in', () => {
  const f = district(), skyline = createOfficeSkyline({ mode: 'live', hostRoot: f.group, renderer: fakeRenderer(), scene: f.scene, eye: new THREE.Vector3(0,f.floorY+1.68,0), floorY:f.floorY, hostBuildingIndex:0,hostBuildingId:'host',hide:[f.stage] });
  const standIns = () => f.group.children.filter(node => node.userData.officeOutlookStandIn);
  skyline.render(() => {}); const first = standIns()[0];
  const moved = new THREE.Matrix4().makeTranslation(60, f.floorY - 10, 0); f.mesh.setMatrixAt(2, moved); f.mesh.instanceMatrix.needsUpdate = true;
  skyline.render(() => {
    const [copy] = standIns(), m = new THREE.Matrix4(); copy.getMatrixAt(1, m);
    assert.notEqual(copy, first); assert.equal(standIns().length, 1); assert.equal(first.parent, null, 'the old stand-in is released');
    assert.ok(new THREE.Vector3().setFromMatrixPosition(m).distanceTo(new THREE.Vector3(60, f.floorY - 10, 0)) < 1e-9, 'the new one carries the moved neighbour');
  });
  skyline.dispose();
});

test('live office keeps exterior current, moves the actual viewpoint and restores street presentation', t => {
  const s=street({layout:OFFICE_LAYOUT_PENTHOUSE,skyline:{mode:'live'}}),v=visit(t,s);v.scene.skip();
  let draws=0;s.captured.pipeline.render=()=>{draws++;assert.equal(s.districtGroup.visible,true);};
  s.lamp.intensity=27;s.lamp.position.set(10,20,30);
  v.draw(0);v.draw(16);const first=s.captured.camera.position.clone();
  const next=new THREE.Color('#776655');s.scene.background=next;
  v.scene.render(32,[-18,8],.4,[]);assert.ok(s.captured.camera.position.distanceTo(first)>10);
  assert.equal(s.scene.background,next);assert.equal(s.renderer.renders.length,0);assert.equal(s.lamp.intensity,27,'street lights retain their current environment');assert.deepEqual(s.lamp.position.toArray(),[10,20,30]);
  assert.equal(v.scene.inspect().skyline.state,'live');assert.equal(v.scene.inspect().skyline.bytes,0);assert.equal(draws,3);
  v.scene.dispose();assert.equal(s.lamp.intensity,27);assert.deepEqual(s.lamp.position.toArray(),[10,20,30]);assert.equal(s.districtGroup.visible,true);assert.equal(s.scene.background,next);assert.equal(s.captured.lobby.object.parent,s.districtGroup);
});

test('phones and tablets keep the bounded snapshot outlook; other devices draw the live district', async () => {
  const { officeOutlookFor } = await import('../src/office-skyline.js');
  assert.deepEqual(officeOutlookFor({ coarsePointer: true, scale: 1 }), { mode: 'snapshot', size: 512 }, 'a touch-first device keeps the snapshot at the phone size');
  assert.deepEqual(officeOutlookFor({ coarsePointer: false, scale: 0.6 }), { mode: 'snapshot', size: 512 }, 'a reduced render scale keeps the snapshot');
  assert.deepEqual(officeOutlookFor({ coarsePointer: true, scale: 1, maxCubemapSize: 256 }), { mode: 'snapshot', size: 256 }, 'within the device limits');
  assert.deepEqual(officeOutlookFor({ coarsePointer: false, scale: 1 }), { mode: 'live' }, 'a full-scale fine-pointer device draws the live district');
  assert.deepEqual(officeOutlookFor(), { mode: 'live' });
});

// First entry (#449): the office's lamps change every lit material's program when it first shows.
function compiling(s) {
  const calls = [], pending = [];
  s.captured.pipeline.compileAsync = (object, camera, target) => {
    const office = target.getObjectByName('office:office-penthouse-1'), items = []; let lamps = 0;
    target.traverseVisible(node => { if (node.isPointLight && node.parent === office) lamps++; });
    object.traverse(node => items.push(node));
    calls.push({ object, camera, target, shown: office.visible, lamps, items });
    return new Promise(resolve => pending.push(resolve));
  };
  return { calls, finish: () => pending.splice(0).forEach(resolve => resolve()) };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test('entering compiles what the office will draw, with its lamps counted; a skipped arrival holds on the street until ready', async t => {
  const s = street({ layout: OFFICE_LAYOUT_PENTHOUSE, skyline: { mode: 'live' } }), c = compiling(s), v = visit(t, s);
  const office = s.scene.getObjectByName('office:office-penthouse-1');
  v.scene.skip();
  for (let i = 0; i < 40; i++) v.draw(i * 16);
  assert.ok(v.phases.every(phase => phase === 'lobby'), `the cut waits on the street: ${[...new Set(v.phases)]}`);
  assert.equal(office.visible, false); assert.equal(s.districtGroup.visible, true);
  assert.ok(c.calls.length > 1, 'the work is spread over several frames');
  for (const call of c.calls) {
    assert.equal(call.target, s.scene); assert.equal(call.camera, s.captured.camera);
    assert.ok(call.shown && call.lamps === 5, `each call counts the office's five lamps: ${call.lamps}`);
  }
  const items = c.calls.flatMap(call => call.items);
  assert.ok(items.every(item => item.isMesh && item.material), 'only drawn objects');
  for (const name of ['ceiling', 'curtain wall panes', 'desks']) assert.ok(items.some(item => item.name === name), `the office's ${name}`);
  const kinds = items.map(item => `${item.material.uuid}|${item.isInstancedMesh}|${item.type}|${item.receiveShadow}`);
  assert.equal(new Set(kinds).size, kinds.length, 'each material and kind once');
  assert.equal(office.visible, false, 'hidden again after every call');
  c.finish(); await tick();
  v.draw(1000); assert.equal(v.phases.at(-1), 'office'); assert.equal(office.visible, true);
  const calls = c.calls.length; for (let i = 1; i <= 10; i++) v.draw(1000 + i * 16);
  assert.equal(c.calls.length, calls, 'nothing more to compile once arrived');
});

test('a skipped arrival waits at most three seconds for compilation, and a played one never waits', t => {
  const held = street({ layout: OFFICE_LAYOUT_PENTHOUSE, skyline: { mode: 'live' } }); compiling(held);
  const v = visit(t, held); v.scene.skip(); v.draw(0); v.draw(2990);
  assert.equal(v.phases.at(-1), 'lobby'); v.draw(3010); assert.equal(v.phases.at(-1), 'office');
  const played = street({ layout: OFFICE_LAYOUT_PENTHOUSE, skyline: { mode: 'live' } }); compiling(played);
  const w = visit(t, played); w.draw(0);
  for (let i = 1; i <= 1500; i++) w.draw(i * 1000 / 60);
  assert.equal(w.phases.at(-1), 'office', 'the arrival plays out while programs compile');
});
