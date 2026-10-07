async page=>{
 const checks=[],runs=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 const meet=async id=>{
  if(await page.locator('#community-dialogue').isVisible()){await page.locator('#community-close').click();await page.locator('#community-dialogue').waitFor({state:'hidden'});}
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
  await page.locator('#community-local').selectOption(id);await page.waitForTimeout(1100);await page.locator('#community-meet').click();await page.locator('#community-dialogue').waitFor({state:'visible'});
 };
 const sample=async()=>page.evaluate(async()=>{
  const states=[],start=performance.now();let previous=null,maxSpeed=0,maxFootError=0,slip=0,steps=0;
  while(performance.now()-start<5500){
   const now=await new Promise(r=>requestAnimationFrame(r)),p=window.__riverPlayerAttention();states.push(p);
   if(previous){maxSpeed=Math.max(maxSpeed,Math.abs(Math.atan2(Math.sin(p.bodyYaw-previous.p.bodyYaw),Math.cos(p.bodyYaw-previous.p.bodyYaw)))/(now-previous.now)*1000);
    p.feet.forEach((leg,i)=>{if(leg.contact&&previous.p.feet[i]?.contact&&leg.target&&previous.p.feet[i].target)slip=Math.max(slip,Math.hypot(...leg.target.map((v,j)=>v-previous.p.feet[i].target[j])));});}
   for(const leg of p.feet){maxFootError=Math.max(maxFootError,leg.error??0);if(!leg.contact)steps++;}previous={p,now};
  }
  const last=states.at(-1),eyeErrors=last.eyes.map(e=>{const d=last.target.map((v,i)=>v-e.position[i]),length=Math.hypot(...d);return Math.acos(Math.max(-1,Math.min(1,d.reduce((s,v,i)=>s+v*e.forward[i],0)/length)));});
  return {last,eyeErrors,maxSpeed,maxFootError,slip,steps,frames:states.length};
 });
 try{
  await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&document.querySelector('#canvas-host').dataset.multiplayer==='joined'&&d.storePeopleReady===d.storePeopleTotal;},null,{timeout:90000});
  const worker=await page.evaluate(()=>window.__riverPeople().find(p=>p.task && p.id!=='store-osm-node-8172494969-person-2').id);
  for(const id of ['store-osm-node-8172494969-person-2',worker]){
   await meet(id);const r=await sample();runs.push({id,...r});
   check(r.last.mode==='conversation'&&r.eyeErrors.every(e=>e<.035),`${id}: Jevica turns and looks toward her conversation partner`);
   check(r.maxSpeed<1.7&&r.maxFootError<.005&&r.slip<.001,`${id}: turn speed, planted support and foot reach stay bounded`);
   if(id==='store-osm-node-8172494969-person-2'){
    const before=await page.evaluate(()=>window.__riverPlayerAttention().position);
    await page.locator('#canvas-host').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(300);await page.keyboard.up('KeyW');
    check(await page.evaluate(()=>window.__riverCarriage().pose.speed===0&&window.__riverPlayerAttention().mode==='conversation'),'Dialogue retains its existing movement pause');
    await page.locator('#community-close').click();await page.locator('#community-dialogue').waitFor({state:'hidden'});
    await page.locator('#canvas-host').focus();await page.keyboard.down('KeyS');
    let moving;
    try{await page.waitForFunction(()=>window.__riverCarriage().pose.speed>.1);await page.waitForTimeout(250);moving=await page.evaluate(()=>window.__riverPlayerAttention());}
    finally{await page.keyboard.up('KeyS');}
    check(moving.mode==='none'&&moving.facing===null&&Math.hypot(...moving.position.map((v,i)=>v-before[i]))>.1,'Walking after conversation retains manual body facing');
    await page.waitForFunction(()=>window.__riverCarriage().pose.speed<=.05);
   }

  }
  await page.screenshot({path:'output/playwright/player-attention-worker.png'});
  await page.locator('#community-close').click();await page.locator('#community-dialogue').waitFor({state:'hidden'});await page.waitForTimeout(1200);
  const released=await page.evaluate(()=>window.__riverPlayerAttention());check(released.mode==='none'&&released.target===null&&released.eyes.every(e=>Math.abs(e.yaw)+Math.abs(e.pitch)<.001),'Closing the conversation releases Jevica eye contact');
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&d.multiplayer==='joined'&&d.storePeopleTotal&&d.storePeopleReady===d.storePeopleTotal;},null,{timeout:90000});await meet('store-osm-node-8172494969-person-2');const reduced=await sample();
  check(reduced.last.mode==='conversation'&&reduced.eyeErrors.every(e=>e<.035),'Reduced motion retains reciprocal conversation attention');
  check(!errors.length,'No uncaught player attention errors');return {checks,runs,released,reduced,errors};
 }catch(error){throw new Error(`${error.message}\n${JSON.stringify(runs)}`);}
 finally{await page.goto('about:blank');}
}
