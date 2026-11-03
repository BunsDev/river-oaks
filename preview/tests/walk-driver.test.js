// The district journeys' walk driver (e2e/walk-driver.js) against the production walking
// controller under deterministic latency and frame rates. Pointer input is accepted and
// authority mirrors local state; no DOM/authority acceptance.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createWalkDriver} from '../e2e/walk-driver.js';
import {isGameplayKey} from '../src/keyboard-input.js';
import {bindPageLifecycle} from '../src/background-lifecycle.js';
import {stopHeldMovement} from '../src/held-movement.js';
import {loadDistrictData} from '../../server/district-data.js';
import {createWalkingEnvironment,createWalkingState,stepWalking} from '../../preview/src/walking.js';
// One driver per journey: both players' walks share its turn queue.
const driver=deps=>createWalkDriver({...deps,refusals:'__commonsRefusals'});
const world=await loadDistrictData({districtRevision:'east-garden-commons-market-1'}),env=createWalkingEnvironment(world),district=env;
const target=[world.eastGardenCommons.edge-1,-1336];
const inputSource=await readFile(new URL('../src/walking-ui.js',import.meta.url),'utf8');
const inputStart=inputSource.indexOf("  host.addEventListener('keydown', event => {");
const inputEnd=inputSource.indexOf("  host.addEventListener('blur', clear);",inputStart);
assert.ok(inputStart>=0&&inputEnd>inputStart);
const installInput=new Function('host','document','keys','isGameplayKey','transport','dialogueOpen','getVoice',`const active=true; ${inputSource.slice(inputStart,inputEnd)}`);
const savedWindow=globalThis.window;
const run=async(makeDriver,latencyMs,fps,releaseDuringFast=false,offset=null,inputLatencyMs=latencyMs,walkEnv=district)=>{
  const env=walkEnv;
  let clock=1000,frameClock=0,mouseX=0,mouseDown=false;
  const start=[target[0]+(offset??(releaseDuringFast?8:.8)),target[1]],yaw=Math.PI/2,keys=new Set(),physicalKeys=new Set();
  const host=new EventTarget(),doc=new EventTarget(),win=new EventTarget();
  installInput(host,doc,keys,isGameplayKey,{takeOver(){}},()=>false,()=>null);
  const keyEvent=(type,code,repeat=false)=>{const event=new Event(type,{cancelable:true});Object.defineProperties(event,{code:{value:code},repeat:{value:repeat}});return event;};
  let releaseInjections=0;
  assert.ok(env.isFree(start[0],-start[1]));
  const state=createWalkingState(env,start,yaw);
  const unbind=bindPageLifecycle({window:win,document:doc,release:()=>{keys.clear();stopHeldMovement(state);}});
  assert.ok(Math.hypot(state.position[0]-start[0],state.position[2]+start[1])<1e-9);
  const frame=()=>1000/(typeof fps==='function'?fps(clock-1000):fps);
  let frames=0;
  const advance=ms=>{clock+=ms;frameClock+=ms;for(let f=frame();frameClock>=f;f=frame()){stepWalking(state,env,{forward:keys.has('KeyW')?1:0,fast:keys.has('ShiftLeft')},Math.min(f/1000,.08));frameClock-=f;frames++;if(globalThis.window)globalThis.window.__walkDriverFrames=frames;}};
  const snapshot=()=>({id:'fixture',position:[state.position[0],-state.position[2],env.groundAt(state.position[0],state.position[2])],yaw:state.yaw});
  globalThis.window={__riverCarriage:()=>({pose:state}),__riverMultiplayer:()=>({selfId:'fixture',snapshot:{players:[snapshot()]}}),__walkDriverFrames:0};
  const tab={
    keyboard:{down:async code=>{const repeat=physicalKeys.has(code);physicalKeys.add(code);host.dispatchEvent(keyEvent('keydown',code,repeat));advance(inputLatencyMs);},up:async code=>{physicalKeys.delete(code);doc.dispatchEvent(keyEvent('keyup',code));advance(inputLatencyMs);}},
    mouse:{move:async x=>{if(mouseDown)state.yaw-=(x-mouseX)*.003;mouseX=x;advance(latencyMs);},down:async()=>{mouseDown=true;advance(latencyMs);},up:async()=>{mouseDown=false;advance(latencyMs);}},
    locator:()=>({focus:async()=>advance(latencyMs),boundingBox:async()=>{advance(latencyMs);return{x:0,y:0,width:1280,height:900};}}),
    evaluate:async(fn,arg)=>{const result=structuredClone(fn(arg));advance(latencyMs);return result;},
    waitForTimeout:async ms=>{advance(ms);if(releaseDuringFast&&!releaseInjections&&physicalKeys.has('KeyW')){win.dispatchEvent(new Event('blur'));releaseInjections++;}},
    waitForFunction:async(fn,arg,options)=>{const deadline=clock+(options?.timeout??10000);while(!fn(arg)){advance(frame());if(clock>deadline)throw new Error('predicate timeout');}advance(latencyMs);},
  };
  const routes=[];
  const {walk}=makeDriver({self:async()=>{const result=snapshot();advance(latencyMs);return result;},routes,now:()=>clock,log(){}});
  let status='passed',error=null;
  try{await walk(tab,[target],'controlled slow observation');}catch(e){status='failed';error=e.message;}
  unbind();
  return{status,error,latencyMs,fps,releaseInjections,simulatedMs:clock-1000,remaining:Math.hypot(state.position[0]-target[0],state.position[2]+target[1]),position:state.position,routes:routes.length};
};
for(const latencyMs of [100,150,200])test(`near waypoint reaches15cm with9fps and${latencyMs}ms observation latency`,async()=>{
  try{
    const result=await run(driver,latencyMs,9);
    assert.equal(result.status,'passed',result.error??'waypoint failed');
    assert.ok(result.remaining<=.15,`arrival beyond15cm: ${result.remaining}`);
    assert.equal(result.routes,1);
    assert.ok(result.simulatedMs<120000,'a near waypoint takes under two minutes');
  }finally{globalThis.window=savedWindow;}
});

// Hosted CPU-rendered runners can fall to one to three frames a second. A slow press shorter
// than a frame is released before any frame reads it and moves nothing: two hosted runs
// ended 0.21 m short of a waypoint after 12 and 94 such presses (bayou-heights-return,
// bayou-terraces, 2026-10-28/29). Key events reach the browser in milliseconds while page
// evaluations wait for the starved main thread, so input latency is modelled apart from
// observation latency. The driver holds the key until the walker has moved.
for(const [fps,latencyMs] of [[1,1000],[2,500],[3,333]])test(`near waypoint reaches15cm at ${fps}fps with ${latencyMs}ms observation and 5ms input latency`,async()=>{
  try{
    const result=await run(driver,latencyMs,fps,false,.21,5);
    assert.equal(result.status,'passed',result.error??'waypoint failed');
    assert.ok(result.remaining<=.15,`arrival beyond15cm: ${result.remaining}`);
    assert.equal(result.routes,1);
    assert.ok(result.simulatedMs<30000,`the last 0.21 m took ${result.simulatedMs} ms`);
  }finally{globalThis.window=savedWindow;}
});

// The page's frame rate changes during a walk: a hosted woodland-heights run measured a slow
// frame while a district streamed in, then walked at a normal rate. A press sized from that one
// frame carried the walker past the waypoint every time; it turned back 145 times and stalled
// 0.32 m short (2026-10-30, #768). Presses must follow the frames as they come.
test('a slow frame at the start of a walk does not make later presses overshoot',async()=>{
  try{
    const result=await run(driver,100,elapsed=>elapsed<1500?1:30,false,.8,5);
    assert.equal(result.status,'passed',result.error??'waypoint failed');
    assert.ok(result.remaining<=.15,`arrival beyond15cm: ${result.remaining}`);
    assert.ok(result.simulatedMs<30000,`the last 0.8 m took ${result.simulatedMs} ms`);
  }finally{globalThis.window=savedWindow;}
});

for(const latencyMs of [100,150,200])test(`fast route resumes with a fresh press after lifecycle release at ${latencyMs}ms latency`,async()=>{
  try{
    const result=await run(driver,latencyMs,9,true);
    assert.equal(result.releaseInjections,1);assert.equal(result.status,'passed',result.error??'waypoint failed');
    assert.ok(result.remaining<=.15);assert.equal(result.routes,1);assert.ok(result.simulatedMs<120000);
  }finally{globalThis.window=savedWindow;}
});

// A fast press near the waypoint can carry the walker through it at full speed; the
// driver must let it stop and measure again rather than accept the pass and coast on
// (a hosted run ended 0.9 m past its lantern, outside the town's 0.6 m arrival check).
for(const [fps,latencyMs,offset] of [[9,150,3.2],[20,100,3.8],[37,100,3.9]])test(`a fast approach settles at the waypoint (${fps}fps, ${latencyMs}ms, ${offset}m)`,async()=>{
  try{
    const result=await run(driver,latencyMs,fps,false,offset);
    assert.equal(result.status,'passed',result.error??'waypoint failed');
    assert.ok(result.remaining<=.15,`arrival beyond15cm: ${result.remaining}`);
    assert.equal(result.routes,1);assert.ok(result.simulatedMs<120000);
  }finally{globalThis.window=savedWindow;}
});

// Both players walk at once from one browser. In headed Chromium the first drag in a page after
// the other page's press rarely gets pointer capture (5 of 561 across three hosted runs). Model that:
// a press turns its page only when the previous press was in the same page.
const runPair=async(makeDriver,latencyMs,fps,act=(driver,tab,label)=>driver.walk(tab,[target],label))=>{
  let clock=1000,lastPress=null;const pages=[];
  const advance=ms=>{clock+=ms;for(const page of pages){page.frameClock+=ms;while(page.frameClock>=1000/fps){stepWalking(page.state,env,{forward:page.keys.has('KeyW')?1:0,fast:page.keys.has('ShiftLeft')},Math.min(1/fps,.08));page.frameClock-=1000/fps;page.window.__walkDriverFrames++;}}};
  const keyEvent=(type,code,repeat=false)=>{const event=new Event(type,{cancelable:true});Object.defineProperties(event,{code:{value:code},repeat:{value:repeat}});return event;};
  const open=(name,offset)=>{
    const page={name,frameClock:0,keys:new Set(),physicalKeys:new Set(),host:new EventTarget(),doc:new EventTarget(),mouseX:0,mouseDown:false,captured:false};
    installInput(page.host,page.doc,page.keys,isGameplayKey,{takeOver(){}},()=>false,()=>null);
    const start=[target[0]+offset,target[1]];assert.ok(env.isFree(start[0],-start[1]));
    page.state=createWalkingState(env,start,-Math.PI/2);
    page.snapshot=()=>({id:'fixture',position:[page.state.position[0],-page.state.position[2],env.groundAt(page.state.position[0],page.state.position[2])],yaw:page.state.yaw});
    const window=page.window={__riverCarriage:()=>({pose:page.state}),__riverMultiplayer:()=>({selfId:'fixture',snapshot:{players:[page.snapshot()]}}),__walkDriverFrames:0};
    const inPage=fn=>{globalThis.window=window;return fn();};
    page.tab={
      keyboard:{down:async code=>{const repeat=page.physicalKeys.has(code);page.physicalKeys.add(code);page.host.dispatchEvent(keyEvent('keydown',code,repeat));advance(latencyMs);},up:async code=>{page.physicalKeys.delete(code);page.doc.dispatchEvent(keyEvent('keyup',code));advance(latencyMs);}},
      mouse:{move:async x=>{if(page.mouseDown&&page.captured)page.state.yaw-=(x-page.mouseX)*.003;page.mouseX=x;advance(latencyMs);},down:async()=>{page.mouseDown=true;page.captured=lastPress===null||lastPress===name;lastPress=name;advance(latencyMs);},up:async()=>{page.mouseDown=false;advance(latencyMs);}},
      locator:()=>({focus:async()=>advance(latencyMs),boundingBox:async()=>{advance(latencyMs);return{x:0,y:0,width:1280,height:900};}}),
      evaluate:async(fn,arg)=>{const result=structuredClone(inPage(()=>fn(arg)));advance(latencyMs);return result;},
      waitForTimeout:async ms=>advance(ms),
      waitForFunction:async(fn,arg,options)=>{const deadline=clock+(options?.timeout??10000);while(!inPage(()=>fn(arg))){advance(1000/fps);if(clock>deadline)throw new Error('predicate timeout');}advance(latencyMs);},
    };
    pages.push(page);return page;
  };
  const owner=open('owner',3),peer=open('alice',5),routes=[];
  const self=async tab=>{const result=pages.find(page=>page.tab===tab).snapshot();advance(latencyMs);return result;};
  const shared=makeDriver({self,routes,now:()=>clock,log(){}});
  const results=await Promise.allSettled([act(shared,owner.tab,'owner'),act(shared,peer.tab,'alice')]);
  return{results:results.map(result=>result.status==='fulfilled'?'passed':result.reason.message.slice(0,160)),routes:routes.length,simulatedMs:clock-1000};
};
for(const latencyMs of [60,150])test(`two pages turning at once each get a working drag (${latencyMs}ms latency)`,async()=>{
  try{
    const result=await runPair(driver,latencyMs,9);
    assert.deepEqual(result.results,['passed','passed']);assert.equal(result.routes,2);
    // Both walks share the clock; keep well inside two minutes (about 55 s at 150 ms).
    assert.ok(result.simulatedMs<90000,`both walks took ${result.simulatedMs} ms`);
  }finally{globalThis.window=savedWindow;}
});

// bayou-heights turns both players to a heading in place at once.
test('two pages facing a heading at once each get a working drag',async()=>{
  try{
    const result=await runPair(driver,150,9,(shared,tab,label)=>shared.face(tab,Math.PI/2,label));
    assert.deepEqual(result.results,['passed','passed']);
  }finally{globalThis.window=savedWindow;}
});

// bayou-heights has one player face a heading while the other is still walking.
test('one page facing while the other walks each get a working drag',async()=>{
  try{
    const result=await runPair(driver,150,9,(shared,tab,label)=>label==='owner'?shared.face(tab,Math.PI/2,label):shared.walk(tab,[target],label));
    assert.deepEqual(result.results,['passed','passed']);
  }finally{globalThis.window=savedWindow;}
});

// On the CPU-rendered runner a page can draw two or three frames a second for minutes, and
// walking moves at most 0.08 s of stride per frame: a hosted bayou-heights-return run walked
// its last 65 m at about a sixth of walking speed and was still closing in, 0.16 m past the
// waypoint and turning back, when a fixed 120 s per waypoint ran out and called it stalled
// (run 41060785602). A walk is stalled when it stops getting closer, however slow it is.
test('a long leg at two frames a second arrives while it keeps getting closer',async()=>{
  try{
    const result=await run(driver,500,2,false,70,5);
    assert.equal(result.status,'passed',result.error??'waypoint failed');
    assert.ok(result.remaining<=.15,`arrival beyond15cm: ${result.remaining}`);
    assert.ok(result.simulatedMs>120000,`the leg took ${result.simulatedMs} ms; this case needs a walk longer than 120 s`);
  }finally{globalThis.window=savedWindow;}
});

test('a walker held short of the waypoint is stalled two minutes after it last got closer',async()=>{
  try{
    // A wall 0.4 m before the waypoint, across the walker's path.
    const env={...district,isFree:(x,z)=>x>target[0]+.4&&district.isFree(x,z)};
    const result=await run(driver,150,9,false,6,150,env);
    assert.equal(result.status,'failed');
    assert.match(result.error,/^controlled slow observation: stalled /);
    assert.ok(result.remaining>.35&&result.remaining<.5,`held ${result.remaining} m short`);
    assert.ok(result.simulatedMs>120000&&result.simulatedMs<150000,`stalled after ${result.simulatedMs} ms`);
  }finally{globalThis.window=savedWindow;}
});
