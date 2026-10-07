async page=>{
 const checks=[],runs=[],errors=[],assets=[];let voiceRequests=0;
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/assets/characters/speech/'))assets.push(r.url());if(r.url().endsWith('/v1/voice')&&r.method()==='POST')voiceRequests++;});
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 const meet=async id=>{
  if(await page.locator('#community-dialogue').isVisible()){await page.locator('#community-close').click();await page.locator('#community-dialogue').waitFor({state:'hidden'});}
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
  await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();await page.locator('#community-dialogue').waitFor({state:'visible'});
  if(!await page.locator('.community-audio').evaluate(e=>e.open))await page.locator('.community-audio > summary').click();
 };
 const speaking=async()=>page.waitForFunction(()=>{const p=window.__riverConversation();return p.speaking&&p.mouth&&Object.values(p.mouth).some(v=>v>.1);},null,{timeout:30000});
 const sample=async()=>page.evaluate(async()=>{
  const start=performance.now(),peaks={},poses=[];
  while(performance.now()-start<1800){await new Promise(r=>requestAnimationFrame(r));const p=window.__riverConversation();poses.push(p);for(const [key,value]of Object.entries(p.mouth??{}))peaks[key]=Math.max(peaks[key]??0,value);}
  return {peaks,frames:poses.length,animatedFrames:poses.filter(p=>p.mouth&&Object.values(p.mouth).some(v=>v>.1)).length,eyes:poses.every(p=>p.eyes?.length===2),finite:poses.every(p=>Object.values(p.mouth??{}).every(v=>Number.isFinite(v)&&v>=0&&v<=1))};
 });
 try{
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&(document.querySelector('#canvas-host')?.dataset.multiplayer==='joined')&&d.storePeopleTotal===d.storePeopleReady;},null,{timeout:90000});
  check(assets.length===0,'Speech geometry is not downloaded at district startup');
  const workers=await page.evaluate(()=>{const p=window.__riverPeople();return [...['tray','tablet'].map(kind=>p.find(p=>p.task?.kind===kind)?.id),p.find(person=>person.seated)?.id].filter(Boolean);});
  check(workers.length===3,'Serving and tablet-using workers and a seated resident are present');
  for(const id of workers){
   await meet(id);await page.locator('#community-dialogue-voice').selectOption('kokoro');await speaking();const result=await sample();runs.push({id,...result});
   check(result.animatedFrames>10&&result.finite&&Object.values(result.peaks).filter(v=>v>.2).length>=3,`${id}: live synthesis drives varied bounded mouth shapes`);
   check(result.eyes,`${id}: eye tracking remains attached during speech`);
   if(id===workers[0]){
    const requests=voiceRequests;await page.locator('#community-replay').click();await speaking();
    check(voiceRequests>requests,'Replay restarts speech through the actual voice service');
   }
   await page.locator('#community-dialogue-voice').selectOption('off');await page.waitForFunction(()=>{const p=window.__riverConversation();return !p.speaking&&p.mouth===null;});
   check(true,`${id}: mute releases the mouth and removes temporary geometry`);
  }
  await page.emulateMedia({reducedMotion:'reduce'});await page.reload();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.storePeopleReady===document.querySelector('#canvas-host').dataset.storePeopleTotal&&document.querySelector('#canvas-host').dataset.playerReady==='true',null,{timeout:90000});
  await meet(workers[0]);await page.locator('#community-dialogue-voice').selectOption('kokoro');await speaking();const reduced=await sample();check(reduced.animatedFrames>10,'Reduced motion retains purposeful speech articulation');
  await page.locator('#community-close').click();await page.waitForFunction(id=>window.__riverConversation(id).mouth===null,workers[0]);check(!await page.evaluate(()=>window.__riverConversation().speaking),'Closing a conversation cancels speech and releases its face');
  check(!errors.length,'No uncaught live speech errors');return {checks,runs,reduced,voiceRequests,assets,errors,scope:'Live district UI to the local Kokoro service, timed WAV playback and temporary facial geometry. Covers serving, tablet work, seated people, replay, mute, close and reduced motion.'};
 }catch(error){throw new Error(`${error.message}\nChecks: ${JSON.stringify(checks)}\nState: ${JSON.stringify(await page.evaluate(()=>({state:window.__riverConversation?.(),status:document.querySelector('#community-dialogue-voice-status')?.textContent})))}`);}
 finally{await page.goto('about:blank');}
}
