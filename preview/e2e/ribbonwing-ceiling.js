// Climb the Ribbonwing to the flight ceiling (#777): the craft stops under the town's published
// ceiling, so no pose is refused at the top and Jevica stays at the controls the whole way.
async page => {
  const refusals=[],errors=[],log=[],origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>socket.on('framereceived',frame=>{try{const data=JSON.parse(frame.payload);if(data.type==='result'&&!data.ok)refusals.push({error:data.error,at:Date.now()});}catch{}}));
  await page.setViewportSize({width:1280,height:900});
  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&document.querySelector('#canvas-host')?.dataset.carriageReady==='true',{},{timeout:240000});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.locator('#play-tab-rides').click();await page.locator('#player-vehicle').selectOption('hover');
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(()=>window.__riverCarriage().mechanisms?.canopy===1,{},{timeout:30000});
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true');
  // The town has her aboard before the climb starts (the loop below stops if it ever does not).
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(p=>p.id===m.selfId)?.vehicle==='hover';},{},{timeout:20000});
  await page.keyboard.down('Space');
  const start=Date.now();
  while(Date.now()-start<20000){
    const s=await page.evaluate(()=>{const c=window.__riverCarriage(),m=window.__riverMultiplayer(),me=m.snapshot.players.find(p=>p.id===m.selfId);return {t:Date.now(),riding:document.querySelector('#canvas-host').dataset.riding,page:+(c.placement?.altitude??-1).toFixed(2),town:+(me?.altitude??-1).toFixed(2),vehicle:me?.vehicle??null,trace:c.maneuverTrace?.map(x=>x.event).join(',')};});
    log.push(s);if(s.riding!=='true'||s.vehicle!=='hover')break;
    await page.waitForTimeout(400);
  }
  await page.keyboard.up('Space');
  await page.waitForTimeout(1500);
  log.push(await page.evaluate(()=>{const c=window.__riverCarriage(),m=window.__riverMultiplayer(),me=m.snapshot.players.find(p=>p.id===m.selfId);return {after:true,riding:document.querySelector('#canvas-host').dataset.riding,page:c.placement?.altitude,town:me?.altitude,vehicle:me?.vehicle??null,trace:c.maneuverTrace?.map(x=>x.event).join(',')};}));
  const top=log.at(-1),ceiling=await page.evaluate(()=>window.__riverMultiplayer().snapshot.flightCeiling),checks=[];
  const check=(value,message)=>{if(!value)throw new Error(`${message} ${JSON.stringify({refusals,top,errors:errors.slice(0,3)})}`);checks.push(message);};
  check(top.riding==='true'&&top.vehicle==='hover','Jevica is still flying the Ribbonwing after climbing to the top');
  check(top.town>ceiling-1&&top.town<=ceiling,`It stops just under the town's ${ceiling.toFixed(2)} m ceiling (at ${Number(top.town).toFixed(2)} m)`);
  check(refusals.length===0,`The town refuses no pose on the way up${refusals.length?`: ${JSON.stringify(refusals)}`:''}`);
  check(errors.length===0,'No page errors');
  return {checks,log:log.filter((x,i)=>i%3===0||x.riding!=='true'||x.vehicle!=='hover'||x.after),refusals,errors:errors.slice(0,5)};
}
