// A pilot who drops mid-flight (#777): leave the page while the Ribbonwing is aloft, stay away
// long enough for the town to land it (world.away, at most 2 m/s), then come back. The town
// has brought the craft down and kept Jevica in it; the returning page resumes the landed
// craft with her at the controls, and she steps out on the ground as usual.
async page => {
  const checks=[],errors=[],origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  const ready=()=>page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&document.querySelector('#canvas-host')?.dataset.carriageReady==='true',{},{timeout:240000});
  const self=()=>page.evaluate(()=>{const m=window.__riverMultiplayer(),me=m.snapshot.players.find(p=>p.id===m.selfId);return {vehicle:me?.vehicle??null,altitude:me?.altitude??null};});
  await page.setViewportSize({width:1280,height:900});
  await page.goto(`${origin}/?motion-debug=1`);await ready();
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.locator('#play-tab-rides').click();await page.locator('#player-vehicle').selectOption('hover');
  await page.keyboard.press('KeyQ');
  await page.waitForFunction(()=>window.__riverCarriage().mechanisms?.canopy===1,{},{timeout:30000});
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true');
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(p=>p.id===m.selfId)?.vehicle==='hover';},{},{timeout:20000});
  await page.keyboard.down('Space');
  try{await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return (m.snapshot.players.find(p=>p.id===m.selfId)?.altitude??0)>8;},{},{timeout:30000});}
  finally{await page.keyboard.up('Space');}
  await page.waitForTimeout(1500);
  const aloft=await self();
  check(aloft.vehicle==='hover'&&aloft.altitude>8,`Jevica flies the Ribbonwing up to ${aloft.altitude.toFixed(1)} m`);
  // Leave: the socket closes and the town's 30 s reconnect grace begins. Stay away just long
  // enough for the descent, so the page is back well inside the grace even on a slow load.
  const leftAt=Date.now();
  await page.goto('about:blank');
  await new Promise(resolve=>setTimeout(resolve,aloft.altitude/2*1000+1500));
  await page.goto(`${origin}/?motion-debug=1`);await ready();
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true'&&window.__riverCarriage().vehicle==='hover',{},{timeout:30000});
  const back=await self(),local=await page.evaluate(()=>window.__riverCarriage().placement.altitude);
  check(back.vehicle==='hover'&&back.altitude===0,`Away ${((Date.now()-leftAt)/1000).toFixed(0)} s, the town landed the Ribbonwing and kept her in it (town ${back.altitude} m)`);
  check(local<=.02,`The returning page resumes the landed craft with her at the controls (page ${local.toFixed(2)} m)`);
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding!=='true',{},{timeout:20000});
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return !m.snapshot.players.find(p=>p.id===m.selfId)?.vehicle;},{},{timeout:20000});
  await page.waitForTimeout(1500);
  const out=await page.evaluate(()=>({riding:document.querySelector('#canvas-host').dataset.riding,vehicle:(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(p=>p.id===m.selfId)?.vehicle??null;})()}));
  check(out.riding!=='true'&&out.vehicle===null,`She steps out on the ground, and stays out (${JSON.stringify(out)})`);
  check(errors.length===0,`No page errors${errors.length?`: ${errors.slice(0,3).join(' | ')}`:''}`);
  return {checks,aloft,back};
}
