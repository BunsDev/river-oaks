import test from 'node:test';
import assert from 'node:assert/strict';
import { officePlayerVisible } from '../src/office-scene.js';
test('first-person office view does not render inside an overlapping body',()=>{
 const owner={id:'owner',position:[0,1.25,0]},guest={id:'guest',position:[0,1.25,0]};
 assert.equal(officePlayerVisible(owner,'owner',[0,1.25],false),true);
 assert.equal(officePlayerVisible(owner,'owner',[0,1.25],true),false);
 assert.equal(officePlayerVisible(owner,'guest',[0,1.25],true),false);
 assert.equal(officePlayerVisible(guest,'owner',[0,2.3],true),true);
});
test('peers on another floor of the penthouse stay visible even directly above or below', () => {
 const above = {id:'guest',position:[-12,18],office:{levelId:'jevica-office/l1'}};
 assert.equal(officePlayerVisible(above,'owner',[-12,18],true,'jevica-office/l0'),true);
 assert.equal(officePlayerVisible({...above,office:{levelId:'jevica-office/l0'}},'owner',[-12,18],true,'jevica-office/l0'),false);
});
test('behind glazing the arrival keeps only its closed car doors once arrived, and restores each part on release', async () => {
 const THREE = await import('three'), { arrivalBehindGlass } = await import('../src/office-arrival-architecture.js');
 const arrival = (() => {
  const object = new THREE.Group(), stone = new THREE.Group(), trim = new THREE.Group(), door = new THREE.Group(); trim.visible = false; object.add(stone, trim, door);
  return { object, stone, trim, door, frontDoors: [door], frames: [], update(frame) { this.frames.push(frame); } };
 })();
 const glass = arrivalBehindGlass(arrival, true);
 glass.update({ phase: 'arriving', done: false, doors: 1 });
 assert.deepEqual([arrival.stone.visible, arrival.trim.visible, arrival.door.visible, arrival.frames.length], [true, false, true, 0], 'the cabin stays drawn while the visitor walks out of it');
 glass.update({ phase: 'office', done: true, doors: 1 });
 assert.deepEqual([arrival.stone.visible, arrival.trim.visible, arrival.door.visible], [false, false, true], 'arrived: only the front doors stay drawn');
 assert.equal(arrival.frames.at(-1).doors, 0, 'and they are closed');
 glass.restore();
 assert.deepEqual([arrival.stone.visible, arrival.trim.visible], [true, false], 'release restores each part, keeping an already hidden one hidden');
 const plain = arrivalBehindGlass(arrival, false);
 plain.update({ phase: 'office', done: true, doors: 1 });
 assert.deepEqual([arrival.stone.visible, arrival.frames.length], [true, 1], 'without glazing nothing changes');
});
test('the standalone fallback scene hides its lift behind the penthouse glass once the visitor walks, not in the legacy room', async t => {
 const { createOfficeScene } = await import('../src/office-scene.js');
 // Node has no DOM or WebGL: a 2D context that accepts any call, and a renderer that records what it draws.
 const sink = new Proxy(() => sink, { get: (_, key) => key === 'measureText' ? () => ({ width: 0 }) : sink, apply: () => sink, set: () => true });
 const previous = globalThis.document, element = () => ({ style: {}, classList: { add() {}, remove() {}, toggle() {} }, dataset: {}, append() {}, setAttribute() {}, remove() {}, appendChild() {}, getContext: () => sink, width: 0, height: 0 });
 globalThis.document = { createElement: element }; t.after(() => { globalThis.document = previous; });
 const visit = layout => {
  let drawn = null;
  const renderer = new Proxy({}, { get: (target, key) => key === 'render' ? scene => { drawn = scene; } : key in target ? target[key] : key === 'capabilities' ? { isWebGL2: true, maxTextureSize: 4096 } : key === 'state' ? { buffers: { depth: { getReversed: () => false } } } : key === 'getClearColor' ? color => color : key === 'getRenderTarget' ? () => null : key === 'getPixelRatio' ? () => 1 : () => {}, set: (target, key, value) => { target[key] = value; return true; } });
  const self = { id: 'self', office: { id: 'jevica-office', layout, levelId: 'jevica-office/l0', position: [0, 1.5], yaw: 0 } };
  const scene = createOfficeScene({ renderer, host: { ...element(), clientWidth: 1280, clientHeight: 800 }, self, players: [self], reducedMotion: true });
  t.after(() => scene.dispose());
  scene.render(0, [0, 1.5], 0, [self], { levelId: 'jevica-office/l0' });
  const lift = drawn.children.find(child => child.name === 'office-arrival');
  return { scene, lift, visible: lift.children.filter(part => part.visible) };
 };
 const glazed = visit('office-penthouse-1');
 assert.ok(glazed.lift.children.length > 2, 'the real arrival architecture is in the scene');
 assert.equal(glazed.visible.length, 2, 'walking in the penthouse: only the two front door panels are drawn');
 assert.ok(glazed.visible.every(part => part.isMesh), 'and they are the door panels, not a batch of cabin or lobby parts');
 const legacy = visit('office-legacy-1');
 assert.ok(legacy.visible.length > 2, 'the windowless legacy room keeps the arrival as it was');
});
