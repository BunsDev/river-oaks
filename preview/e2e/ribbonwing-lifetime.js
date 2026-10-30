// Diagnostic (#777), not in the hosted shards: the Ribbonwing's in-town cost and disposal.
// As the owner, call the Ribbonwing and a road vehicle in turn, CYCLES times, in place.
// Changing the ride disposes the old model, so after the cycles the renderer's live geometries
// and textures must return to the road-vehicle baseline and the collected heap must stay
// within a bound. Also records the frame totals (draw calls, triangles) and frame rate with
// each parked in view; those move with the view and host load, so they are reported, not
// asserted.
async page => {
  const CYCLES=5,HEAP_BOUND_MB=12,checks=[],errors=[],origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
  const host=()=>page.locator('#canvas-host');
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&document.querySelector('#canvas-host')?.dataset.carriageReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.locator('#play-tab-rides').click();
  // Renderer stats are published once a second; wait for two fresh ones so counts have settled.
  const stats=async()=>{
    const read=()=>host().evaluate(element=>JSON.parse(element.dataset.renderStats||'null'));
    const first=await read();
    await page.waitForFunction(frames=>{const s=JSON.parse(document.querySelector('#canvas-host').dataset.renderStats||'null');return s&&s.frames>frames+30;},first?.frames??0,{timeout:30000});
    await page.waitForTimeout(1100);return read();
  };
  // Opt-in heap snapshots (RIBBONWING_HEAP_SNAPSHOTS=<dir>) after the same collections, for
  // scripts/ribbonwing/heap-diff.mjs: baseline, after the first call and back, after all calls.
  const snapshotDir=process.env.RIBBONWING_HEAP_SNAPSHOTS,fs=await import('node:fs');
  const heapSnapshot=async name=>{
    if(!snapshotDir)return;fs.mkdirSync(snapshotDir,{recursive:true});
    const fd=fs.openSync(`${snapshotDir}/${name}.heapsnapshot`,'w'),write=({chunk})=>fs.writeSync(fd,chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk',write);
    try{await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});}finally{cdp.off('HeapProfiler.addHeapSnapshotChunk',write);fs.closeSync(fd);}
  };
  const heapMb=async()=>{await cdp.send('HeapProfiler.collectGarbage');await cdp.send('HeapProfiler.collectGarbage');const {metrics}=await cdp.send('Performance.getMetrics');return metrics.find(m=>m.name==='JSHeapUsedSize').value/2**20;};
  const fps=async()=>{const a=await stats(),t=Date.now();await page.waitForTimeout(3000);const b=await stats();return (b.frames-a.frames)/((Date.now()-t)/1000);};
  const options=await page.locator('#player-vehicle option').evaluateAll(items=>items.map(item=>item.value));
  const road=['motorcycle','rolls'].find(kind=>options.includes(kind));
  check(options.includes('hover')&&road,`The owner garage offers the Ribbonwing and a road ride (${road})`);
  const call=async kind=>{
    await page.locator('#player-vehicle').selectOption(kind);
    await page.waitForFunction(kind=>window.__riverCarriage().vehicle===kind,kind,{timeout:10000});
    await host().focus();await page.keyboard.press('KeyQ');
    await page.waitForFunction(()=>document.querySelector('#player-status').textContent.includes('waiting nearby'),{},{timeout:20000});
    if(kind==='hover')await page.waitForFunction(()=>{const m=window.__riverCarriage().mechanisms;return m&&m.canopy===1;},{},{timeout:20000});
  };
  await call(road);
  const baseline=await stats(),baselineHeap=await heapMb();await heapSnapshot('1-baseline');const roadFps=await fps();
  await call('hover');
  const withCraft=await stats(),craftFps=await fps();
  // Whole-frame calls and triangles also move with where the craft parks and what the camera
  // then sees, so only the craft-owned resources are checked; the frame totals are reported.
  check(withCraft.geometries>baseline.geometries&&withCraft.textures-baseline.textures<=1,`The parked Ribbonwing owns ${withCraft.geometries-baseline.geometries} geometries and ${withCraft.textures-baseline.textures} texture`);
  const peaks=[];
  let firstHeap=null;
  for(let cycle=0;cycle<CYCLES;cycle++){
    await call(road);
    if(cycle===0){firstHeap=await heapMb();await heapSnapshot('2-after-first');}
    await call('hover');peaks.push((await stats()).geometries);
  }
  await call(road);
  const after=await stats(),afterHeap=await heapMb();await heapSnapshot('3-after-all');
  check(after.geometries===baseline.geometries,`After ${CYCLES+1} Ribbonwing calls the renderer holds the baseline geometries (${after.geometries} vs ${baseline.geometries})`);
  check(after.textures===baseline.textures,`and the baseline textures (${after.textures} vs ${baseline.textures})`);
  check(Math.max(...peaks)-Math.min(...peaks)<=2,`Each call builds the same craft (geometries while parked: ${peaks.join(', ')})`);
  check(afterHeap-baselineHeap<HEAP_BOUND_MB,`The collected heap grows ${(afterHeap-baselineHeap).toFixed(1)} MB over the cycles (bound ${HEAP_BOUND_MB} MB)`);
  check(errors.length===0,`No page errors${errors.length?`: ${errors.slice(0,3).join(' | ')}`:''}`);
  const load=(await import('node:os')).loadavg();
  return {checks,measurements:{road,baseline,withCraft,after,peaks,heapMb:{baseline:+baselineHeap.toFixed(1),afterFirst:+firstHeap.toFixed(1),after:+afterHeap.toFixed(1)},fps:{road:+roadFps.toFixed(1),ribbonwing:+craftFps.toFixed(1)},hostLoad:load.map(v=>+v.toFixed(1)),frameTotalsAreViewDependent:true}};
}
