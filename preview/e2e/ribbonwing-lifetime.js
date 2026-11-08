// Diagnostic (#777), not in the hosted shards: the Ribbonwing's in-town cost and disposal.
// As the owner, call the Ribbonwing and a road vehicle in turn, CYCLES times, in place.
// Changing the ride must dispose every geometry/texture of the retired model and return to
// the road model's resource baseline; retired roots must be collected. Chromium also
// enforces the original numeric heap bound; WebKit has no supported total-heap metric. The town
// keeps loading and changing other figures, so whole-renderer totals are recorded separately.
// Also records the frame totals (draw calls, triangles) and frame rate with
// each parked in view; those move with the view and host load, so they are reported, not
// asserted.
async page => {
  const CYCLES=5,HEAP_BOUND_MB=12,checks=[],errors=[],origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  const resourceEvidence=[],observations={};let collectionEvidence=[];
  const check=(value,message)=>{if(!value){const error=new Error(message);error.journeyEvidence={checks,resourceEvidence,collectionEvidence,observations};throw error;}checks.push(message);};
  const {installRibbonwingResourceAudit}=await import('./ribbonwing-resource-audit.js');
  const {VEHICLES}=await import('../src/vehicle-config.js');
  await page.addInitScript(installRibbonwingResourceAudit);
  try {
  page.on('pageerror',error=>errors.push(error.message));
  const engine=page.context().browser().browserType().name();
  const cdp=engine==='chromium'?await page.context().newCDPSession(page):null;
  if(cdp)await cdp.send('Performance.enable');
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
  if(snapshotDir&&!cdp)throw new Error('Numeric heap snapshots require Chromium; WebKit collection is recorded through weak roots');
  const heapSnapshot=async name=>{
    if(!snapshotDir)return;fs.mkdirSync(snapshotDir,{recursive:true});
    const fd=fs.openSync(`${snapshotDir}/${name}.heapsnapshot`,'w'),write=({chunk})=>fs.writeSync(fd,chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk',write);
    try{await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});}finally{cdp.off('HeapProfiler.addHeapSnapshotChunk',write);fs.closeSync(fd);}
  };
  const heapMb=async()=>{await page.requestGC();await page.requestGC();if(!cdp)return null;const {metrics}=await cdp.send('Performance.getMetrics');return metrics.find(m=>m.name==='JSHeapUsedSize').value/2**20;};
  const fps=async()=>{const a=await stats(),t=Date.now();await page.waitForTimeout(3000);const b=await stats();return (b.frames-a.frames)/((Date.now()-t)/1000);};
  const options=await page.locator('#player-vehicle option').evaluateAll(items=>items.map(item=>item.value));
  const road=['motorcycle','rolls'].find(kind=>options.includes(kind));
  check(options.includes('hover')&&road,`The owner garage offers the Ribbonwing and a road ride (${road})`);
  const captures=[];
  const call=async kind=>{
    await page.locator('#player-vehicle').selectOption(kind);
    await page.waitForFunction(kind=>window.__riverCarriage().vehicle===kind,kind,{timeout:10000});
    await host().focus();await page.keyboard.press('KeyQ');
    await page.waitForFunction(()=>document.querySelector('#player-status').textContent.includes('waiting nearby'),{},{timeout:20000});
    if(kind==='hover')await page.waitForFunction(()=>{const m=window.__riverCarriage().mechanisms;return m&&m.canopy===1;},{},{timeout:20000});
    if(captures.length){
      const disposed=await page.evaluate(token=>window.__riverRibbonwingResources.read(token),captures.at(-1).token);
      resourceEvidence.push(disposed);
      check(disposed.complete,`Ride replacement ${captures.length} detaches its root and disposes every captured geometry/texture: ${JSON.stringify(disposed)}`);
    }
    captures.push(await page.evaluate(label=>window.__riverRibbonwingResources.capture(label),VEHICLES[kind].label));
  };
  await call(road);
  const baseline=await stats(),baselineHeap=await heapMb();await heapSnapshot('1-baseline');const roadFps=await fps();
  observations.baseline={renderer:baseline,heapMb:baselineHeap,owned:captures[0]};
  await call('hover');
  const withCraft=await stats(),craftFps=await fps();
  // Whole-frame calls and triangles also move with where the craft parks and what the camera
  // then sees, so only the craft-owned resources are checked; the frame totals are reported.
  const initialCraft=captures.at(-1);
  check(initialCraft.geometries>0&&initialCraft.textures<=1,`The parked Ribbonwing owns ${initialCraft.geometries} geometries and ${initialCraft.textures} texture`);
  const peaks=[];
  let firstHeap=null;
  for(let cycle=0;cycle<CYCLES;cycle++){
    await call(road);
    if(cycle===0){firstHeap=await heapMb();await heapSnapshot('2-after-first');}
    await call('hover');peaks.push((await stats()).geometries);
  }
  await call(road);
  const after=await stats();
  // Inspect weak roots only after collection, in a separate page task. Reading them
  // before requestGC would keep the dereferenced objects alive for that task.
  await page.requestGC();await page.requestGC();
  collectionEvidence=await page.evaluate(tokens=>tokens.map(token=>window.__riverRibbonwingResources.read(token)),captures.slice(0,-1).map(capture=>capture.token));
  check(collectionEvidence.every(record=>record.rootCollected),`All ${collectionEvidence.length} retired ride roots were collected after replacement`);
  // Drop the diagnostic bookkeeping before the same collected-heap comparison.
  await page.evaluate(()=>window.__riverRibbonwingResources.stop());
  const afterHeap=await heapMb();await heapSnapshot('3-after-all');
  const initialRoad=captures[0],finalRoad=captures.at(-1),ownedPeaks=captures.filter(capture=>capture.label===VEHICLES.hover.label).map(capture=>capture.geometries);
  observations.after={renderer:after,heapMb:afterHeap,owned:finalRoad,ownedPeaks,rendererPeaks:peaks};
  check(resourceEvidence.length===2*(CYCLES+1)&&resourceEvidence.every(record=>record.complete),`All ${2*(CYCLES+1)} retired ride models disposed their actual resources`);
  check(finalRoad.geometries===initialRoad.geometries,`After ${CYCLES+1} Ribbonwing calls the road holds its baseline owned geometries (${finalRoad.geometries} vs ${initialRoad.geometries})`);
  check(finalRoad.textures===initialRoad.textures,`and its baseline owned textures (${finalRoad.textures} vs ${initialRoad.textures})`);
  check(ownedPeaks.length===CYCLES+1&&Math.max(...ownedPeaks)-Math.min(...ownedPeaks)<=2,`Each call builds the same craft (owned geometries while parked: ${ownedPeaks.join(', ')})`);
  if(cdp)check(afterHeap-baselineHeap<HEAP_BOUND_MB,`The collected heap grows ${(afterHeap-baselineHeap).toFixed(1)} MB over the cycles (bound ${HEAP_BOUND_MB} MB)`);
  check(errors.length===0,`No page errors${errors.length?`: ${errors.slice(0,3).join(' | ')}`:''}`);
  const load=(await import('node:os')).loadavg();
  return {checks,resourceEvidence,collectionEvidence,measurements:{engine,road,baseline,withCraft,after,peaks,owned:{baseline:initialRoad,after:finalRoad,peaks:ownedPeaks},heapMb:cdp?{baseline:+baselineHeap.toFixed(1),afterFirst:+firstHeap.toFixed(1),after:+afterHeap.toFixed(1)}:null,heapMeasurement:{available:Boolean(cdp),boundMb:HEAP_BOUND_MB,limitation:cdp?null:'WebKit exposes no supported total JS heap metric; numeric growth is unverified on this engine'},fps:{road:+roadFps.toFixed(1),ribbonwing:+craftFps.toFixed(1)},hostLoad:load.map(v=>+v.toFixed(1)),frameTotalsAreViewDependent:true,wholeRendererResourcesIncludeChangingTown:true}};
  } finally {await page.evaluate(()=>window.__riverRibbonwingResources?.stop()).catch(()=>{});}
}
