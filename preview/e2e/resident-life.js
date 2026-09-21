async page => {
  const check=(condition,message)=>{if(!condition) throw new Error(message);};
  const errors=[],packets=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{
    if(request.url().endsWith('/v1/decisions')) {const packet=request.postDataJSON();if(packet.agents.length>1 && packet.agents.every(a=>a.kind==='resident')) packets.push(packet);}
  });
  const read=()=>page.locator('#community-life-status').evaluate(el=>JSON.parse(el.dataset.residents).filter(local=>local.id.startsWith('local-')));
  await page.setViewportSize({width:1920,height:1080});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.charactersReady==='24');
  const toggle=page.locator('#panel-toggle');if(await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
  await page.locator('#community-more summary').click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#community-life-status').dataset.residents).filter(l=>l.distance>1).length>=20,null,{timeout:20000});
  const moving=await read();
  const footSamples=await page.evaluate(()=>new Promise(resolve=>{
    const records=[];const sample=()=>{records.push(...window.__riverMotion());if(records.length>600) resolve(records);else requestAnimationFrame(sample);};requestAnimationFrame(sample);
  }));
  const maxFootError=Math.max(...footSamples.flatMap(person=>person.feet.map(foot=>Math.hypot(...foot.actual.map((value,index)=>value-foot.target[index])))));
  check(maxFootError<0.005,`District feet must reach their targets: ${maxFootError} m`);
  check(page.workers().some(worker=>worker.url().includes('navigation-worker')),'Route searches must run in a Web Worker');
  check(moving.every(l=>l.speed<=1.4),'Residents must stay within walking speed');
  check(packets.length>0 && packets.every(p=>p.agents.length<=24 && p.agents.every(a=>a.role_context && a.nearby.length<=16)),'Expected batched local resident context');

  await page.locator('#community-life').click();await page.waitForTimeout(250);
  const paused=await read();await page.waitForTimeout(1200);
  check(JSON.stringify(await read())===JSON.stringify(paused),'Paused walks must freeze positions and stride distance');
  const pausedRequests=packets.length;await page.waitForTimeout(2200);
  check(packets.length===pausedRequests,'Paused walks must not generate resident inference requests');
  await page.locator('#community-life').click();
  await page.locator('#community-local').selectOption('local-22');await page.locator('#community-meet').click();
  await page.waitForTimeout(250);const greeting=(await read()).find(l=>l.id==='local-22');
  await page.waitForTimeout(1600);const held=(await read()).find(l=>l.id==='local-22');
  check(held.status==='chatting' && JSON.stringify(held.position)===JSON.stringify(greeting.position),'Conversation partner must stop and remain in place');
  check((await page.locator('.community-kicker').textContent()).includes('no endorsement'),'Houston portrayal must retain its label');
  await page.screenshot({path:'output/playwright/resident-life-conversation.png'});
  await page.locator('#community-close').click();
  await page.keyboard.press('KeyE');
  check(await page.locator('#community-dialogue').isVisible(),'Nearby conversation must still open using E');
  await page.locator('#community-close').click();

  await page.locator('#weather').selectOption('overcast');
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#community-life-status').dataset.residents).filter(l=>l.status==='sheltered').length>=2,null,{timeout:25000});
  const storm=await read();
  check(storm.every(l=>l.action==='seek_shelter' && l.source==='safety_override'),'Storm overrides must apply even before starting an economic scenario');
  await page.locator('#weather').selectOption('clear');await page.waitForTimeout(1800);
  check((await read()).some(l=>l.speed>0 && l.action!=='seek_shelter'),'Residents must resume after clearing the storm');

  await toggle.click();await page.setViewportSize({width:3840,height:2160});await page.waitForTimeout(600);
  const uhd=await page.locator('canvas').evaluate(el=>[el.width,el.height]);
  check(uhd[0]===3840 && uhd[1]===2160,'Resident walks must support the native UHD view');
  const timing=await page.evaluate(()=>new Promise(resolve=>{const samples=[];let previous=performance.now();const frame=now=>{samples.push(now-previous);previous=now;if(samples.length===120){samples.sort((a,b)=>a-b);resolve({medianMs:samples[60],p95Ms:samples[114],maxMs:samples[119]});}else requestAnimationFrame(frame);};requestAnimationFrame(frame);}));
  await page.screenshot({path:'output/playwright/resident-life-4k.png'});

  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();
  await page.locator('#loading').waitFor({state:'hidden'});await page.waitForTimeout(1200);
  check((await read()).every(l=>l.distance===0),'Reduced motion must start resident walks paused');
  if(await toggle.getAttribute('aria-expanded')==='false') await toggle.click();
  await page.locator('#community-more summary').click();
  await page.locator('#community-life').click();
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#community-life-status').dataset.residents).some(l=>l.distance>1),null,{timeout:15000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1920,height:1080});
  check(!errors.length,`Browser errors: ${errors.join('; ')}`);
  return {maxFootErrorMeters:maxFootError,residents:moving.length,traveling:moving.filter(l=>l.distance>1).length,routeWorker:true,batchedRequests:packets.length,conversationHold:true,nearbyConversation:true,stormSheltered:storm.filter(l=>l.status==='sheltered').length,pauseStopsRequests:true,reducedMotion:true,uhd,timing,timingScope:'Local Chrome animation frames; not a target-GPU or UE5 benchmark',browserErrors:errors};
}
