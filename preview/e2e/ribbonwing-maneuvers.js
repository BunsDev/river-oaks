// The Ribbonwing's other three maneuvers (#777) flown in the browser: tuck dive, loop and
// Petal Roll (hover-coach flies the roll). As the owner, call and board the Ribbonwing, climb
// past the tuck dive's 9.05 m entry, then fly each by its key. For each: the town admits and
// publishes it; the craft shows the maneuver's signature (the dive's wing tuck and level drop, the
// loop's inverted top, the Petal Roll's roll with half-tucked wings); it finishes level with
// Jevica still at the controls; and it ends where the shared path (ribbonwing-maneuvers.js)
// says, by the pilot's seat and the town alike. Then land and step out.
async page => {
  const checks=[],errors=[],refusals=[],origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  const {maneuverPose,RIBBONWING_MANEUVERS}=await import(`${process.cwd()}/preview/src/ribbonwing-maneuvers.js`);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('websocket',socket=>socket.on('framereceived',frame=>{try{const data=JSON.parse(frame.payload);if(data.type==='result'&&!data.ok)refusals.push({error:data.error,correction:Boolean(data.correction)});}catch{}}));
  const host=()=>page.locator('#canvas-host');
  const self=()=>page.evaluate(()=>{const m=window.__riverMultiplayer();const me=m.snapshot.players.find(p=>p.id===m.selfId);return {vehicle:me.vehicle??null,altitude:me.altitude,position:me.position,maneuver:me.maneuver??null};});
  const step=async(label,wait)=>{try{await wait();}catch(error){const state=await page.evaluate(()=>({status:document.querySelector('#player-status')?.textContent,maneuver:window.__riverCarriage().maneuver,altitude:window.__riverCarriage().placement?.altitude}));throw new Error(`${label}: ${error.message.split('\n')[0]} ${JSON.stringify({state,refusals:refusals.slice(-4)})}`);}};
  await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&document.querySelector('#canvas-host')?.dataset.carriageReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.locator('#play-tab-rides').click();
  await page.locator('#player-vehicle').selectOption('hover');
  await page.waitForFunction(()=>window.__riverCarriage().vehicle==='hover');
  await host().focus();await page.keyboard.press('KeyQ');
  await page.waitForFunction(()=>document.querySelector('#player-status').textContent.includes('waiting nearby'));
  await page.waitForFunction(()=>{const m=window.__riverCarriage().mechanisms;return m&&m.canopy===1&&m.steps===1;},{},{timeout:20000});
  await host().focus();await page.keyboard.press('KeyG');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true');
  await page.waitForFunction(()=>{const m=window.__riverCarriage().mechanisms;return m.canopy===0&&m.fanRate>0;},{},{timeout:20000});
  checks.push('Jevica boards the Ribbonwing');
  const climb=async to=>{
    await host().focus();await page.keyboard.down('Space');
    try {await step(`climb to ${to} m`,()=>page.waitForFunction(to=>(window.__riverCarriage().placement.altitude??0)>to,to,{timeout:30000}));}
    finally {await page.keyboard.up('Space');}
    await step(`town at ${to} m`,()=>page.waitForFunction(to=>{const m=window.__riverMultiplayer();return (m.snapshot.players.find(p=>p.id===m.selfId)?.altitude??0)>to-.3;},to,{timeout:20000}));
  };
  await climb(10.5);
  check((await self()).altitude>10,'The town carries the Ribbonwing above the tuck dive\'s 9.05 m entry');
  // Fly one maneuver; sample the craft until it ends.
  const fly=async(kind,key)=>{
    await host().focus();await page.keyboard.press(key);
    await step(`${kind} admitted`,()=>page.waitForFunction(kind=>window.__riverCarriage().maneuver?.kind===kind,kind,{timeout:10000}));
    await step(`${kind} published`,()=>page.waitForFunction(kind=>{const m=window.__riverMultiplayer();return m.snapshot.players.find(p=>p.id===m.selfId)?.maneuver?.kind===kind;},kind,{timeout:5000}));
    const admitted=(await page.evaluate(()=>window.__riverCarriage())).maneuver;
    const seen={minUp:1,maxTilt:0,maxNose:0,minNose:0,maxTuck:0,minAltitude:Infinity,samples:0};
    for(let i=0;i<60;i++){
      const s=await page.evaluate(()=>{const c=window.__riverCarriage();return {q:c.craftQuaternion,maneuver:c.maneuver,tuck:c.mechanisms?.tuck??0,altitude:c.placement?.altitude??0};});
      if(!s.maneuver)break;
      const [x,y,z,w]=s.q,up=1-2*(x*x+z*z),noseY=-(2*(x*y+w*z));// craft front is local -X
      Object.assign(seen,{minUp:Math.min(seen.minUp,up),maxTilt:Math.max(seen.maxTilt,Math.acos(Math.max(-1,Math.min(1,up)))),maxNose:Math.max(seen.maxNose,noseY),minNose:Math.min(seen.minNose,noseY),maxTuck:Math.max(seen.maxTuck,s.tuck),minAltitude:Math.min(seen.minAltitude,s.altitude),samples:seen.samples+1});
      await page.waitForTimeout(120);
    }
    await step(`${kind} ended`,()=>page.waitForFunction(()=>window.__riverCarriage().maneuver===null,{},{timeout:10000}));
    await page.waitForFunction(()=>{const m=window.__riverMultiplayer();return !m.snapshot.players.find(p=>p.id===m.selfId)?.maneuver;},{},{timeout:10000});
    const exit=await page.evaluate(()=>window.__riverCarriage()),town=await self();
    const end=maneuverPose(admitted,admitted.startedAt+RIBBONWING_MANEUVERS[kind].duration);
    const [qx,,qz]=exit.craftQuaternion;
    check(1-2*(qx*qx+qz*qz)>.999,`The ${kind} finishes level`);
    check(exit.riding&&town.vehicle==='hover',`Jevica is still at the controls after the ${kind}`);
    const miss=Math.hypot(exit.pose.position[0]-end.east,-exit.pose.position[2]-end.north),townMiss=Math.hypot(town.position[0]-end.east,town.position[1]-end.north);
    check(miss<.5&&townMiss<.5,`The ${kind} ends where the shared path ends (seat ${miss.toFixed(2)} m, town ${townMiss.toFixed(2)} m off)`);
    check(Math.abs(town.altitude-end.altitude)<.5,`The town ends the ${kind} at the path's altitude (${town.altitude.toFixed(2)} vs ${end.altitude.toFixed(2)} m)`);
    return {admitted,seen,end};
  };
  const dive=await fly('tuck_dive','Digit3');
  check(dive.seen.maxTuck>.6,`The tuck dive sweeps the wings back (tuck ${dive.seen.maxTuck.toFixed(2)})`);
  check(dive.admitted.altitude-dive.seen.minAltitude>4,`and drops ${(dive.admitted.altitude-dive.seen.minAltitude).toFixed(1)} m before pulling out`);
  const loop=await fly('loop','Digit2');
  check(loop.seen.minUp<-.8&&loop.seen.maxNose>.8,`The loop pitches up through vertical and over the top inverted (up ${loop.seen.minUp.toFixed(2)}, nose ${loop.seen.maxNose.toFixed(2)})`);
  const petal=await fly('petal_roll','Digit4');
  check(petal.seen.maxTilt>2.5&&petal.seen.maxTuck>.3,`The Petal Roll rolls over with the wings half-tucked (tilt ${petal.seen.maxTilt.toFixed(2)} rad, tuck ${petal.seen.maxTuck.toFixed(2)})`);
  await step('ribbons fade',()=>page.waitForFunction(()=>window.__riverRibbonwingEffects().trails?.draws===0,{},{timeout:5000}));
  // Land and step out.
  await host().focus();await page.keyboard.press('KeyG');
  await step('landed',()=>page.waitForFunction(()=>(window.__riverCarriage().placement.altitude??0)<=.02,{},{timeout:60000}));
  await host().focus();await page.keyboard.press('KeyG');
  await step('stepped out',()=>page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding!=='true',{},{timeout:20000}));
  checks.push('The Ribbonwing lands and Jevica steps out');
  const corrected=refusals.filter(item=>item.correction);
  check(corrected.length===0,`No pose was corrected through the flight${corrected.length?`: ${JSON.stringify(corrected)}`:''}`);
  check(errors.length===0,`No page errors${errors.length?`: ${errors.slice(0,3).join(' | ')}`:''}`);
  return {checks,maneuvers:{tuck_dive:dive.seen,loop:loop.seen,petal_roll:petal.seen},refusals};
}
