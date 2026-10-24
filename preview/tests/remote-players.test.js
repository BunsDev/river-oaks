import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import * as THREE from 'three';

// Keep the actual interpolation/controller; replace only assets and DOM so its
// animation inputs can be checked without decoding textures in a Node test.
function load(url, context, nextLoad) {
  if (url.endsWith('/avatars.js')) return { format: 'module', shortCircuit: true, source: `
    import * as THREE from 'three';
    export const AVATAR_PROFILES=['sable-human','man-casual','woman-tailored','man-tailored','lyra-human','man-workwear'];
    export async function loadResidentAvatar(_index, _id, profile, options) {
      globalThis.__remoteAvatarAttempts?.push(options?.appearanceId);await globalThis.__remoteAvatarGate?.(options?.appearanceId);
      if(globalThis.__remoteFailOnce===options?.appearanceId){globalThis.__remoteFailOnce=null;throw new Error('temporary asset failure');}
      const object = new THREE.Group(); object.userData.frames = []; object.userData.profile = profile; object.userData.appearance = options?.appearanceId; object.userData.suspends = 0;
      const material=new THREE.MeshStandardMaterial({color:'#123456'});material.userData.characterSlot='outfit';object.add(new THREE.Mesh(new THREE.BoxGeometry(),material));
      if(globalThis.__remoteSkins){const bone=new THREE.Bone(),skin=new THREE.SkinnedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());skin.frustumCulled=false;skin.castShadow=true;skin.add(bone);skin.bind(new THREE.Skeleton([bone]));object.add(skin);}
      return { object, rig:{hipHeight:.9,source:{height:1.7},model:new THREE.Group()}, update(_now, action, _speaking, motion) { object.userData.frames.push({...motion,action}); }, suspend() { object.userData.suspends++; }, dispose() { object.userData.disposed=true; } };
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
  dataset = {};
  getBoundingClientRect() { return {width:110,height:26}; }
  clientWidth = 800;
  clientHeight = 600;
  setAttribute() {}
  append() {}
  remove() {}
}
test('a cinematic actor starts facing its authored travel direction before the first frame',()=>{
 const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
 try{const actors=createRemotePlayers(new THREE.Scene(),new Element(),{snapInitialHeading:true});
  actors.sync([{id:'peer',name:'Peer',position:[0,0,0],altitude:0,yaw:0,appearance:'sable-human'}],null);
  assert.equal(actors.stats()[0].heading,Math.PI);actors.dispose();
 }finally{globalThis.document=previousDocument;}
});

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

test('remote skins cull by the whole figure, and the audit can switch that off for later peers too',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};globalThis.__remoteSkins=true;
  try{
    const scene=new THREE.Scene(),players=createRemotePlayers(scene,new Element());
    const skins=()=>scene.children.flatMap(holder=>holder.getObjectsByProperty('isSkinnedMesh',true));
    players.sync([{id:'peer',name:'Peer',position:[0,0,0],altitude:0,yaw:0,appearance:'sable-human'}],'self');
    await new Promise(resolve=>setImmediate(resolve));
    const [skin]=skins();
    assert.equal(skin.frustumCulled,true);
    assert.deepEqual([skin.boundingSphere.center.toArray(),skin.boundingSphere.radius],[[0,.55*1.7,0],.8*1.7]);
    assert.ok(skin.customDepthMaterial?.isMeshDepthMaterial,'the shadow pass draws it with its kind\'s depth material');
    players.setShadowDepth(false);assert.equal(skin.customDepthMaterial,undefined);players.setShadowDepth(true);assert.ok(skin.customDepthMaterial?.isMeshDepthMaterial);
    players.setCulling(false);assert.equal(skin.frustumCulled,false);
    players.sync([{id:'peer',name:'Peer',position:[0,0,0],altitude:0,yaw:0,appearance:'sable-human'},{id:'late',name:'Late',position:[2,0,0],altitude:0,yaw:0,appearance:'sable-human'}],'self');
    await new Promise(resolve=>setImmediate(resolve));
    assert.deepEqual(skins().map(mesh=>mesh.frustumCulled),[false,false],'a peer loaded during the comparison follows the switch');
    players.setCulling(true);assert.deepEqual(skins().map(mesh=>mesh.frustumCulled),[true,true]);
    players.dispose();
  }finally{delete globalThis.__remoteSkins;globalThis.document=previousDocument;}
});

test('a peer out of view with its shadow skips every pass but keeps animating at a quarter rate',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
  try{
    let light=new THREE.Vector3(0,-1,1).normalize();
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(60,1,.1,500),players=createRemotePlayers(scene,new Element(),{shadowDirection:()=>light});
    camera.position.set(0,1.6,0);camera.lookAt(0,1.6,-10);
    const peer=(id,north,vehicle=null)=>({id,name:id,position:[0,north,0],altitude:0,yaw:0,appearance:'sable-human',vehicle});
    players.sync([peer('ahead',10),peer('behind',-1.5)],'self');
    await new Promise(resolve=>setImmediate(resolve));
    const [ahead,behind]=scene.children,rig=holder=>holder.children.find(child=>child.userData.frames);
    for(let frame=0;frame<8;frame++)players.update(frame*16,camera);
    assert.equal(ahead.visible,true);assert.equal(rig(ahead).userData.frames.length,8);
    assert.equal(behind.visible,false,'figure and shadow are out of view');
    assert.equal(rig(behind).userData.frames.length,2,'a hidden figure animates every fourth frame');
    assert.equal(rig(behind).userData.suspends,0,'its clock keeps running');
    light=new THREE.Vector3(0,-.5,-1).normalize();players.update(200,camera);
    assert.equal(behind.visible,true,'its shadow now falls into view');
    light=null;players.update(216,camera);assert.equal(behind.visible,false,'without sun shadows only the figure counts');
    players.setFigureCulling(false);players.update(232,camera);assert.equal(behind.visible,true,'the audit switch restores it');
    players.setFigureCulling(true);players.sync([peer('ahead',10),peer('behind',-1.5,'rolls')],'self');players.update(248,camera);
    assert.equal(behind.visible,true,'a rider in a car is never culled by the figure sphere');
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

test('confirmed furniture seating pins peer hips and facing even during arrival interpolation',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
  try{
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),players=createRemotePlayers(scene,new Element());
    const peer={id:'guest',name:'Guest',position:[0,0,0],altitude:0,yaw:0,appearance:'sable-human'};
    players.sync([peer],'self');await new Promise(resolve=>setImmediate(resolve));players.update(0,camera);
    const holder=scene.children[0],body=holder.children[0];
    players.sync([{...peer,position:[2,0,0],yaw:-Math.PI/2,gesture:'wave',sitting:{buildId:'build-1',slot:0,height:.705,yaw:Math.PI/2}}],'self');
    players.update(100,camera);
    const frame=body.userData.frames.at(-1);
    assert.equal(frame.riding,true);assert.equal(frame.ridingKind,'seat');assert.equal(frame.seatToFloor,.705);
    assert.equal(frame.speed,0);assert.equal(frame.flying,false);assert.equal(frame.action,'wave');
    assert.equal(holder.position.distanceTo(new THREE.Vector3(2,0,0)),0,'confirmed seat cannot float toward its furniture');
    assert.equal(holder.rotation.y,Math.PI/2,'seat facing does not follow approach direction');
    assert.equal(body.position.y,.705-.9+.025);
    players.sync([peer],'self');players.update(200,camera);assert.equal(body.position.y,0);assert.equal(body.userData.frames.at(-1).riding,false);
    players.dispose();
  }finally{globalThis.document=previousDocument;}
});

test('disposed remote layers ignore late snapshots without recreating scene resources',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
  globalThis.__remoteAvatarAttempts=[];
  try{
    const scene=new THREE.Scene(),players=createRemotePlayers(scene,new Element());
    const peer={id:'peer',name:'Peer',position:[0,0,0],altitude:0,yaw:0,appearance:'sable-human'};
    players.sync([peer],'self');await new Promise(resolve=>setImmediate(resolve));
    players.dispose();
    const attempts=globalThis.__remoteAvatarAttempts.length;
    for(let i=0;i<100;i++)players.sync([peer],'self');
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(scene.children.length,0,'late snapshots cannot resurrect a removed holder');
    assert.equal(players.stats().length,0);
    assert.equal(globalThis.__remoteAvatarAttempts.length,attempts,'no asset work after teardown');
  }finally{globalThis.document=previousDocument;delete globalThis.__remoteAvatarAttempts;}
});

test('crowded remote frames reuse scratch vectors and measure the label viewport once',async()=>{
  const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
  const clone=THREE.Vector3.prototype.clone;let clones=0,widthReads=0,heightReads=0;
  let players;
  try{
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();camera.position.set(0,2,10);camera.lookAt(0,2,0);camera.updateMatrixWorld();
    const host=new Element();
    Object.defineProperties(host,{clientWidth:{get(){widthReads++;return 800;}},clientHeight:{get(){heightReads++;return 600;}}});
    players=createRemotePlayers(scene,host);
    players.sync(Array.from({length:31},(_,i)=>({id:`peer-${i}`,name:'Peer',position:[i/100,0,0],altitude:0,yaw:0,appearance:'sable-human'})),'self');
    await new Promise(resolve=>setImmediate(resolve));
    THREE.Vector3.prototype.clone=function(){clones++;return clone.call(this);};
    for(let frame=0;frame<60;frame++)players.update(frame*1000/60,camera);
    assert.equal(clones,0,'interpolation and label projection must reuse scratch vectors');
    assert.equal(widthReads,60,'read layout once per frame, not per visible peer');
    assert.equal(heightReads,60);
  }finally{THREE.Vector3.prototype.clone=clone;players?.dispose();globalThis.document=previousDocument;}
});

test('speaking residents get a nameplate marker and the speaker cadence, set at event time', async () => {
  const previousDocument = globalThis.document;
  class Label extends Element { constructor() { super(); this.dataset = {}; this.textContent = ''; this.hidden = false; } }
  globalThis.document = { createElement: () => new Label() };
  try {
    const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(), players = createRemotePlayers(scene, new Element());
    players.setSpeaking(['early']);
    players.sync([{ id: 'peer', name: 'Peer', position: [0, 0, 0], altitude: 0, yaw: 0 }, { id: 'early', name: 'Early', position: [1, 0, 0], altitude: 0, yaw: 0 }], 'self');
    await new Promise(resolve => setImmediate(resolve));
    const label = id => scene.children.length && [...scene.children].map((_, index) => index).map(() => null) && null;
    void label;
    const entries = scene.children;
    assert.equal(entries.length, 2);
    players.update(0, camera);
    const frames = entries.map(holder => holder.children[0].userData.frames);
    players.setSpeaking(['peer']);
    players.update(16, camera);
    players.update(32, camera);
    assert.deepEqual(frames.map(list => list.at(-1).action), ['continue', 'continue']);
    const speakingFlags = () => players.stats().map(entry => entry.id);
    assert.deepEqual(speakingFlags().sort(), ['early', 'peer']);
    players.dispose();
  } finally { globalThis.document = previousDocument; }
});
const {customizedCharacterDefinition}=await import('../src/character-customization.js');
const {CHARACTER_PALETTES}=await import('../src/character-customization.js');
const custom=(palette,revision=1)=>customizedCharacterDefinition('peer','sable-human',{palette,revision});
const peerLook=character=>({id:'peer',name:'Peer',position:[0,0,0],altitude:0,yaw:0,appearance:'sable-human',character});
const settle=()=>new Promise(resolve=>setImmediate(resolve));
test('same-base published revisions recolor the existing peer rig and restore authored fallback',async()=>{
 const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
 try{
  const scene=new THREE.Scene(),players=createRemotePlayers(scene,new Element());
  players.sync([peerLook(custom('rose'))],'self');await settle();const root=scene.children[0].children[0],material=root.children[0].material;
  assert.equal(material.color.getHex(),new THREE.Color(CHARACTER_PALETTES.rose.color).getHex());
  players.sync([peerLook(custom('midnight',2))],'self');await settle();assert.equal(scene.children[0].children[0],root);
  assert.equal(material.color.getHex(),new THREE.Color(CHARACTER_PALETTES.midnight.color).getHex());assert.equal(players.stats()[0].character.revision,2);
  players.sync([peerLook({...custom('rose'),ownerId:'someone-else'})],'self');assert.equal(material.color.getHex(),0x123456);
  assert.equal(players.stats()[0].character.revision,0);
  players.dispose();assert.equal(root.userData.disposed,true);assert.equal(material.color.getHex(),0x123456);
 }finally{globalThis.document=previousDocument;}
});
test('an in-flight peer rig uses the latest same-base revision and never revives a departed player',async()=>{
 const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};let release;
 globalThis.__remoteAvatarGate=()=>new Promise(resolve=>{release=resolve;});
 try{
  const scene=new THREE.Scene(),players=createRemotePlayers(scene,new Element());
  players.sync([peerLook(custom('rose'))],'self');players.sync([peerLook(custom('midnight',2))],'self');release();await settle();
  assert.equal(players.stats()[0].character.palette,'midnight');assert.equal(scene.children[0].children[0].children[0].material.color.getHex(),new THREE.Color(CHARACTER_PALETTES.midnight.color).getHex());
  players.dispose();const gone=createRemotePlayers(scene,new Element());gone.sync([peerLook(custom('rose'))],'self');gone.dispose();release();await settle();assert.equal(scene.children.length,0);
 }finally{delete globalThis.__remoteAvatarGate;globalThis.document=previousDocument;}
});

test('a newly joined peer remains visible through first asset failure and retry',async()=>{
 const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};
 let time=0,release;globalThis.__remoteAvatarGate=()=>new Promise(resolve=>{release=resolve;});
 globalThis.__remoteFailOnce='sable-human';globalThis.__remoteAvatarAttempts=[];
 let players;
 try{
  const scene=new THREE.Scene();players=createRemotePlayers(scene,new Element(),{now:()=>time});
  players.sync([peerLook(custom('rose'))],'self');
  const holder=scene.children[0],placeholder=holder.children[0];
  assert.ok(placeholder,'a peer has a visible body before an asset request settles');
  const bounds=new THREE.Box3().setFromObject(placeholder);
  assert.ok(!bounds.isEmpty()&&bounds.max.y-bounds.min.y>1,'fallback has a human-scale silhouette');
  assert.equal(players.stats()[0].ready,false);assert.equal(players.stats()[0].fallback,true);
  const resources=new Map();placeholder.traverse(mesh=>{if(mesh.isMesh)for(const item of [mesh.geometry,...[mesh.material].flat()])resources.set(item,0);});
  for(const resource of resources.keys())resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));
  release();await settle();assert.equal(placeholder.parent,holder,'failed initial load retains fallback');
  players.sync([peerLook(custom('midnight',2))],'self');assert.equal(globalThis.__remoteAvatarAttempts.length,1,'failed loads back off');
  time=2000;players.sync([peerLook(custom('midnight',2))],'self');release();await settle();
  assert.equal(players.stats()[0].ready,true);assert.equal(players.stats()[0].fallback,false);
  assert.equal(players.stats()[0].character.palette,'midnight');assert.equal(placeholder.parent,null);
  assert.ok([...resources.values()].every(count=>count===1),'replacing a fallback releases each owned resource once');
 }finally{players?.dispose();delete globalThis.__remoteAvatarGate;delete globalThis.__remoteFailOnce;delete globalThis.__remoteAvatarAttempts;globalThis.document=previousDocument;}
});

test('pending fallback resources are released on departure and layer teardown',async()=>{
 const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};let release;
 globalThis.__remoteAvatarGate=()=>new Promise(resolve=>{release=resolve;});
 try{
  for(const action of ['leave','dispose']){
   const scene=new THREE.Scene(),players=createRemotePlayers(scene,new Element());
   players.sync([peerLook(custom('rose'))],'self');const resources=new Map();
   scene.children[0].children[0].traverse(mesh=>{if(mesh.isMesh)for(const item of [mesh.geometry,...[mesh.material].flat()])resources.set(item,0);});
   for(const resource of resources.keys())resource.addEventListener('dispose',()=>resources.set(resource,resources.get(resource)+1));
   if(action==='leave')players.sync([],'self');else players.dispose();
   release();await settle();players.dispose();
   assert.equal(scene.children.length,0,'a late rig cannot resurrect the departed peer');
   assert.ok(resources.size>0&&[...resources.values()].every(count=>count===1),`${action} disposes fallback resources exactly once`);
  }
 }finally{delete globalThis.__remoteAvatarGate;globalThis.document=previousDocument;}
});

test('a pending placeholder follows the peer position and existing visibility rules',async()=>{
 const previousDocument=globalThis.document;globalThis.document={createElement:()=>new Element()};let release,visible=true,players;
 globalThis.__remoteAvatarGate=()=>new Promise(resolve=>{release=resolve;});
 try{
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();players=createRemotePlayers(scene,new Element(),{isVisible:()=>visible});
  players.sync([peerLook(custom('rose'))],'self');const holder=scene.children[0],placeholder=holder.children[0];
  players.sync([{...peerLook(custom('rose')),position:[12,3,.5],altitude:1}],'self');players.update(0,camera);
  assert.deepEqual(holder.position.toArray(),[12,1.5,-3]);assert.equal(holder.visible,true);assert.equal(players.stats()[0].ready,false);
  camera.position.set(200,0,0);players.update(16,camera);assert.equal(holder.visible,false);
  camera.position.set(12,2,0);players.update(32,camera);assert.equal(holder.visible,true);
  visible=false;players.update(48,camera);assert.equal(holder.visible,false);assert.equal(holder.children[0],placeholder);
  players.dispose();release();await settle();
 }finally{players?.dispose();delete globalThis.__remoteAvatarGate;globalThis.document=previousDocument;}
});


test('crowd names avoid overlap while all avatar anchors remain visible and text measures are cached',async()=>{
 const previousDocument=globalThis.document;let measurements=0,fontChanged;const labels=[];
 class Label extends Element {getBoundingClientRect(){measurements++;return {width:110,height:26};}}
 const fonts={addEventListener(name,listener){assert.equal(name,'loadingdone');fontChanged=listener;},removeEventListener(name,listener){assert.equal(name,'loadingdone');assert.equal(listener,fontChanged);fontChanged=null;}};
 globalThis.document={fonts,createElement(){const label=new Label();labels.push(label);return label;}};
 let players;
 try{
  const scene=new THREE.Scene(),host=new Element(),camera=new THREE.PerspectiveCamera(50,800/600,.1,200);camera.position.set(0,2,10);camera.lookAt(0,2,0);camera.updateMatrixWorld();
  const peers=['a','b','c'].map((id,i)=>({id,name:'Peer '+id,position:[i*.02,0,0],altitude:0,yaw:0,appearance:'sable-human'}));
  players=createRemotePlayers(scene,host);players.sync(peers,'self');await settle();players.update(0,camera);
  assert.equal(labels.slice(1).filter(label=>!label.hidden).length,1,'overlapping names must not all draw');
  assert.equal(players.stats().filter(p=>p.onScreen).length,3);
  assert.equal(players.stats().filter(p=>p.labelVisible).length,1);assert(scene.children.every(h=>h.visible));
  assert.equal(measurements,3);
  for(let frame=1;frame<=60;frame++){players.sync(peers,'self');players.update(frame*16,camera);}
  assert.equal(measurements,3,'unchanged snapshots and frames do not remeasure text');
  players.setSpeaking(['c']);players.update(1000,camera);assert.equal(players.stats().find(p=>p.labelVisible).id,'c');assert.equal(measurements,3);
  peers[2]={...peers[2],name:'Renamed peer'};players.sync(peers,'self');players.update(1016,camera);assert.equal(measurements,4,'only changed text invalidates its size');
  host.clientWidth=390;players.update(1032,camera);assert.equal(measurements,7,'viewport changes invalidate cached bounds');
  fontChanged();players.update(1048,camera);assert.equal(measurements,10,'loaded fonts invalidate cached bounds');
  players.sync([peers[0]],'self');players.update(1064,camera);assert.equal(players.stats().length,1);assert.equal(players.stats()[0].labelVisible,true);
  players.dispose();assert.equal(fontChanged,null,'dispose removes font listener');
 }finally{players?.dispose();globalThis.document=previousDocument;}
});
