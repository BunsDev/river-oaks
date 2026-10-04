import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationAllowed, windowBounds } from '../runtime.js';

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

test('the development bridge is reused when running, started with local voices, and never blocks the window',async()=>{
 const {bridgeCommand,bridgeReady,waitForBridge,BRIDGE_HEALTH}=await import('../runtime.js');
 assert.deepEqual(bridgeCommand(),{command:'uv',args:['run','--extra','voice','river-oaks','serve','--port','8765']});
 assert.deepEqual(bridgeCommand({voice:false}).args,['run','river-oaks','serve','--port','8765']);
 assert.equal(await bridgeReady(async url=>{assert.equal(url,BRIDGE_HEALTH);return Response.json({status:'ok',mode:'local_rules'});}),true);
 assert.equal(await bridgeReady(async()=>Response.json({status:'ok',mode:'jev',metrics:{}})),true,'a bridge with a configured key reports the jev mode');
 assert.equal(await bridgeReady(async()=>Response.json({hello:'other service'})),false,'a different service on the port is not the bridge');
 assert.equal(await bridgeReady(async()=>Response.json({status:'ok'})),false,'a generic ok without the bridge mode is not the bridge');
 assert.equal(await bridgeReady(async()=>Response.json({status:'ok',mode:'surprise'})),false,'an unknown mode is not the bridge');
 assert.equal(await bridgeReady(async()=>new Response('down',{status:503})),false);
 assert.equal(await bridgeReady(async()=>{throw new TypeError('fetch failed');}),false,'connection refused is simply not ready');
 let calls=0;const sleeps=[];
 assert.equal(await waitForBridge(async()=>{calls++;if(calls<3)throw new Error('starting');return Response.json({status:'ok',mode:'local_rules'});},{sleep:async ms=>{sleeps.push(ms);}}),true);
 assert.equal(calls,3);assert.deepEqual(sleeps,[500,500]);
 assert.equal(await waitForBridge(async()=>{throw new Error('never');},{attempts:4,sleep:async()=>{}}),false,'a broken install gives up instead of stalling');
});
