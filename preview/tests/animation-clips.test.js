import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { AnimationMixer, LoopOnce } from 'three';

function fixture() {
  const binary=Buffer.alloc(40);
  [0,1,0,0,0,1,0,0,Math.SQRT1_2,Math.SQRT1_2].forEach((v,i)=>binary.writeFloatLE(v,i*4));
  const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{name:'root',children:[1]},{name:'hand'}],buffers:[{byteLength:40}],bufferViews:[{buffer:0,byteLength:8},{buffer:0,byteOffset:8,byteLength:32}],accessors:[{bufferView:0,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},{bufferView:1,componentType:5126,count:2,type:'VEC4'}],animations:[{name:'Wave',samplers:[{input:0,output:1}],channels:[{sampler:0,target:{node:1,path:'rotation'}}]}]};
  let json=Buffer.from(JSON.stringify(gltf));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);
  const header=Buffer.alloc(20);header.write('glTF');header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+binary.length,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);
  const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(binary.length);binHeader.writeUInt32LE(0x004e4942,4);
  return Buffer.concat([header,json,binHeader,binary]);
}
async function setup(t) {
  const module=await import('../src/animation-clips.js').catch(()=>null);
  assert.equal(typeof module?.createAnimationClipLibrary,'function','a family-gated clip library must exist');
  const bytes=fixture();let requests=0,fail=false;
  const server=createServer((req,res)=>{requests++;if(fail){res.writeHead(503);res.end();}else res.end(bytes);});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const entry={url:`http://127.0.0.1:${server.address().port}/wave.glb`,family:'quaternius-ual-v1',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),clips:['Wave'],joints:['root','hand']};
  return {library:module.createAnimationClipLibrary({registry:{wave:entry}}),entry,requests:()=>requests,fail:value=>{fail=value;}};
}

test('loads a pinned clip lazily through the runtime GLTF parser and plays without root movement',async t=>{
  const {library,requests}=await setup(t);assert.equal(requests(),0);
  const [first,second]=await Promise.all([library.load('wave',{family:'quaternius-ual-v1'}),library.load('wave',{family:'quaternius-ual-v1'})]);
  assert.equal(requests(),1);assert.notEqual(first.scene,second.scene);assert.notEqual(first.animations[0],second.animations[0]);
  const mixer=new AnimationMixer(first.scene);const action=mixer.clipAction(first.animations[0]);action.setLoop(LoopOnce,1);action.clampWhenFinished=true;action.play();mixer.setTime(0.5);
  assert.ok(Math.abs(first.scene.getObjectByName('hand').quaternion.z-Math.sin(Math.PI/8))<0.00001);
  assert.deepEqual(first.scene.getObjectByName('root').position.toArray(),[0,0,0]);
  assert.equal(second.scene.getObjectByName('hand').quaternion.z,0);
  mixer.stopAllAction();mixer.uncacheRoot(first.scene);
});

test('refuses current MakeHuman, missing families and unknown groups before fetching',async t=>{
  const {library,requests}=await setup(t);
  for(const family of ['makehuman-game-v1',undefined,'ubc-regular-female','__proto__'])await assert.rejects(library.load('wave',{family}),/family/);
  for(const name of ['walk','__proto__'])await assert.rejects(library.load(name,{family:'quaternius-ual-v1'}),/group/);
  assert.equal(requests(),0);
});

test('failed loads are not cached permanently or automatically retried',async t=>{
  const {library,requests,fail}=await setup(t);fail(true);
  await assert.rejects(library.load('wave',{family:'quaternius-ual-v1'}),/503/);assert.equal(requests(),1);
  fail(false);const result=await library.load('wave',{family:'quaternius-ual-v1'});assert.equal(result.animations.length,1);assert.equal(requests(),2);
});

test('rejects changed bytes and incomplete clip catalogs before returning animations',async t=>{
  const {entry}=await setup(t);const {createAnimationClipLibrary}=await import('../src/animation-clips.js');
  for(const change of [{sha256:'0'.repeat(64)},{bytes:entry.bytes+1},{clips:['Missing']}]){
    const library=createAnimationClipLibrary({registry:{wave:{...entry,...change}}});
    await assert.rejects(library.load('wave',{family:'quaternius-ual-v1'}),/integrity|clip/);
  }
});

test('all five shipped groups match their receipts and play all 39 clips without moving the root',async t=>{
  const { readFile }=await import('node:fs/promises');
  const { ANIMATION_CLIP_GROUPS,createAnimationClipLibrary }=await import('../src/animation-clips.js');
  const expected={'ambient-idle':8,seated:10,service:6,garden:9,interact:6};
  assert.deepEqual(Object.keys(ANIMATION_CLIP_GROUPS).sort(),Object.keys(expected).sort());
  const server=createServer(async(req,res)=>{
    const entry=Object.values(ANIMATION_CLIP_GROUPS).find(item=>item.url===req.url);
    if(!entry){res.writeHead(404);res.end();return;}
    try{res.end(await readFile(new URL(`../public${entry.url}`,import.meta.url)));}
    catch{res.writeHead(500);res.end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  t.after(()=>new Promise(resolve=>server.close(resolve)));
  const origin=`http://127.0.0.1:${server.address().port}`;
  const registry=Object.fromEntries(Object.entries(ANIMATION_CLIP_GROUPS).map(([id,entry])=>[id,{...entry,url:origin+entry.url}]));
  const library=createAnimationClipLibrary({registry});let total=0;
  for(const [group,count]of Object.entries(expected)){
    const entry=ANIMATION_CLIP_GROUPS[group];
    const receipt=JSON.parse(await readFile(new URL(`../public${entry.receipt}`,import.meta.url),'utf8'));
    assert.equal(receipt.license,'CC0-1.0');
    assert.equal(receipt.groups[group].sha256,entry.sha256);
    assert.equal(receipt.groups[group].bytes,entry.bytes);
    assert.deepEqual(receipt.groups[group].clips,entry.clips);
    const {scene,animations}=await library.load(group,{family:'quaternius-ual-v1'});
    assert.equal(animations.length,count);
    scene.traverse(node=>assert.equal(Boolean(node.isMesh),false));
    const root=scene.getObjectByName('root');assert.ok(root);
    const position=root.position.toArray();
    const mixer=new AnimationMixer(scene);
    for(const clip of animations){
      mixer.stopAllAction();const action=mixer.clipAction(clip);action.play();
      for(const fraction of [0,0.25,0.5,0.75]){
        mixer.setTime(clip.duration*fraction);
        assert.deepEqual(root.position.toArray(),position,`${group}/${clip.name}: root drift`);
        for(const name of entry.joints){
          const node=scene.getObjectByName(name);assert.ok(node,name);
          assert.ok([...node.position.toArray(),...node.quaternion.toArray(),...node.scale.toArray()].every(Number.isFinite));
          assert.ok(Math.abs(node.quaternion.lengthSq()-1)<0.001,`${group}/${clip.name}/${name}`);
        }
      }
      total++;
    }
    mixer.stopAllAction();mixer.uncacheRoot(scene);
  }
  assert.equal(total,39);
});
