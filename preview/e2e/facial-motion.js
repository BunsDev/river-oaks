async page=>{
 const checks=[],runs=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(m.text()))errors.push(m.text());});
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 const load=async reduced=>{
  await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&d.charactersReady==='24'&&d.storePeopleReady===d.storePeopleTotal;},null,{timeout:90000});
 };
 const meet=async id=>{
  if(await page.locator('#community-dialogue').isVisible()){
   if(await page.evaluate(()=>window.__riverConversation().id))await page.locator('#community-close').click();
   await page.locator('#community-dialogue').waitFor({state:'hidden'});
  }
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
  await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();await page.locator('#community-dialogue').waitFor({state:'visible'});
 };
 const sample=async(id,duration=8000)=>page.evaluate(async({id,duration})=>{
  const start=performance.now(),frames=[],eyes=[];
  while(performance.now()-start<duration){await new Promise(r=>requestAnimationFrame(r));const state=window.__riverConversation(id);frames.push(state.face);eyes.push(state.eyes);}
  if(frames.some(p=>!p))throw new Error(`No face binding: ${id}`);
  return {eyeBounded:eyes.every(p=>p?.length===2&&p.every(e=>Number.isFinite(e.yaw)&&Number.isFinite(e.pitch)&&Math.abs(e.yaw)<=.300001&&Math.abs(e.pitch)<=.180001)),eyeMoved:eyes.some(p=>p?.some(e=>Math.abs(e.yaw)+Math.abs(e.pitch)>.001)),frames:frames.length,maximum:Math.max(...frames.map(p=>Math.min(p.left,p.right))),minimum:Math.min(...frames.map(p=>Math.max(p.left,p.right))),quietFraction:frames.filter(p=>p.left===0&&p.right===0).length/frames.length};
 },{id,duration});
 try{
  await load(false);await meet('local-00');
  const outdoor=await sample('local-00');check(outdoor.maximum>.95&&outdoor.minimum===0&&outdoor.quietFraction>.8,'Outdoor residents blink and reopen while conversing');check(outdoor.eyeBounded&&outdoor.eyeMoved,'Outdoor conversation drives bounded eye contact');runs.push({id:'local-00',...outdoor});
  const worker=await page.evaluate(()=>window.__riverPeople().find(p=>p.task?.kind==='tray').id);await meet(worker);
  const indoor=await sample(worker);check(indoor.maximum>.95&&indoor.minimum===0&&indoor.quietFraction>.8,'Indoor workers blink and reopen while conversing');check(indoor.eyeBounded&&indoor.eyeMoved,'Worker conversation drives bounded eye contact');runs.push({id:worker,...indoor});
  await page.locator('#community-close').click();await page.locator('#community-dialogue').waitFor({state:'hidden'});await page.locator('#panel-toggle').click();
  if(!await page.locator('.force-controls').evaluate(e=>e.open))await page.locator('.force-controls > summary').click();
  await page.locator('#force-toggle').click();await page.waitForFunction(id=>[...document.querySelector('#force-target').options].some(o=>o.value===id),worker);
  await page.locator('#force-target').selectOption(worker);await page.locator('#force-lift').click();await page.waitForFunction(()=>window.__riverForce().active?.mode==='lift');
  const held=await sample(worker);check(held.maximum>.95&&held.minimum===0,'A telekinetically held worker keeps blinking while work is paused');check(held.eyeBounded&&held.eyeMoved,'Held worker retains bounded eye tracking');runs.push({id:worker,held:true,...held});
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyX');await page.waitForFunction(()=>!window.__riverForce().active,null,{timeout:12000});
  await load(true);await meet(worker);const reduced=await sample(worker,3000);check(reduced.maximum===0&&reduced.minimum===0,'Reduced motion keeps the eyes open without repeated blinking');
  check(reduced.eyeBounded&&reduced.eyeMoved,'Reduced motion retains purposeful eye contact');
  check(!errors.length,'No uncaught application or shader errors');return {checks,runs,reduced,errors};
 }catch(error){throw new Error(`${error.message}\nCompleted: ${JSON.stringify(checks)}\nRuns: ${JSON.stringify(runs)}`);}
 finally{await page.goto('about:blank');}
}
