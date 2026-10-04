import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from 'three';

// Keep the actual interpolation/controller; replace only assets and DOM so its
// animation inputs can be checked without decoding textures in a Node test.
function load(url, context, nextLoad) {
  if (url.endsWith('/avatars.js')) return { format: 'module', shortCircuit: true, source: `
    import * as THREE from 'three';
    export const AVATAR_PROFILES=['woman-casual','man-casual','woman-tailored','man-tailored','woman-daywear','man-workwear'];
    export async function loadResidentAvatar(_index, _id, profile, options) {
      globalThis.__remoteAvatarAttempts?.push(options?.appearanceId);
      if(globalThis.__remoteFailOnce===options?.appearanceId){globalThis.__remoteFailOnce=null;throw new Error('temporary asset failure');}
      const object = new THREE.Group(); object.userData.frames = []; object.userData.profile = profile; object.userData.appearance = options?.appearanceId; object.userData.suspends = 0;
      return { object, update(_now, action, _speaking, motion) { object.userData.frames.push({...motion,action}); }, suspend() { object.userData.suspends++; }, dispose() {} };
    }` };
  if (url.endsWith('/player-costume.js')) return { format: 'module', shortCircuit: true, source: 'export function createPlayerCostume() { return { update() {}, dispose() {} }; }' };
  if (url.endsWith('/flight-vehicles.js')) return { format: 'module', shortCircuit: true, source: "import * as THREE from 'three'; export function createFlightVehicle() { return { object: new THREE.Group(), dispose() {} }; }" };
  return nextLoad(url, context);
}
register(new URL(`data:text/javascript,${encodeURIComponent(`export ${load.toString()}`)}`));
const { createRemotePlayers } = await import('../src/remote-players.js');
const { JEVICA_OWNER_USER_IDS } = await import('../src/shared-appearances.js');
const ownerId = JEVICA_OWNER_USER_IDS[0];

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

test('a culled peer suspends its avatar clock before it reappears',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
  try{
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),players=createRemotePlayers(scene,new Element());
    players.sync([{id:'peer',name:'Peer',position:[0,0,0],altitude:0,yaw:0,appearance:'sable-human'}],'self');
    await new Promise(resolve=>setImmediate(resolve));
    const rig=scene.children[0].children[0];
    camera.position.set(200,0,0);players.update(0,camera);
    assert.equal(rig.userData.suspends,1);
    camera.position.set(0,0,0);players.update(500,camera);
    assert.equal(rig.userData.frames.length,1,'the avatar resumes from its suspended clock');
    players.dispose();
  }finally{globalThis.document=previousDocument;}
});

test('failed remote look keeps the loaded rig and retries after a bounded delay',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
  globalThis.__remoteAvatarAttempts=[];globalThis.__remoteFailOnce='kai-noir';
  try{
    let time=1000;const scene=new THREE.Scene(),players=createRemotePlayers(scene,new Element(),{now:()=>time});
    const peer={id:ownerId,name:'Alex',position:[0,0,0],altitude:0,yaw:0,appearance:'jevica'};
    players.sync([peer],'self');await new Promise(resolve=>setImmediate(resolve));
    players.sync([{...peer,appearance:'kai-noir'}],'self');await new Promise(resolve=>setImmediate(resolve));
    assert.equal(players.stats()[0].appearance,'jevica','failed request does not claim a loaded look');
    assert.equal(scene.children[0].children[0].userData.appearance,'jevica','previous rig stays visible');
    players.sync([{...peer,appearance:'kai-noir'}],'self');
    assert.equal(globalThis.__remoteAvatarAttempts.filter(id=>id==='kai-noir').length,1,'snapshots do not spin on failure');
    time+=2000;players.sync([{...peer,appearance:'kai-noir'}],'self');await new Promise(resolve=>setImmediate(resolve));
    assert.equal(players.stats()[0].appearance,'kai-noir');
    assert.equal(scene.children[0].children[0].userData.appearance,'kai-noir');
    assert.equal(scene.children[0].children.length,2);
    players.dispose();
  }finally{globalThis.document=previousDocument;delete globalThis.__remoteAvatarAttempts;delete globalThis.__remoteFailOnce;}
});

test('remote player swaps to the authoritative appearance without leaving an old rig in the scene',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
  try{
    const scene=new THREE.Scene(),players=createRemotePlayers(scene,new Element());
    const peer={id:ownerId,name:'Alex',position:[0,0,0],altitude:0,yaw:0,appearance:'jevica'};
    players.sync([peer],'self');await new Promise(resolve=>setImmediate(resolve));
    assert.equal(scene.children[0].children[0].userData.profile,'jevica');
    players.sync([{...peer,appearance:'man-workwear'}],'self');await new Promise(resolve=>setImmediate(resolve));
    assert.equal(scene.children[0].children[0].userData.profile,'man-casual');
    assert.equal(scene.children[0].children[0].userData.appearance,'man-workwear');
    assert.equal(scene.children[0].children.length,2,'only the current rig and its flight vehicle remain');
    assert.equal(players.stats()[0].appearance,'man-workwear');
    players.dispose();
  }finally{globalThis.document=previousDocument;}
});

test('a non-owner remote cannot render as Jevica',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
  try{
    const scene=new THREE.Scene(),players=createRemotePlayers(scene,new Element());
    players.sync([{id:'guest',name:'Guest',position:[0,0,0],altitude:0,yaw:0,appearance:'jevica'}],'self');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(players.stats()[0].appearance,'sable-human');
    players.dispose();
  }finally{globalThis.document=previousDocument;}
});

test('remote avatars play the gesture selected by the room snapshot',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
  try{
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),players=createRemotePlayers(scene,new Element());
    const peer={id:'guest',name:'Guest',position:[0,0,0],altitude:0,yaw:0,appearance:'sable-human',gesture:'wave'};
    players.sync([peer],'self');await new Promise(resolve=>setImmediate(resolve));
    players.update(0,camera);
    const frames=scene.children[0].children[0].userData.frames;
    assert.equal(frames.at(-1).action,'wave');
    players.sync([{...peer,gesture:'bow'}],'self');players.update(100,camera);
    assert.equal(frames.at(-1).action,'bow');
    players.sync([{...peer,gesture:null}],'self');players.update(200,camera);
    assert.equal(frames.at(-1).action,'continue');
    players.dispose();
  }finally{globalThis.document=previousDocument;}
});
