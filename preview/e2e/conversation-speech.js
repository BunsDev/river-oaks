async page=>{
 const checks=[],errors=[],runs=[];let voiceRequests=0;
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 page.on('pageerror',e=>errors.push(e.message));
 // A generated 30-second PCM fixture exercises HTMLAudio without requiring a
 // synthesis service, installed device voices, or an external fixture file.
 const wav=await page.evaluate(()=>{
  const size=8000*30,bytes=new Uint8Array(44+size),v=new DataView(bytes.buffer);bytes.fill(128,44);
  const word=(at,text)=>[...text].forEach((c,i)=>bytes[at+i]=c.charCodeAt(0));
  word(0,'RIFF');v.setUint32(4,36+size,true);word(8,'WAVE');word(12,'fmt ');
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,8000,true);v.setUint16(32,1,true);v.setUint16(34,8,true);word(36,'data');v.setUint32(40,size,true);
  let binary='';for(let i=0;i<bytes.length;i+=4096)binary+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(binary);
 });
 const cdp=await page.context().newCDPSession(page);
 cdp.on('Fetch.requestPaused',event=>{voiceRequests++;cdp.send('Fetch.fulfillRequest',{requestId:event.requestId,responseCode:200,responseHeaders:[{name:'Content-Type',value:'audio/wav'}],body:wav}).catch(e=>errors.push(e.message));});
 await cdp.send('Fetch.enable',{patterns:[{urlPattern:'*/v1/voice',requestStage:'Request'}]});
 const load=async reduced=>{
  await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&d.charactersReady==='24'&&d.storePeopleReady===d.storePeopleTotal;},null,{timeout:90000});
 };
 const meet=async id=>{
  if(await page.locator('#community-dialogue').isVisible()){
   if(await page.evaluate(()=>window.__riverConversation().id))await page.locator('#community-close').click();
   await page.locator('#community-dialogue').waitFor({state:'hidden'});
  }
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
  await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});
  if(!await page.locator('.community-audio').evaluate(e=>e.open))await page.locator('.community-audio > summary').click();
 };
 const sample=async duration=>page.evaluate(async duration=>{
  const start=performance.now(),samples=[];
  while(performance.now()-start<duration){await new Promise(r=>requestAnimationFrame(r));samples.push(window.__riverConversation());}
  return {peak:Math.max(...samples.map(s=>s.nod?.pitch??0)),minimum:Math.min(...samples.map(s=>s.nod?.pitch??0)),speaking:samples.every(s=>s.speaking),frames:samples.length};
 },duration);
 try{
  await load(false);
  const worker=await page.evaluate(()=>window.__riverPeople().find(p=>p.task?.kind==='tray').id);
  for(const id of ['local-00',worker]){
   await meet(id);
   await page.locator('#community-dialogue-voice').selectOption('kokoro');
   await page.waitForFunction(()=>window.__riverConversation().speaking);
   const speaking=await sample(6500);
   check(speaking.speaking&&speaking.peak>.025&&speaking.minimum<.002,`${id}: audio playback drives varied speech nods`);
   await page.locator('#community-dialogue-voice').selectOption('off');
   await page.waitForFunction(()=>!window.__riverConversation().speaking);await page.waitForTimeout(1500);
   const listening=await sample(4500);
   check(!listening.speaking&&listening.peak<.025,`${id}: mute returns to restrained listening motion`);
   if(id===worker)await page.screenshot({path:'output/playwright/conversation-speech-worker.png'});
   await page.locator('#community-close').click();check(!await page.evaluate(()=>window.__riverConversation().speaking),`${id}: closing clears active speech`);
   await page.locator('#community-dialogue').waitFor({state:'hidden'});
   runs.push({id,speaking,listening});
  }
  await load(true);await meet(worker);await page.locator('#community-dialogue-voice').selectOption('kokoro');
  await page.waitForFunction(()=>window.__riverConversation().speaking);
  const reduced=await sample(2500);check(reduced.speaking&&reduced.peak===0&&reduced.minimum===0,'Reduced motion keeps optional nods still during playback');
  await page.locator('#community-close').click();check(!await page.evaluate(()=>window.__riverConversation().speaking),'Close cancels active playback');
  check(voiceRequests>=3,'Actual UI requested each controlled audio response');check(!errors.length,'No uncaught speech interaction errors');
  return {checks,runs,reduced,voiceRequests,errors,scope:'District UI and real HTMLAudio playback using a deterministic silent WAV response. This verifies speaking-state wiring, not synthesis quality or lip synchronization.'};
 }catch(error){throw new Error(`${error.message}\nCompleted: ${JSON.stringify(checks)}\nState: ${JSON.stringify(await page.evaluate(()=>window.__riverConversation?.()))}`);}
 finally{await cdp.send('Fetch.disable');await cdp.detach();await page.goto('about:blank');}
}
