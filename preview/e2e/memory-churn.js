// Diagnostic workload: repeated in-page world rebuilds, preserving the renderer
// and module caches. A page navigation would conceal these lifetime problems.
async page => {
  const errors=[],samples=[],snapshots=[];
  const fs=await import('node:fs');
  const {createHash}=await import('node:crypto');
  const sourceHashes=Object.fromEntries(['preview/e2e/memory-churn.js','preview/src/main.js','preview/src/avatars.js','preview/src/store-people.js','preview/src/remote-players.js','server/town.js'].map(path=>[path,createHash('sha256').update(fs.readFileSync(path)).digest('hex')]));
  const snapshot=async name=>{
    fs.mkdirSync('.runtime/memory',{recursive:true});
    const path=`.runtime/memory/${name}.heapsnapshot`,fd=fs.openSync(path,'w');
    const write=({chunk})=>fs.writeSync(fd,chunk);
    cdp.on('HeapProfiler.addHeapSnapshotChunk',write);
    try{await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});snapshots.push(path);}
    finally{cdp.off('HeapProfiler.addHeapSnapshotChunk',write);fs.closeSync(fd);}
  };
  page.on('pageerror',error=>errors.push(error.message));
  const cdp=await page.context().newCDPSession(page);
  await cdp.send('Performance.enable');
  await page.goto('http://127.0.0.1:5173/');
  const settle=async()=>{
    await page.locator('#loading').waitFor({state:'hidden'});
    await page.waitForFunction(()=>{
      const host=document.querySelector('#canvas-host'),progress=JSON.parse(document.querySelector('#viewport').dataset.assetProgress||'{}');
      return progress.done && !progress.failed && host.dataset.playerReady==='true'
        && Number(host.dataset.storePeopleReady)>0 && host.dataset.storePeopleReady===host.dataset.storePeopleTotal;
    },null,{timeout:120000});
    // Observe a fresh renderer receipt after the asynchronous population settles.
    await page.evaluate(()=>new Promise((resolve,reject)=>{
      const observer=new MutationObserver(records=>{if(records.some(record=>record.attributeName==='data-render-stats')){clearTimeout(timer);observer.disconnect();resolve();}});
      const timer=setTimeout(()=>{observer.disconnect();reject(new Error('No fresh renderer receipt'));},10000);
      observer.observe(document.querySelector('#canvas-host'),{attributes:true,attributeFilter:['data-render-stats']});
    }));
    await cdp.send('HeapProfiler.collectGarbage');
    const metrics=await cdp.send('Performance.getMetrics');
    const values=Object.fromEntries(metrics.metrics.map(({name,value})=>[name,value]));
    const resources=await page.evaluate(()=>({
      ...JSON.parse(document.querySelector('#canvas-host').dataset.renderStats),
      people:Number(document.querySelector('#canvas-host').dataset.storePeopleReady),
    }));
    samples.push({cycle:samples.length,heapBytes:values.JSHeapUsedSize,nodes:values.Nodes,listeners:values.JSEventListeners,...resources});
  };
  try{
    await settle();
    for(let cycle=0;cycle<18;cycle++){
      await page.locator('#reload').evaluate(button=>button.click());
      await settle();
      if(cycle===1||cycle===17)await snapshot(cycle===1?'warm':'final');
    }
    if(errors.length)throw new Error(errors.join('; '));
    return {scope:'Local Chromium full-render in-page reload diagnostic; no global leak-free or device-performance claim.',sourceHashes,samples,snapshots,errors};
  }finally{await cdp.detach();}
}
