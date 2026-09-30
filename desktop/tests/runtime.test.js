import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAsset, navigationAllowed, windowBounds } from '../runtime.js';

test('bundled assets resolve only inside the game, including encoded paths and symlinks', async t => {
  const temp = await realpath(await mkdtemp(join(tmpdir(), 'river-oaks-assets-')));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const root = join(temp, 'game');
  await mkdir(root);
  await writeFile(join(root, 'index.html'), 'game');
  await writeFile(join(temp, 'private.txt'), 'private');
  await symlink(join(temp, 'private.txt'), join(root, 'escape.txt'));
  assert.equal(await resolveAsset(root, 'app://game/'), join(root, 'index.html'));
  assert.equal(await resolveAsset(root, 'app://game/index.html?v=1'), join(root, 'index.html'));
  for (const url of ['app://other/index.html', 'https://game/index.html', 'app://game/%2e%2e%2fprivate.txt', 'app://game/escape.txt', 'app://game/missing.js', 'app://game/%00', 'app://game/%ZZ']) {
    assert.equal(await resolveAsset(root, url), null, url);
  }
});

test('navigation stays inside the exact game origin', () => {
  assert.equal(navigationAllowed('app://game/#visit', 'app://game/'), true);
  assert.equal(navigationAllowed('app://other/', 'app://game/'), false);
  assert.equal(navigationAllowed('http://127.0.0.1:5174/path', 'http://127.0.0.1:5174/'), true);
  for (const url of ['http://127.0.0.1:5175/', 'https://evil.test/', 'javascript:alert(1)', 'file:///etc/passwd', 'bad']) {
    assert.equal(navigationAllowed(url, 'http://127.0.0.1:5174/'), false);
  }
});

test('window restoration fits current displays and discards corrupt or disconnected bounds', () => {
  const displays = [{ x: 0, y: 0, width: 1440, height: 900 }];
  assert.deepEqual(windowBounds({ x: 20, y: 30, width: 1200, height: 800 }, displays), { x: 20, y: 30, width: 1200, height: 800 });
  assert.deepEqual(windowBounds({ x: 2000, y: 30, width: 1200, height: 800 }, displays), { width: 1280, height: 800 });
  assert.deepEqual(windowBounds({ x: null, y: 0, width: -1, height: 'bad' }, displays), { width: 1280, height: 800 });
  assert.deepEqual(windowBounds({}, [{ x: 0, y: 0, width: 1024, height: 768 }]), { width: 1024, height: 768 });
});

test('packaged bridge permits only bounded fixed loopback endpoints',async()=>{
 const {bridgeRequest}=await import('../runtime.js');let target;
 const fetcher=async(url,options)=>{target=url;assert.equal(options.credentials,'omit');return Response.json({available:false});};
 const allowed=await bridgeRequest(new Request('app://game/v1/chauffeur'),fetcher);assert.equal(allowed.status,200);assert.equal(target,'http://127.0.0.1:8765/v1/chauffeur');
 target=null;assert.equal((await bridgeRequest(new Request('app://game/v1/arbitrary'),fetcher)).status,404);assert.equal(target,null);
 assert.equal((await bridgeRequest(new Request('app://game/v1/settings/jev',{method:'PUT',body:'x'.repeat(17000)}),fetcher)).status,413);
 assert.equal((await bridgeRequest(new Request('app://game/v1/chauffeur'),async()=>{throw new Error('private');})).status,503);
});

test('desktop forwards bounded Jev speech as audio and permits changing his selected voice',async()=>{
 const {bridgeRequest}=await import('../runtime.js');let target;
 const audio=await bridgeRequest(new Request('app://game/v1/voice/jev',{method:'POST',body:JSON.stringify({text:'Hello'})}),async(url)=>{target=url;return new Response('ID3audio',{headers:{'Content-Type':'audio/mpeg'}});});
 assert.equal(target,'http://127.0.0.1:8765/v1/voice/jev');assert.equal(audio.headers.get('content-type'),'audio/mpeg');assert.equal(await audio.text(),'ID3audio');
 const selected=await bridgeRequest(new Request('app://game/v1/settings/elevenlabs/voice',{method:'PUT',body:JSON.stringify({voice_id:'s3TPKV1kjDlVtZbl4Ksh'})}),async()=>Response.json({configured:false}));assert.equal(selected.status,200);
});

test('the development bridge is reused when running, started with local voices, and never blocks the window',async()=>{
 const {bridgeCommand,bridgeReady,waitForBridge,BRIDGE_HEALTH}=await import('../runtime.js');
 assert.deepEqual(bridgeCommand(),{command:'uv',args:['run','--extra','voice','river-oaks','serve','--port','8765']});
 assert.deepEqual(bridgeCommand({voice:false}).args,['run','river-oaks','serve','--port','8765']);
 assert.equal(await bridgeReady(async url=>{assert.equal(url,BRIDGE_HEALTH);return Response.json({status:'ok',mode:'local_rules'});}),true);
 assert.equal(await bridgeReady(async()=>Response.json({hello:'other service'})),false,'a different service on the port is not the bridge');
 assert.equal(await bridgeReady(async()=>new Response('down',{status:503})),false);
 assert.equal(await bridgeReady(async()=>{throw new TypeError('fetch failed');}),false,'connection refused is simply not ready');
 let calls=0;const sleeps=[];
 assert.equal(await waitForBridge(async()=>{calls++;if(calls<3)throw new Error('starting');return Response.json({status:'ok'});},{sleep:async ms=>{sleeps.push(ms);}}),true);
 assert.equal(calls,3);assert.deepEqual(sleeps,[500,500]);
 assert.equal(await waitForBridge(async()=>{throw new Error('never');},{attempts:4,sleep:async()=>{}}),false,'a broken install gives up instead of stalling');
});
