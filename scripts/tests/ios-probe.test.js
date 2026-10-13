import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
const source = readFileSync(new URL('../../experiments/ios-probe/Web/probe.js', import.meta.url), 'utf8');
const context = vm.createContext({}); vm.runInContext(source, context);
const create = options => context.IOSProbe.createCollector(options);
const plain = value => JSON.parse(JSON.stringify(value));
test('records raw foreground intervals and nearest-rank percentiles', () => {
 const c=create(); [0,10,30,70].forEach(at=>c.frame(at));
 assert.deepEqual(plain(c.snapshot().intervalsMs),[10,20,40]);
 assert.deepEqual(plain(c.snapshot().distribution),{count:3,p50Ms:20,p95Ms:40,p99Ms:40,maxMs:40});
});
test('background time is excluded with explicit discontinuity, never a fake long frame', () => {
 const c=create(); c.frame(0); c.frame(20); c.visibility(false); c.frame(10000); c.visibility(true); c.frame(20000); c.frame(20030);
 assert.deepEqual(plain(c.snapshot().intervalsMs),[20,30]); assert.equal(c.snapshot().interruptions,1);
});
test('overflow and invalid samples invalidate evidence instead of silently dropping it', () => {
 const c=create({limit:2}); [0,10,20,30].forEach(at=>c.frame(at)); c.frame(NaN);
 assert.equal(c.snapshot().overflow,true); assert.equal(c.snapshot().invalid,1);
});
test('draining retains frame continuity but drains only delivered samples', () => {
 const c=create(); c.frame(0); c.frame(20); assert.equal(c.drain().intervalsMs.length,1); c.frame(50);
 assert.deepEqual(plain(c.drain().intervalsMs),[30]); assert.equal(c.drain().intervalsMs.length,0);
});
test('non-monotonic timestamps are flagged, not included as performance evidence', () => {
 const c=create(); [10,20,19,30].forEach(at=>c.frame(at)); assert.equal(c.snapshot().invalid,1);
 assert.deepEqual(plain(c.snapshot().intervalsMs),[10]);
});
test('installed sampler excludes loading/background and exports no page text or account data', () => {
 const listeners = new Map(); let callback, ready=false, now=0;
 const document={visibilityState:'visible', addEventListener:(n,fn)=>listeners.set(n,fn), removeEventListener(){}, querySelector: selector => selector==='#canvas-host'?{dataset:{playerReady:String(ready),renderStats:JSON.stringify({calls:25,triangles:300,token:'secret'}),quality:JSON.stringify({mode:'auto',occlusion:true,token:'secret'})}}:null};
 const sandbox=vm.createContext({document,performance:{now:()=>now,getEntriesByType:()=>[],addEventListener(){},removeEventListener(){}},requestAnimationFrame:fn=>(callback=fn,1),cancelAnimationFrame(){},innerWidth:400,innerHeight:800,devicePixelRatio:3});
 vm.runInContext(source,sandbox); const probe=sandbox.IOSProbe.install();
 const tick=at=>{now=at;callback(at);};
 tick(0);tick(20);assert.equal(probe.read().intervalsMs.length,0);
 ready=true;tick(30);tick(50);tick(80);
 assert.deepEqual(plain(probe.read().intervalsMs),[20,30]);
 document.visibilityState='hidden';listeners.get('visibilitychange')();tick(10000);
 document.visibilityState='visible';listeners.get('visibilitychange')();tick(20000);tick(20040);
 const report=probe.read();assert.deepEqual(plain(report.intervalsMs),[40]);assert.equal(report.ready,true);
 assert.deepEqual(plain(report.quality),{mode:'auto',occlusion:true});assert.deepEqual(plain(report.renderCounts),{calls:25,triangles:300});assert.equal(JSON.stringify(report).includes('secret'),false);
 probe.stop();
});
const { summarizeProbe } = await import('../ios-probe.mjs');
const start={event:'start',sourceSHA:'a'.repeat(40),sourceDirty:'false',configuration:'Release'};
const sample=(frames, extra={})=>({event:'sample',navigationID:'n1',thermalState:0,page:{ready:true,intervalsMs:frames,overflow:false,invalid:0,...extra}});
test('summary never mistakes warm login or short RAF runs for architecture acceptance', () => {
 const report=summarizeProbe([start,sample([20,30,40]),{event:'stop',finalDrainComplete:true}]);
 assert.equal(report.frameIntervals.count,3);assert.equal(report.frameIntervals.p95Ms,40);
 assert.equal(report.foregroundSampledSeconds,.09);assert.equal(report.recordingFinalized,true);
 assert.equal(report.architectureAccepted,false);assert.ok(report.gaps.includes('game-render-loop/GPU timing unavailable'));
});
test('summary identifies interrupted, invalid, debug and missing scene evidence', () => {
 const report=summarizeProbe([{...start,configuration:'Debug'},sample([20],{ready:false}),sample([20],{overflow:true,invalid:1})]);
 assert.equal(report.recordingFinalized,false);assert.equal(report.valid,false);
 assert.ok(report.gaps.includes('non-Release build'));assert.ok(report.gaps.includes('invalid or overflowing samples'));
});
test('summary rejects malformed records and invalid frame values', () => {
 assert.throws(()=>summarizeProbe([]));
 assert.throws(()=>summarizeProbe([start,sample([Infinity])]));
 assert.throws(()=>summarizeProbe([start,sample([-1])]));
});
test('summary retains frames collected before readiness changes at drain time', () => {
 const report=summarizeProbe([start,sample([20,30],{ready:false}),{event:'stop',finalDrainComplete:true}]);
 assert.equal(report.frameIntervals?.count,2);assert.equal(report.foregroundSampledSeconds,.05);
 assert.equal(report.readySamples,0);assert.equal(report.gaps.includes('no playable-scene timing'),false);
});
test('summary reports WebContent terminations even when frame data and final drain are valid', () => {
 const report=summarizeProbe([start,sample([20,30]),{event:'web-content-terminated'},{event:'manual-reload'},sample([40]),{event:'web-content-terminated'},{event:'stop',finalDrainComplete:true}]);
 assert.equal(report.webContentTerminations,2);assert.equal(report.valid,false);
 assert.equal(report.frameIntervals.count,3);assert.equal(report.recordingFinalized,true);
 assert.ok(report.gaps.includes('WebContent terminated; stability gate failed'));
});
test('asset-isolation trials preserve measurements but cannot be representative runs', () => {
 const report=summarizeProbe([{...start,blockedAssetGroups:['characters']},sample([20,30]),{event:'stop',finalDrainComplete:true}]);
 assert.equal(report.valid,false);assert.deepEqual(report.blockedAssetGroups,['characters']);
 assert.equal(report.frameIntervals.count,2);
 for (const group of ['standard-rigs','special-rigs']) assert.equal(summarizeProbe([{...start,blockedAssetGroups:[group]}]).valid,false);
 assert.ok(report.gaps.includes('asset-isolation trial; reduced content is not representative'));
});
test('one-shot scene snapshot whitelists bounded numeric diagnostics without installing a collector', () => {
 const dataset={playerReady:'false',matureTrees:'54',plantedBeds:'12',storePeopleReady:'0',storePeopleTotal:'80',renderStats:'{"calls":42,"textures":64,"token":"secret"}',pipeline:'{"samples":4,"ao":true,"bloom":true,"renderScale":1,"secret":"secret"}',token:'secret'};
 const sandbox=vm.createContext({document:{querySelector:()=>({dataset})}});
 vm.runInContext(source,sandbox);
 const snapshot=plain(sandbox.IOSProbe.sceneSnapshot());
 assert.deepEqual(snapshot,{ready:false,renderCounts:{calls:42,textures:64},pipeline:{samples:4,renderScale:1,ao:true,bloom:true},matureTrees:54,plantedBeds:12,storePeopleReady:0,storePeopleTotal:80});
 assert.equal(sandbox.__iosProbe,undefined);
 dataset.renderStats='invalid';dataset.matureTrees='Infinity';dataset.plantedBeds='';
 const invalid=plain(sandbox.IOSProbe.sceneSnapshot());
 assert.deepEqual(invalid.renderCounts,{});assert.equal('matureTrees' in invalid,false);assert.equal('plantedBeds' in invalid,false);
});
test('decode experiment preserves inputs/results while allowing only one active operation and recovering after rejection', async () => {
 const decodeSource=readFileSync(new URL('../../experiments/ios-probe/Web/decode-queue.js',import.meta.url),'utf8');
 const sandbox=vm.createContext({});vm.runInContext(decodeSource,sandbox);
 const calls=[],releases=[];let active=0,peak=0;
 const receiver={};const inputs=[{name:'one'},{name:'two'},{name:'three'}];const options={imageOrientation:'flipY'};
 const decode=function(...args){assert.equal(this,receiver);calls.push(args);active++;peak=Math.max(peak,active);return new Promise((resolve,reject)=>releases.push({resolve:value=>{active--;resolve(value);},reject:error=>{active--;reject(error);}}));};
 const queue=sandbox.IOSProbeDecodes.createQueue(decode);
 const first=queue.run.call(receiver,inputs[0],options),second=queue.run.call(receiver,inputs[1]),third=queue.run.call(receiver,inputs[2]);
 const secondRejected=assert.rejects(second,/decode failed/);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,1);assert.equal(calls[0][0],inputs[0]);assert.equal(calls[0][1],options);
 const bitmap={width:10,height:20};releases[0].resolve(bitmap);assert.equal(await first,bitmap);
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,2);releases[1].reject(new Error('decode failed'));await secondRejected;
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls.length,3);releases[2].resolve({width:2,height:3});await third;
 assert.equal(peak,1);assert.deepEqual(plain(queue.snapshot()),{enqueued:3,completed:2,failed:1,active:0,maxActive:1,queued:0,decodedRGBABytes:824});
});
test('decode installation is idempotent, handles missing support, and emits only numeric counters', async () => {
 const decodeSource=readFileSync(new URL('../../experiments/ios-probe/Web/decode-queue.js',import.meta.url),'utf8');
 const dataset={},document={documentElement:{dataset}};
 const sandbox=vm.createContext({document,Blob,createImageBitmap:async()=>({width:3,height:4,secret:'not exported'})});vm.runInContext(decodeSource,sandbox);
 sandbox.IOSProbeDecodes.install();const installed=sandbox.createImageBitmap;sandbox.IOSProbeDecodes.install();assert.equal(sandbox.createImageBitmap,installed);
 await sandbox.createImageBitmap(new Blob(['not exported']));
 const report=JSON.parse(dataset.iosProbeDecodes);assert.equal(report.completed,1);assert.equal(report.decodedRGBABytes,48);assert.equal(JSON.stringify(report).includes('not exported'),false);
 const missing=vm.createContext({document:{documentElement:{dataset:{}}}});vm.runInContext(decodeSource,missing);missing.IOSProbeDecodes.install();assert.equal(missing.createImageBitmap,undefined);
});
test('summary marks serialized decoding as an experiment, not unchanged acceptance',()=>{
 const report=summarizeProbe([{...start,serializedDecodes:true},sample([20]),{event:'stop',finalDrainComplete:true}]);
 assert.equal(report.valid,false);assert.ok(report.gaps.includes('serialized image decoding experiment; inspect separate control'));
});

test('decode experiment leaves mutable sources immediate and snapshots plain Blob options', async()=>{
 const decodeSource=readFileSync(new URL('../../experiments/ios-probe/Web/decode-queue.js',import.meta.url),'utf8');
 const calls=[],releases=[];
 const sandbox=vm.createContext({Blob,createImageBitmap:(...args)=>{calls.push(args);return new Promise(resolve=>releases.push(resolve));}});
 vm.runInContext(decodeSource,sandbox);sandbox.IOSProbeDecodes.install();
 const first=sandbox.createImageBitmap(new Blob(['first']));
 await new Promise(resolve=>setImmediate(resolve));
 sandbox.input=new Blob(['second']);
 vm.runInContext("globalThis.options={imageOrientation:'flipY'};globalThis.second=createImageBitmap(input,options);options.imageOrientation='none'",sandbox);
 const mutable={width:5,height:6};const immediate=sandbox.createImageBitmap(mutable);
 assert.equal(calls.length,2);assert.equal(calls[1][0],mutable);releases[1]({width:5,height:6});await immediate;
 releases[0]({width:1,height:1});await first;
 await new Promise(resolve=>setImmediate(resolve));assert.equal(calls[2][1].imageOrientation,'flipY');releases[2]({width:2,height:2});await sandbox.second;
});

test('summary keeps HTML image decoding distinct from baseline acceptance',()=>{
 const report=summarizeProbe([{...start,htmlImages:true},sample([20]),{event:'stop',finalDrainComplete:true}]);
 assert.equal(report.valid,false);assert.ok(report.gaps.includes('HTML image decoder experiment; inspect separate control'));
});

test('HTML decoder control records observed feature state without changing assets',()=>{
 const decodeSource=readFileSync(new URL('../../experiments/ios-probe/Web/decode-queue.js',import.meta.url),'utf8');
 const dataset={};const sandbox=vm.createContext({createImageBitmap(){},document:{documentElement:{dataset},querySelector:()=>null}});
 vm.runInContext(decodeSource,sandbox);sandbox.IOSProbeDecodes.useHTMLImages();
 assert.equal(sandbox.createImageBitmap,undefined);
 vm.runInContext(source,sandbox);const snapshot=plain(sandbox.IOSProbe.sceneSnapshot());
 assert.equal(snapshot.decoderMode,'html-images');assert.equal(snapshot.imageBitmapAvailable,false);
});
