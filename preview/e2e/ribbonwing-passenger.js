// The Ribbonwing's right-hand seat with three clients (#777): Jevica pilots, alice rides and bob
// watches. Jevica invites alice from the landed craft and alice boards. Both fly a roll while bob
// sees alice in the passenger seat of Jevica's craft throughout. Alice cannot step out aloft, steps
// out on the ground and walks on. She boards again, and Jevica's page then closes in the air: after
// the town's departure grace, alice is set down on clear ground. Town-side checks read snapshots.
async page => {
  const checks=[],errors=[],origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  const OWNER='user_01M40Y914S1H4EJCEHH91DKTAY';
  const watch=tab=>tab.on('pageerror',error=>errors.push(`${tab===page?'jevica':'peer'}: ${error.message}`));watch(page);
  const town=tab=>tab.evaluate(()=>{const m=window.__riverMultiplayer();return {selfId:m.selfId,players:m.snapshot.players.map(p=>({id:p.id,vehicle:p.vehicle??null,altitude:p.altitude,position:p.position,passengerOf:p.passengerOf??null,passengerId:p.passengerId??null,maneuver:p.maneuver?.kind??null}))};});
  const me=async tab=>{const t=await town(tab);return t.players.find(p=>p.id===t.selfId);};
  // Hold a walking key until the town sees the walker 0.5 m from `at`. A fixed hold is too short
  // on a software-rendered runner, where a frame can take seconds. On a timeout, say where she was.
  const walkAway=async(tab,key,at,label)=>{
    await host(tab).focus();await tab.keyboard.down(key);
    try {await tab.waitForFunction(at=>{const m=window.__riverMultiplayer(),p=m.snapshot.players.find(q=>q.id===m.selfId).position;return Math.hypot(p[0]-at[0],p[1]-at[1])>.5;},at,{timeout:30000});}
    catch(error){const now=await me(tab),local=await tab.evaluate(()=>window.__riverCarriage?.().pose?.position??null);throw new Error(`${label}: the town did not see alice move 0.5 m (from ${JSON.stringify(at)} to ${JSON.stringify(now.position)}, local ${JSON.stringify(local)}, refusals ${JSON.stringify(tab.refusals.slice(-4))})`);}
    finally {await tab.keyboard.up(key);}
  };
  const seatOf=tab=>tab.evaluate(()=>window.__riverRibbonwingSeat());
  // Jevica holds Space until her craft is above `above` metres. A frame lifts the craft by at most
  // 0.08 s of climb, and with three clients the CPU-rendered runner can draw one frame a second:
  // a hosted run was still climbing at 5.1 of 5.2 m when a fixed 20 s ran out (run 41060869403).
  // The climb fails when the craft stops rising: less than 5 cm gained in 20 s.
  const climb=async(above,label)=>{
    await host(page).focus();await page.keyboard.down('Space');
    try {
      let highest=-Infinity,risingAt=Date.now();
      for(;;){
        try {await page.waitForFunction(above=>(window.__riverCarriage().placement.altitude??0)>above,above,{polling:'raf',timeout:2000});return;}
        catch(error){if(!/Timeout/.test(error.message))throw error;}
        const altitude=await page.evaluate(()=>window.__riverCarriage().placement.altitude??0);
        if(altitude>highest+.05){highest=altitude;risingAt=Date.now();}
        if(Date.now()-risingAt>20000)throw new Error(`${label}: the craft stopped rising at ${altitude.toFixed(2)} m, short of ${above} m`);
      }
    } finally {await page.keyboard.up('Space');}
  };
  const host=tab=>tab.locator('#canvas-host');
  const gap=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
  const ready=async tab=>{
    await tab.goto(`${origin}/?motion-debug=1`);
    await tab.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true');
    if(await tab.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await tab.locator('#panel-toggle').click();
  };
  const peer=async id=>{const context=await page.context().browser().newContext({viewport:{width:1280,height:800}});await context.addCookies([{name:'fixture_session',value:id,url:origin}]);const tab=await context.newPage();tab.setDefaultTimeout(60000);watch(tab);
    // The town's refusals to this page, for diagnosing a walker who does not move.
    tab.refusals=[];tab.on('websocket',socket=>socket.on('framereceived',frame=>{try{const data=JSON.parse(frame.payload);if(data.type==='result'&&!data.ok)tab.refusals.push({error:data.error,correction:Boolean(data.correction)});}catch{}}));
    await ready(tab);return tab;};
  // Jevica calls and boards her Ribbonwing (as hover-coach does).
  await page.setViewportSize({width:1280,height:800});
  await ready(page);
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.carriageReady==='true');
  await page.locator('#play-tab-rides').click();
  await page.locator('#player-vehicle').selectOption('hover');
  await page.waitForFunction(()=>window.__riverCarriage().vehicle==='hover');
  await host(page).focus();await page.keyboard.press('KeyQ');
  await page.waitForFunction(()=>document.querySelector('#player-status').textContent.includes('waiting nearby'));
  await page.waitForFunction(()=>{const m=window.__riverCarriage().mechanisms;return m&&m.canopy===1&&m.steps===1;},{},{timeout:20000});
  await host(page).focus();await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(p=>p.id===m.selfId)?.vehicle==='hover';});
  check(true,'Jevica pilots her landed Ribbonwing');
  // alice arrives on foot beside it; Jevica's seat panel offers her the passenger seat.
  const alice=await peer('alice');
  const aliceId=(await me(alice)).id;
  await page.waitForFunction(()=>document.querySelector('.ribbonwing-seat:not([hidden]) [data-seat-action]:not([hidden])')?.textContent.includes('alice'),{},{timeout:20000});
  check(true,'Jevica\'s seat panel offers to invite alice, who stands beside the craft');
  await page.locator('.ribbonwing-seat [data-seat-action]').click();
  await alice.waitForFunction(()=>document.querySelector('.ribbonwing-seat:not([hidden]) [data-seat-status]')?.textContent.includes('invites you aboard'),{},{timeout:10000});
  check((await town(alice)).players.find(p=>p.id===OWNER)?.vehicle==='hover','alice is invited aboard Jevica\'s Ribbonwing and is offered Board');
  await alice.locator('.ribbonwing-seat [data-seat-action]').click();
  await alice.waitForFunction(()=>window.__riverRibbonwingSeat().riding,{},{timeout:10000});
  const aboard=await me(alice),pilot=(await town(alice)).players.find(p=>p.id===OWNER);
  check(aboard.passengerOf===OWNER&&pilot.passengerId===aliceId,'The town seats alice as Jevica\'s passenger');
  // The HUD title repaints every 150 ms; wait for it rather than read the frame boarding lands in.
  await alice.waitForFunction(()=>document.querySelector('.walking-title strong')?.textContent==='Riding in the Ribbonwing',{},{timeout:5000}).catch(()=>{});
  const aliceTitle=await alice.locator('.walking-title strong').textContent();
  check(aliceTitle==='Riding in the Ribbonwing',`alice's page says she is riding in the Ribbonwing${aliceTitle==='Riding in the Ribbonwing'?'':` (title: ${aliceTitle})`}`);
  check(Math.abs(Math.hypot(aboard.position[0]-pilot.position[0],aboard.position[1]-pilot.position[1])-.68)<.05,'The town places alice in the right-hand seat, 0.68 m from the pilot');
  // Jevica's page draws alice in her own craft's passenger seat.
  await page.waitForFunction(id=>{const s=window.__riverRibbonwingSeat(),h=s.holders[id],seat=Object.values(s.seats)[0];return h?.aboard&&seat&&Math.hypot(h.position[0]-seat[0],h.position[1]-seat[1],h.position[2]-seat[2])<.05;},aliceId,{timeout:10000});
  check(true,'Jevica sees alice seated beside her');
  // bob watches from the street.
  const bob=await peer('bob');
  await bob.waitForFunction(id=>{const s=window.__riverRibbonwingSeat(),h=s.holders[id],seat=Object.values(s.seats).find(Boolean);return h?.aboard&&seat&&Math.hypot(h.position[0]-seat[0],h.position[1]-seat[1],h.position[2]-seat[2])<.05;},aliceId,{timeout:20000});
  check(true,'bob sees alice seated in Jevica\'s Ribbonwing');
  // Climb: alice cannot step out aloft.
  await climb(5.2,'Jevica climbs with alice aboard');
  await alice.waitForFunction(()=>{const m=window.__riverMultiplayer();return (m.snapshot.players.find(p=>p.id===m.selfId)?.altitude??0)>5;},{},{timeout:20000});
  check(await alice.locator('.ribbonwing-seat [data-seat-action]').isDisabled(),'Aloft, alice\'s Step out is disabled');
  await host(alice).focus();await alice.keyboard.press('KeyG');await alice.waitForTimeout(400);
  check((await me(alice)).passengerOf===OWNER,'G aloft does not drop alice from the craft');
  // A roll with a passenger: alice's view rolls with the craft and bob keeps her in the seat.
  // alice's page records her view's tilt on every frame it draws. Sampled from here, 14 reads
  // each saw only the latest of a slow page's frames and missed the middle of the 2.6 s roll: a
  // hosted run measured 1.06 rad (run 41069203704). Every frame of a page drawing one a second
  // falls within a fifth of the roll's middle, at 1.42 rad or more.
  await alice.evaluate(()=>{const roll=window.__rollView={tilt:0,frames:0,stopped:false};const tick=()=>{const q=window.__riverCarriage().pose.riding?.quaternion;
    if(q){const [x,,z]=q;roll.tilt=Math.max(roll.tilt,Math.acos(Math.max(-1,Math.min(1,1-2*(x*x+z*z)))));roll.frames++;}if(!roll.stopped)requestAnimationFrame(tick);};requestAnimationFrame(tick);});
  await host(page).focus();await page.keyboard.press('Digit1');
  await page.waitForFunction(()=>window.__riverCarriage().maneuver?.kind==='roll',{},{timeout:10000});
  let bobDrift=0,samples=0;
  for(let i=0;i<14;i++){
    const seen=await bob.evaluate(id=>{const s=window.__riverRibbonwingSeat(),h=s.holders[id],seat=Object.values(s.seats).find(Boolean);return h&&seat?{h:h.position,seat}:null;},aliceId);
    if(seen){bobDrift=Math.max(bobDrift,gap(seen.h,seen.seat));samples++;}
    await page.waitForTimeout(170);
  }
  check(samples>8&&bobDrift<.05,`bob draws alice in the passenger seat through the roll (max ${bobDrift.toFixed(3)} m off over ${samples} samples)`);
  await page.waitForFunction(()=>window.__riverCarriage().maneuver===null,{},{timeout:10000});
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return !m.snapshot.players.find(p=>p.id===m.selfId)?.maneuver;},{},{timeout:10000});
  // alice's page has drawn the whole roll once its own snapshot shows the craft out of it.
  await alice.waitForFunction(owner=>!window.__riverMultiplayer().snapshot.players.find(p=>p.id===owner)?.maneuver,OWNER,{timeout:10000});
  const aliceRoll=await alice.evaluate(()=>{window.__rollView.stopped=true;return window.__rollView;});
  check(aliceRoll.tilt>1.2,`alice's view rolls with the craft (max tilt ${aliceRoll.tilt.toFixed(2)} rad over ${aliceRoll.frames} frames)`);
  const [pilotAfter,aliceAfter]=await Promise.all([me(page),me(alice)]);
  check(aliceAfter.passengerOf===OWNER&&Math.abs(aliceAfter.altitude-pilotAfter.altitude)<.01,'After the roll alice is still aboard at the pilot\'s altitude');
  // Land; alice steps out beside the craft and walks on.
  await host(page).focus();await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return (m.snapshot.players.find(p=>p.id===m.selfId)?.altitude??1)<=.1;},{},{timeout:30000});
  await alice.waitForFunction(()=>!document.querySelector('.ribbonwing-seat [data-seat-action]')?.disabled,{},{timeout:10000});
  await host(alice).focus();await alice.keyboard.press('KeyG');
  await alice.waitForFunction(()=>!window.__riverRibbonwingSeat().riding&&!window.__riverRibbonwingSeat().pilotId,{},{timeout:10000});
  const stepped=await me(alice),landed=await me(page);
  check(stepped.passengerOf===null&&stepped.altitude===0&&landed.passengerId===null,'On the ground alice steps out and the seat is free');
  const beside=Math.hypot(stepped.position[0]-landed.position[0],stepped.position[1]-landed.position[1]);
  check(beside>2.5&&beside<6,`alice stands beside the craft (${beside.toFixed(2)} m from the pilot)`);
  await alice.waitForFunction(()=>!document.querySelector('.walking-title strong')?.textContent.includes('Ribbonwing'),{},{timeout:5000}).catch(()=>{});
  const footTitle=await alice.locator('.walking-title strong').textContent();
  check(!footTitle.includes('Ribbonwing'),`alice's page is on foot again${footTitle.includes('Ribbonwing')?` (title: ${footTitle})`:''}`);
  await walkAway(alice,'KeyS',stepped.position,'walking on after stepping out');
  check(true,'The town accepts alice walking on from where she stepped out');
  // Board again, climb, then Jevica's page goes away mid-flight: once the town's departure grace
  // runs out, alice is set down on clear ground and walks on.
  await page.waitForFunction(()=>document.querySelector('.ribbonwing-seat:not([hidden]) [data-seat-action]:not([hidden])')?.textContent.includes('alice'),{},{timeout:20000});
  await page.locator('.ribbonwing-seat [data-seat-action]').click();
  await alice.waitForFunction(()=>document.querySelector('.ribbonwing-seat:not([hidden]) [data-seat-status]')?.textContent.includes('invites you aboard'),{},{timeout:10000});
  await alice.locator('.ribbonwing-seat [data-seat-action]').click();
  await alice.waitForFunction(()=>window.__riverRibbonwingSeat().riding,{},{timeout:10000});
  await climb(4,'Jevica climbs again');
  await alice.waitForFunction(()=>{const m=window.__riverMultiplayer();return (m.snapshot.players.find(p=>p.id===m.selfId)?.altitude??0)>3.5;},{},{timeout:20000});
  check(true,'alice boards again and Jevica climbs');
  const closedAt=Date.now();await page.close();
  await alice.waitForFunction(()=>{const m=window.__riverMultiplayer(),p=m.snapshot.players.find(q=>q.id===m.selfId);return !p.passengerOf&&p.altitude===0;},{},{timeout:60000});
  const setDown=await me(alice);
  check(!(await town(alice)).players.some(p=>p.id===OWNER),`When Jevica's page closes aloft, the town sets alice down on the ground after the departure grace (${((Date.now()-closedAt)/1000).toFixed(0)} s)`);
  await alice.waitForFunction(()=>!window.__riverRibbonwingSeat().riding,{},{timeout:10000});
  await walkAway(alice,'KeyW',setDown.position,'walking on after being set down');
  check(true,'alice walks on from where the town set her down');
  await bob.waitForFunction(id=>{const h=window.__riverRibbonwingSeat().holders[id];return h&&!h.aboard;},aliceId,{timeout:10000});
  check(true,'bob sees alice on foot again');
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  await alice.context().close();await bob.context().close();
  return {checks,setDown:setDown.position};
}
