async page=>{
 const errors=[],runs=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('http://127.0.0.1:5181/?motion-debug=1');
 await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&(document.querySelector('#canvas-host')?.dataset.multiplayer==='joined')&&d.storePeopleTotal===d.storePeopleReady;},null,{timeout:90000});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Profiler.enable');
 const measure=async label=>{
  await page.waitForTimeout(1200);await cdp.send('Profiler.start');
  const result=await page.evaluate(()=>new Promise(resolve=>{
   const times=[];let previous=null;
   const sample=now=>{if(previous!==null)times.push(now-previous);previous=now;if(times.length<120){requestAnimationFrame(sample);return;}
    const d=document.querySelector('#canvas-host').dataset;times.sort((a,b)=>a-b);
    resolve({medianMs:times[60],p95Ms:times[114],maxMs:times.at(-1),render:JSON.parse(d.renderStats),pipeline:JSON.parse(d.pipeline)});
   };requestAnimationFrame(sample);
  }));
  const {profile}=await cdp.send('Profiler.stop'),nodes=new Map(profile.nodes.map(n=>[n.id,n])),cost=new Map();
  profile.samples?.forEach((id,i)=>{const n=nodes.get(id),key=`${n.callFrame.functionName||'(anonymous)'} ${n.callFrame.url}:${n.callFrame.lineNumber+1}`;cost.set(key,(cost.get(key)||0)+(profile.timeDeltas[i]||0));});
  runs.push({label,...result,topSelfMs:[...cost].sort((a,b)=>b[1]-a[1]).slice(0,20).map(([fn,us])=>({fn,ms:us/1000}))});
 };
 if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
 await measure('street');
 await page.keyboard.down('w');try{await measure('walking');}finally{await page.keyboard.up('w');}
 await page.locator('#panel-toggle').click();await page.locator('[data-section=community-section]').click();
 if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
 const id=await page.evaluate(()=>window.__riverPeople().find(p=>p.task?.kind==='tray')?.id);
 if(!id)throw new Error('No serving worker');await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();
 await page.locator('#community-dialogue').waitFor({state:'visible'});await measure('worker-conversation');
 await page.screenshot({path:'output/playwright/district-frame-worker.png'});await cdp.detach();return {runs,errors,viewport:[1440,1000],scope:'Local Chromium RAF timing with CPU profiler enabled; not a target hardware benchmark.'};
}
