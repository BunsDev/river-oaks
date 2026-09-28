import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from 'three';

// Keep the actual interpolation/controller; replace only assets and DOM so its
// animation inputs can be checked without decoding textures in a Node test.
function load(url, context, nextLoad) {
  if (url.endsWith('/avatars.js')) return { format: 'module', shortCircuit: true, source: `
    import * as THREE from 'three';
    export async function loadResidentAvatar() {
      const object = new THREE.Group(); object.userData.frames = [];
      return { object, update(_now, _action, _speaking, motion) { object.userData.frames.push(motion); }, dispose() {} };
    }` };
  if (url.endsWith('/player-costume.js')) return { format: 'module', shortCircuit: true, source: 'export function createPlayerCostume() { return { update() {}, dispose() {} }; }' };
  if (url.endsWith('/flight-vehicles.js')) return { format: 'module', shortCircuit: true, source: "import * as THREE from 'three'; export function createFlightVehicle() { return { object: new THREE.Group(), dispose() {} }; }" };
  return nextLoad(url, context);
}
register(new URL(`data:text/javascript,${encodeURIComponent(`export ${load.toString()}`)}`));
const { createRemotePlayers } = await import('../src/remote-players.js');

class Element {
  style = {};
  clientWidth = 800;
  clientHeight = 600;
  setAttribute() {}
  append() {}
  remove() {}
}

async function flight(hz, horizontal, vertical) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera();
  const players = createRemotePlayers(scene, new Element());
  const peer = { id: 'peer', name: 'Jevica', position: [0, 0, 0], altitude: 5, yaw: 0 };
  players.sync([peer], 'self'); await new Promise(resolve => setImmediate(resolve));
  const frames = scene.children[0].children[0].userData.frames;
  players.update(0, camera);
  for (let frame = 1; frame <= hz; frame++) {
    const time = frame / hz;
    players.sync([{ ...peer, position: [horizontal * time, 0, 0], altitude: 5 + vertical * time }], 'self');
    players.update(time * 1000, camera);
  }
  players.dispose();
  return frames;
}

test('remote ascent and descent retain hover; climbing forward uses horizontal flight speed at every frame rate', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = { createElement: () => new Element() };
  try {
    for (const hz of [30, 60, 120]) {
      for (const vertical of [-2, 2]) {
        const frames = await flight(hz, 0, vertical);
        assert.equal(frames.length, hz + 1);
        assert.ok(frames.every(frame => frame.flying && frame.flightSpeed === 0), `${hz} Hz: vertical motion must not trigger forward lean`);
      }
      const level = await flight(hz, 3, 0), climb = await flight(hz, 3, 2);
      assert.equal(level[0].flightSpeed, 0, 'First frame has no elapsed time');
      assert.ok(level.at(-1).flightSpeed > 2.9, 'Forward travel must still blend into the moving flight pose');
      assert.deepEqual(climb.map(frame => frame.flightSpeed), level.map(frame => frame.flightSpeed));
    }
  } finally { globalThis.document = previousDocument; }
});
