async page => {
  // Sitting on benches and watering planters in the shared town: the server
  // decides, and another player sees it. Townspeople rest on benches too.
  const origin='http://127.0.0.1:5180',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const ready=tab=>tab.waitForFunction(()=>window.__riverMultiplayer?.().connected
    &&document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&window.__riverSeatAndWater?.()?.seats.length>0,null,{timeout:90000});
  const open=async(id,tab)=>{
    tab??=await (await page.context().browser().newContext({viewport:{width:1280,height:800}})).newPage();
    tab.on('pageerror',error=>errors.push(`${id}: ${error.message}`));
    await tab.context().addCookies([{name:'fixture_session',value:id,url:origin}]);
    await tab.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(tab);
    return tab;
  };
  const sites=tab=>tab.evaluate(()=>{const s=window.__riverSeatAndWater();return {seats:s.seats,planters:s.planters,taken:s.taken,seated:s.seated,interaction:s.interaction};});
  const goNear=async(tab,id)=>{const result=await tab.evaluate(id=>window.__riverSeatAndWater().goNear(id),id);check(result.ok,`Arrived beside ${id}`);return result.position;};
  const press=async(tab,key)=>{await tab.locator('#canvas-host').focus();await tab.keyboard.press(key);};
  const peer=(tab,id)=>tab.evaluate(id=>window.__riverMultiplayer().remotes.find(remote=>remote.id===id),id);
  const self=(tab,id)=>tab.evaluate(id=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===id),id);
  const angle=(a,b)=>Math.abs(Math.atan2(Math.sin(a-b),Math.cos(a-b)));

  await page.setViewportSize({width:1280,height:800});
  await open('alice',page);
  const bob=await open('bob');

  // A bench whose two places are free and reachable.
  const {seats,planters}=await sites(page);
  const bench=seats.find(seat=>seat.kind==='bench'&&seat.id.endsWith(':0'));
  check(Boolean(bench),'The town lists storefront benches as seats');
  await goNear(page,bench.id);
  await page.waitForFunction(()=>window.__riverSeatAndWater().interaction==='sit',null,{timeout:15000});
  // The seats panel lists the bench beside Jevica's furniture; Z is its shortcut.
  await page.waitForFunction(id=>[...document.querySelectorAll('#nearby-seat option')].some(option=>option.value===id&&option.textContent.startsWith('Storefront bench')),bench.id,{timeout:10000});
  check(true,'Beside a bench, the seats panel lists it and Z offers to sit');

  await press(page,'KeyZ');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerSeat,null,{timeout:15000});
  const seatId=await page.evaluate(()=>document.querySelector('#canvas-host').dataset.playerSeat);
  const seat=seats.find(item=>item.id===seatId);
  check(Boolean(seat)&&seat.id.startsWith(bench.id.slice(0,-1)),'Z sits on a place on that bench');
  await page.waitForFunction(()=>document.querySelector('#walking-hud .walking-title strong')?.textContent==='Seated',null,{timeout:5000});
  check(true,'The HUD says the player is sitting');
  const recorded=(await self(page,'alice')).sitting;
  check(recorded&&`${recorded.buildId}:${recorded.slot}`===seat.id,'The town records the seat, through the shared seating model');
  await goNear(bob,seat.id.replace(/:\d$/,seat.id.endsWith(':0')?':1':':0'));
  const aliceSeen=await bob.waitForFunction(()=>window.__riverMultiplayer().remotes.find(remote=>remote.id==='alice')?.riderSeated,null,{timeout:20000}).then(()=>true,()=>false);
  if(!aliceSeen)throw new Error('Bob never saw Alice seated: '+JSON.stringify({
    alice:await page.evaluate(()=>({seat:document.querySelector('#canvas-host').dataset.playerSeat,hud:document.querySelector('#walking-hud .walking-title strong')?.textContent,self:window.__riverMultiplayer().snapshot.players.find(p=>p.id==='alice')})),
    bob:await bob.evaluate(()=>({remote:window.__riverMultiplayer().remotes.find(r=>r.id==='alice'),server:window.__riverMultiplayer().snapshot.players.find(p=>p.id==='alice'),self:window.__riverMultiplayer().snapshot.players.find(p=>p.id==='bob')?.position}))}));
  const seen=await peer(bob,'alice');
  check(seen.riderSeated&&`${seen.sitting.buildId}:${seen.sitting.slot}`===seat.id,'Another player sees them seated on that place');
  await bob.waitForFunction(heading=>{const r=window.__riverMultiplayer().remotes.find(remote=>remote.id==='alice');return Math.abs(Math.atan2(Math.sin(r.heading-heading),Math.cos(r.heading-heading)))<0.15;},seat.heading,{timeout:10000});
  check(true,'and facing the way the bench faces');
  await bob.evaluate(([x,north])=>window.__riverSeatAndWater().face(x,north),[seat.x,seat.north]);
  await bob.waitForTimeout(1500);
  await bob.screenshot({path:'output/playwright/sit-bob-sees-alice.png'});
  await page.waitForTimeout(800);
  await page.screenshot({path:'output/playwright/sit-alice-seated.png'});

  // The other place is still free for Bob; Alice's is not offered.
  const bobPrompt=await bob.evaluate(()=>window.__riverSeatAndWater().interaction);
  check(bobPrompt==='sit','Bob can still sit beside her');
  await press(bob,'KeyZ');
  await bob.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerSeat,null,{timeout:15000});
  const bobSeat=await bob.evaluate(()=>document.querySelector('#canvas-host').dataset.playerSeat);
  check(bobSeat&&bobSeat!==seat.id,'A held place is never offered; Bob takes the one beside it');
  const bobSeen=await page.waitForFunction(()=>window.__riverMultiplayer().remotes.find(remote=>remote.id==='bob')?.riderSeated,null,{timeout:20000}).then(()=>true,()=>false);
  if(!bobSeen){
    const diagnostics={bobLocal:await bob.evaluate(()=>({seat:document.querySelector('#canvas-host').dataset.playerSeat,self:window.__riverMultiplayer().snapshot.players.find(p=>p.id==='bob'),hud:document.querySelector('#walking-hud .walking-title strong')?.textContent})),
      aliceSeesBob:await page.evaluate(()=>({remote:window.__riverMultiplayer().remotes.find(r=>r.id==='bob'),server:window.__riverMultiplayer().snapshot.players.find(p=>p.id==='bob')}))};
    throw new Error('Alice never saw Bob seated: '+JSON.stringify(diagnostics));
  }
  await page.waitForTimeout(800);
  await page.screenshot({path:'output/playwright/sit-two-on-a-bench.png'});

  // Stand up with Z, for everyone; the town stands them on open pavement in front.
  await press(page,'KeyZ');
  await page.waitForFunction(()=>!document.querySelector('#canvas-host').dataset.playerSeat,null,{timeout:15000});
  await bob.waitForFunction(()=>!window.__riverMultiplayer().remotes.find(remote=>remote.id==='alice')?.riderSeated,null,{timeout:20000});
  check((await self(page,'alice')).sitting===null,'Z stands up, for everyone');
  await press(bob,'KeyZ');
  await bob.waitForFunction(()=>!document.querySelector('#canvas-host').dataset.playerSeat,null,{timeout:15000});
  check(true,'Bob stands up too');

  // Watering a planter: an animation only.
  const planter=planters.find(item=>item.kind==='boxwood')??planters[0];
  await goNear(page,planter.id);
  await page.waitForFunction(()=>window.__riverSeatAndWater().interaction==='water',null,{timeout:15000});
  await page.waitForFunction(()=>document.querySelector('#walking-interact')?.textContent.startsWith('Water the planter'),null,{timeout:5000});
  check(true,'Beside a planter, the Z prompt offers to water it');
  // Bob watches from the planter on the other side of the door.
  await goNear(bob,planter.id.replace(/:(\d)$/,(_,i)=>`:${1-Number(i)}`));
  await press(page,'KeyZ');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerWatering==='true',null,{timeout:10000});
  await bob.waitForFunction(()=>{const r=window.__riverMultiplayer().remotes.find(remote=>remote.id==='alice');return r?.gesture==='water'&&r.watering;},null,{timeout:15000});
  const alicePose=await self(bob,'alice');
  const toward=Math.atan2(planter.x-alicePose.position[0],-(planter.north-alicePose.position[1]));
  // The body turns smoothly toward the planter.
  const turned=await bob.waitForFunction(toward=>{const r=window.__riverMultiplayer().remotes.find(remote=>remote.id==='alice');
    return r&&Math.abs(Math.atan2(Math.sin(r.heading-toward),Math.cos(r.heading-toward)))<0.2;},toward,{timeout:5000}).then(()=>true,()=>false);
  const pouring=await peer(bob,'alice');
  check(turned&&pouring.watering,`Another player sees them turn to the planter and pour from a watering can (${JSON.stringify({seen:pouring.heading,toward})})`);
  await bob.evaluate(([x,north])=>window.__riverSeatAndWater().face(x,north),[alicePose.position[0],alicePose.position[1]]);
  await press(bob,'KeyH');await bob.waitForTimeout(700);
  await bob.screenshot({path:'output/playwright/water-bob-sees-alice.png'});
  await press(bob,'KeyH');
  await page.screenshot({path:'output/playwright/water-alice.png'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerWatering==='false',null,{timeout:10000});
  await bob.waitForFunction(()=>!window.__riverMultiplayer().remotes.find(remote=>remote.id==='alice')?.watering,null,{timeout:10000});
  check(true,'The watering animation ends by itself');

  // Town streets contain real players; indoor NPC poses are checked separately.
  check(await page.evaluate(()=>!window.__riverPeople().some(person=>person.id.startsWith('local-'))),
    'No outdoor NPCs are rendered on multiplayer benches');

  await bob.context().close();
  check(errors.length===0,`No page errors: ${errors.join(' | ')}`);
  return {checks};
}
