import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createOfficeSkyline, officeSkylineEye, officeSkylineSize } from '../src/office-skyline.js';
import { captureOfficeStreet } from '../src/office-world-presentation.js';
import { createOfficeWorldScene } from '../src/office-world-scene.js';
import { officeLayout, OFFICE_LAYOUT_LEGACY, OFFICE_LAYOUT_PENTHOUSE } from '../src/office-layouts.js';

// A renderer that records what each cube face would have drawn: enough of the
// WebGLRenderer surface for THREE.CubeCamera, with no GPU.
function fakeRenderer(onRender = () => {}) {
  let target = null, face = 0;
  return {
    coordinateSystem: THREE.WebGLCoordinateSystem, xr: { enabled: false }, autoClear: false,
    shadowMap: { autoUpdate: true, needsUpdate: false }, renders: [],
    getRenderTarget: () => target, getActiveCubeFace: () => face, getActiveMipmapLevel: () => 0,
    setRenderTarget(next, nextFace = 0) { target = next; face = nextFace; },
    render(scene, camera) { this.renders.push({ face, target, autoClear: this.autoClear, shadows: this.shadowMap.autoUpdate }); onRender(scene, camera); },
    getContext: () => ({ finish() {} }),
  };
}

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

test('capture sizes: a reduced render scale halves the faces, within the device cube limit', () => {
  assert.equal(officeSkylineSize({ scale: 1 }), 1024);
  assert.equal(officeSkylineSize({ scale: 0.5 }), 512);
  assert.equal(officeSkylineSize({ scale: 1, maxCubemapSize: 256 }), 256);
});

test('the penthouse captures the district once, without the host tower, the stage or the visitor', () => {
  const f = district(), seen = [];
  const renderer = fakeRenderer(scene => seen.push({ host: scaleOf(f.mesh, 0), podium: scaleOf(f.mesh, 1), neighbour: scaleOf(f.mesh, 2), stage: f.stage.visible, body: f.body.visible, mass: f.mass.visible, background: scene.background }));
  const skyline = createOfficeSkyline({ renderer, scene: f.scene, eye: new THREE.Vector3(0, f.floorY + 1.68, 0), floorY: f.floorY, hostBuildingIndex: 0, hostBuildingId: 'host', hide: [f.stage, f.body], size: 16, far: 6000 });
  assert.equal(skyline.capture(), true);
  assert.equal(renderer.renders.length, 6, 'one cube: six faces');
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
  assert.equal(renderer.renders.length, 6);
  assert.equal(skyline.stats.state, 'captured'); assert.equal(skyline.stats.size, 16); assert.equal(skyline.stats.hiddenInstances, 1);
  assert.equal(skyline.stats.bytes, 16 * 16 * 6 * 12);
  skyline.dispose();
  assert.equal(f.scene.background, f.background); assert.equal(f.scene.backgroundIntensity, 0.7); assert.equal(f.scene.backgroundBlurriness, 0.2);
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

test('a failed capture restores everything it borrowed and shows no backdrop', () => {
  const f = district(), renderer = fakeRenderer(() => { throw new Error('context lost'); });
  const skyline = createOfficeSkyline({ renderer, scene: f.scene, eye: new THREE.Vector3(0, f.floorY + 1.68, 0), floorY: f.floorY, hostBuildingIndex: 0, hide: [f.stage], size: 16 });
  assert.equal(skyline.capture(), false);
  assert.equal(skyline.stats.state, 'failed');
  assert.equal(scaleOf(f.mesh, 0), 4); assert.equal(f.stage.visible, true); assert.equal(renderer.autoClear, false); assert.equal(renderer.shadowMap.autoUpdate, true);
  assert.equal(f.scene.background, f.background);
  skyline.dispose();
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
  const seen = [], renderer = fakeRenderer(() => seen.push({ district: districtGroup.visible, body: body.visible, lobby: object.visible }));
  const captured = captureOfficeStreet({ scene, camera, pipeline: { render() {} }, renderer, skyline, avatar, lobby, world: { buildings: [] }, pose: { position: [-2742, 20.08, 1378], velocity: [0, 0] } });
  return { scene, districtGroup, background, renderer, seen, captured, self: { id: 'self', office: { id: 'jevica-office', layout, levelId: 'jevica-office/l0' } } };
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
  assert.equal(s.renderer.renders.length, 6, 'one capture during the arrival');
  assert.ok(s.seen.every(face => face.district && !face.body && !face.lobby), 'the faces see the district, never the visitor or the cabin');
  assert.equal(s.captured.lobby.object.visible, true, 'the cabin is shown again after the capture');
  assert.ok(['closing', 'ascending'].includes(v.phases.at(-1)), `captured as the doors close, not later: ${v.phases.at(-1)}`);
  assert.equal(s.districtGroup.visible, false, 'the district is hidden right after');
  assert.equal(s.scene.background.isTexture, true);
  for (let i = 1; i <= 1500; i++) v.draw(30000 + i * 1000 / 60);
  assert.equal(v.phases.at(-1), 'office'); assert.equal(s.renderer.renders.length, 6, 'no further captures while inside');
  assert.equal(v.scene.inspect().skyline.state, 'captured');
  v.scene.dispose();
  assert.equal(s.scene.background, s.background); assert.equal(s.scene.backgroundIntensity, 0.7); assert.equal(s.districtGroup.visible, true);
});

test('skipping the arrival still captures once, on the first frame inside', t => {
  const s = street({ layout: OFFICE_LAYOUT_PENTHOUSE }), v = visit(t, s);
  v.scene.skip(); v.draw(0); v.draw(16);
  assert.equal(s.renderer.renders.length, 6); assert.ok(s.seen.every(face => face.district));
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
