// The landowner's Ribbonwing (#777, the `hover` kind) in the shared town, as the owner the
// experience runner signs in: pick it in the garage, call it, walk up as the canopy opens and the
// steps fold down, board, pilot, climb until the feet retract, be carried aloft by the town, land
// and step out. Every town-side check reads the authoritative snapshot, not the local placement.
async page => {
  const checks=[],errors=[],origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  // Refusals the town sends back (with or without a correction), for diagnosing an unseated pilot.
  const refusals=[];
  page.on('websocket',socket=>socket.on('framereceived',frame=>{try{const data=JSON.parse(frame.payload);if(data.type==='result'&&!data.ok)refusals.push({error:data.error,message:data.message,correction:Boolean(data.correction),at:Date.now()});}catch{ /* binary or non-JSON frame */ }}));
  const self=()=>page.evaluate(()=>{const m=window.__riverMultiplayer();const me=m.snapshot.players.find(p=>p.id===m.selfId);return {vehicle:me.vehicle??null,altitude:me.altitude,position:me.position};});
  const host=()=>page.locator('#canvas-host');
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&document.querySelector('#canvas-host')?.dataset.carriageReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.locator('#play-tab-rides').click();
  const options=await page.locator('#player-vehicle option').evaluateAll(items=>items.map(item=>item.value));
  check(options.includes('hover')&&(await page.locator('.vehicle-garage').evaluate(garage=>garage.hidden))===false,'The owner garage offers the landowner Ribbonwing');
  await page.locator('#player-vehicle').selectOption('hover');
  await page.waitForFunction(()=>window.__riverCarriage().vehicle==='hover');
  await host().focus();await page.keyboard.press('KeyQ');
  await page.waitForFunction(()=>document.querySelector('#player-status').textContent.includes('waiting nearby'));
  const parked=await page.evaluate(()=>window.__riverCarriage());
  check(parked.visible&&!parked.riding&&parked.placement.vehicle==='hover'&&parked.placement.scale===1,'Calling parks a visible Ribbonwing at its true size near Jevica');
  check(parked.tyreClearances.length===3&&parked.tyreClearances.every(gap=>Math.abs(gap)<.001),'All three landing feet meet the rendered paving');
  check((parked.placement.altitude??0)===0,'The parked Ribbonwing sits on the ground');
  // Jevica stands within reach, so the canopy opens and then the steps fold down.
  await page.waitForFunction(()=>{const m=window.__riverCarriage().mechanisms;return m&&m.canopy===1&&m.steps===1;},{},{timeout:20000});
  const opened=await page.evaluate(()=>window.__riverCarriage().mechanisms);
  check(opened.gear===0&&opened.fanRate===0,'Walking up opens the canopy and lowers the steps with the feet down and the fans still');
  await page.screenshot({path:'output/playwright/hover-coach-parked.png'});
  await host().focus();await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true');
  // The HUD title repaints every 150 ms; wait for it rather than read the frame boarding lands in.
  await page.waitForFunction(()=>document.querySelector('.walking-title strong')?.textContent!=='On foot',{},{timeout:5000}).catch(()=>{});
  const title=await page.locator('.walking-title strong').textContent();
  check(title==='Piloting the Ribbonwing',`Boarding puts Jevica at the controls${title==='Piloting the Ribbonwing'?'':` (title: ${title})`}`);
  check(!(await page.evaluate(()=>window.__riverCarriage().princeVisible)),'Jev does not take the controls of the Ribbonwing');
  await page.waitForFunction(()=>{const m=window.__riverCarriage().mechanisms;return m.canopy===0&&m.steps===0&&m.fanRate>0;},{},{timeout:20000});
  checks.push('Seated, the steps stow, the canopy closes and the fans idle up');
  check(await page.locator('#player-flight').isDisabled(),'Personal flight cannot start while seated');
  // Pilot: the town must accept hover poses and move the owner with the Ribbonwing.
  await host().focus();await page.keyboard.down('KeyW');
  try {await page.waitForFunction(()=>window.__riverCarriage().placement.distance>7,{},{timeout:20000});}
  finally {await page.keyboard.up('KeyW');}
  await page.waitForFunction(()=>Math.abs(window.__riverCarriage().placement.speed)<.03);
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(p=>p.id===m.selfId)?.vehicle==='hover';});
  const driven=await page.evaluate(()=>window.__riverCarriage()),townDriven=await self();
  check(Math.hypot(driven.placement.position[0]-parked.placement.position[0],driven.placement.position[2]-parked.placement.position[2])>6,'Driving moves the Ribbonwing and pilot through the district');
  check(townDriven.vehicle==='hover'&&Math.hypot(townDriven.position[0]-driven.placement.position[0],-townDriven.position[1]-driven.placement.position[2])<1.5,'The town carries the owner in the Ribbonwing where the Ribbonwing is');
  check(driven.tyreClearances.every(gap=>Math.abs(gap)<.001),'On the road the landing feet follow the rendered street');
  // Climb: Space lifts the Ribbonwing; the town carries its altitude; the hull stays level; above 3 m the feet retract.
  await host().focus();await page.keyboard.down('Space');
  try {
    await page.waitForFunction(()=>(window.__riverCarriage().placement.altitude??0)>3.3,{},{timeout:20000});
    await page.waitForFunction(()=>{const m=window.__riverMultiplayer();const me=m.snapshot.players.find(p=>p.id===m.selfId);return me?.vehicle==='hover'&&(me.altitude??0)>1;},{},{timeout:20000});
  } finally {await page.keyboard.up('Space');}
  const flying=await page.evaluate(()=>window.__riverCarriage()),townFlying=await self();
  check(flying.riding&&flying.placement.altitude>1.5&&flying.pose.altitude>1.5,'Space lifts the piloted Ribbonwing above the street');
  check(townFlying.vehicle==='hover'&&townFlying.altitude>1&&Math.abs(townFlying.altitude-flying.placement.altitude)<1.5,'The town accepts the airborne Ribbonwing and carries its altitude');
  check(Math.abs(flying.placement.roll)<.01&&Math.abs(flying.placement.pitch)<.01,'Airborne the hull flies level');
  check((await page.locator('.walking-title strong').textContent())==='Flying the Ribbonwing','The ride title says the Ribbonwing is flying');
  await page.waitForFunction(()=>window.__riverCarriage().mechanisms.gear===1,{},{timeout:20000});
  checks.push('Above 3 m the landing feet retract');
  await page.screenshot({path:'output/playwright/hover-coach-flying.png'});
  // Maneuvers (#777): the town admits a roll from 5 m, every snapshot carries the path, the craft
  // rolls about its flight path and finishes level 22 m on; a dive from too low is refused with a reason.
  await host().focus();await page.keyboard.down('Space');
  try {await page.waitForFunction(()=>(window.__riverCarriage().placement.altitude??0)>5.2,{},{timeout:20000});}
  finally {await page.keyboard.up('Space');}
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return (m.snapshot.players.find(p=>p.id===m.selfId)?.altitude??0)>5;},{},{timeout:20000});
  check(await page.locator('.ribbonwing-maneuvers').isVisible(),'Piloting the Ribbonwing aloft shows the four maneuvers');
  // On a timeout, say which step stalled and what the garage and carriage showed.
  const step=async(label,wait)=>{try{await wait();}catch(error){const state=await page.evaluate(()=>({status:document.querySelector('#player-status')?.textContent,notice:document.querySelector('.walking-notice,#walking-notice')?.textContent,c:JSON.stringify((({maneuver,maneuverTrace,placement})=>({maneuver:maneuver??'missing',maneuverTrace,altitude:placement?.altitude}))(window.__riverCarriage())),now:Date.now()}));throw new Error(`${label}: ${error.message.split('\n')[0]} ${JSON.stringify(state)}`);}};
  await host().focus();await page.keyboard.press('Digit3');
  await step('dive refusal',()=>page.waitForFunction(()=>document.querySelector('#player-status')?.textContent.startsWith('Climb higher first'),{},{timeout:10000}));
  check((await page.locator('#player-status').textContent()).includes('Tuck dive'),'A tuck dive from 5 m is refused: it needs room to pull out');
  await host().focus();await page.keyboard.press('Digit1');
  await step('roll admitted',()=>page.waitForFunction(()=>window.__riverCarriage().maneuver?.kind==='roll',{},{timeout:10000}));
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(p=>p.id===m.selfId)?.maneuver?.kind==='roll';},{},{timeout:5000});
  const admitted=(await page.evaluate(()=>window.__riverCarriage())).maneuver;
  checks.push('The town admits the roll and publishes it in the snapshot');
  // Sample the craft's tilt through the roll: its local up against world up.
  let tilt=0,ribbons=0,ribbonSamples=0;
  for(let i=0;i<12;i++){
    const sample=await page.evaluate(()=>{const c=window.__riverCarriage();return {q:c.craftQuaternion,maneuver:c.maneuver,trails:window.__riverRibbonwingEffects().trails};});
    if(!sample.maneuver)break;
    const [x,y,z,w]=sample.q;tilt=Math.max(tilt,Math.acos(Math.max(-1,Math.min(1,1-2*(x*x+z*z)))));
    ribbons=Math.max(ribbons,sample.trails?.draws??0);ribbonSamples=Math.max(ribbonSamples,...(sample.trails?.samples??[0]));
    await page.waitForTimeout(180);
  }
  check(tilt>1.2,`The craft rolls through the maneuver (max tilt ${tilt.toFixed(2)} rad)`);
  check(ribbons===2&&ribbonSamples<=40,`Two wingtip ribbons stream during the roll, each within its 40-sample ring (${ribbons} drawn, longest ${ribbonSamples})`);
  await step('roll ended',()=>page.waitForFunction(()=>window.__riverCarriage().maneuver===null,{},{timeout:10000}));
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return !m.snapshot.players.find(p=>p.id===m.selfId)?.maneuver;},{},{timeout:10000});
  const exit=await page.evaluate(()=>window.__riverCarriage()),townExit=await self();
  const [qx,,qz]=exit.craftQuaternion;
  check(1-2*(qx*qx+qz*qz)>.999,'The roll finishes level');
  await step('ribbons fade',()=>page.waitForFunction(()=>window.__riverRibbonwingEffects().trails?.draws===0,{},{timeout:5000}));
  checks.push('The ribbons fade away after the roll');
  check(exit.riding&&await host().getAttribute('data-riding')==='true'&&townExit.vehicle==='hover',`Jevica is still at the controls after the roll${exit.riding&&townExit.vehicle==='hover'?'':` ${JSON.stringify({riding:exit.riding,attr:await host().getAttribute('data-riding'),town:townExit,trace:exit.maneuverTrace,refusals:refusals.slice(-6),status:await page.locator('#player-status').textContent(),notice:await page.locator('#town-notice, .town-notice').first().textContent().catch(()=>null)})}`}`);
  // The path ends 22 m along the admitted heading from its origin (server frame: [east, north]; three z = -north).
  const endEast=admitted.origin[0]+22*Math.cos(admitted.heading),endNorth=admitted.origin[1]+22*Math.sin(admitted.heading);
  // The path is the pilot's seat (what the town tracks), not the craft's origin.
  const miss=Math.hypot(exit.pose.position[0]-endEast,-exit.pose.position[2]-endNorth);
  check(miss<.5,`The roll ends 22 m along the admitted heading (off by ${miss.toFixed(2)} m)`);
  check(Math.hypot(townExit.position[0]-exit.pose.position[0],-townExit.position[1]-exit.pose.position[2])<.5&&Math.abs(townExit.altitude-exit.placement.altitude)<.5,'The town and the pilot agree where the roll ended');
  // G while aloft lands first; a second G steps out once it is down.
  await host().focus();await page.keyboard.press('KeyG');
  check(await host().getAttribute('data-riding')==='true','G while aloft does not drop the rider');
  check((await page.locator('#player-status').textContent()).includes('landing'),'The garage says the Ribbonwing is landing');
  await page.waitForFunction(()=>(window.__riverCarriage().placement.altitude??0)<=.02,{},{timeout:20000});
  await page.waitForFunction(()=>window.__riverCarriage().mechanisms.gear===0,{},{timeout:20000});
  checks.push('The feet are down again before touchdown is complete');
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return (m.snapshot.players.find(p=>p.id===m.selfId)?.altitude??0)<=.1;});
  await host().focus();await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='false');
  await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return !m.snapshot.players.find(p=>p.id===m.selfId)?.vehicle;});
  const after=await page.evaluate(()=>window.__riverCarriage()),townAfter=await self();
  const standing=after.pose.showBody&&Math.abs(after.rider[1]-after.pose.ground)<.001;
  check(standing,standing?'Dismounted Jevica stands on the rendered pavement in view':`Dismounted Jevica stands on the rendered pavement in view (rider ${after.rider.map(v=>v.toFixed(3))}, ground ${after.pose.ground?.toFixed(3)}, body ${after.pose.showBody}, camera ${after.camera.position.map(v=>v.toFixed(2))}, craft ${after.placement?.position.map(v=>v.toFixed(2))} yaw ${after.placement?.yaw.toFixed(3)})`);
  check(townAfter.vehicle===null&&townAfter.altitude===0,'The town shows the owner on foot and on the ground again');
  await page.screenshot({path:'output/playwright/hover-coach-after.png'});
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,parked:{position:parked.placement.position,tyreClearances:parked.tyreClearances},townDriven,townFlying,townAfter,errors};
}
