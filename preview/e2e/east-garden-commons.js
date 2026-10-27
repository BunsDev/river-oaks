async page => {
  const traceInput = process.env.CI === 'true';
  const { installInputAuthorityTrace, captureInputAuthorityEvidence } = await import('./input-authority-trace.js');
  const { loadDistrictData } = await import('../../server/district-data.js');
  const { createResidentNavigation } = await import('../src/navigation.js');
  const revision='east-garden-commons-market-1',world=await loadDistrictData({districtRevision:revision});
  const { plazaSalonSeats } = await import('../src/plaza-salon-plan.js');
  // Players may cross streets; the arrival spawn is on a road, which the pedestrian-only resident grid refuses.
  const nav=createResidentNavigation(world,{allowRoads:true}),checks=[],routes=[],origin='http://127.0.0.1:5173';
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const peerContext=await page.context().browser().newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await peerContext.addCookies([{name:'fixture_session',value:'alice',url:origin}]);
  const peer=await peerContext.newPage();peer.setDefaultTimeout(120000);peer.on('pageerror',e=>errors.push(e.message));
  const self=tab=>tab.evaluate(()=>{const town=window.__riverMultiplayer();return town.snapshot.players.find(p=>p.id===town.selfId);});
  const ready=async tab=>{
    if(traceInput)await tab.addInitScript(installInputAuthorityTrace);
    await tab.emulateMedia({reducedMotion:'reduce'});
    await tab.addInitScript(()=>{
      const Original=window.WebSocket;window.__commonsSockets=[];window.__commonsRefusals=[];
      window.WebSocket=class extends Original{constructor(...args){super(...args);if(new URL(args[0],location.href).pathname!=='/multiplayer')return;window.__commonsSockets.push(this);
        // A stalled walk reports the town's latest refusals and corrections, so a CI first failure explains itself.
        this.addEventListener('message',event=>{try{const data=JSON.parse(event.data),reply=data.result??data;if(reply?.ok!==false&&!data.correction)return;
          window.__commonsRefusals.push({t:Math.round(performance.now()),error:reply?.error??null,at:(data.correction??reply?.correction)?.position??null});window.__commonsRefusals.splice(0,window.__commonsRefusals.length-12);}catch{/* not JSON */}});}};
    });
    await tab.goto(`${origin}/?motion-debug=1`);
    await tab.waitForFunction(revision=>window.__riverMultiplayer?.().connected
      && window.__riverMultiplayer().snapshot?.districtRevision===revision
      && document.querySelector('#canvas-host')?.dataset.playerReady==='true',revision,{timeout:180000});
    if(await tab.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await tab.locator('#panel-toggle').click();
    if(await tab.locator('.visit-tools').evaluate(node=>node.open))await tab.locator('.visit-tools-toggle').click();
  };
  // Both players walk at once in one browser. A drag in one page while the other page drags
  // rarely gets pointer capture, so it does not turn: in a hosted run that stalled, the owner's
  // drags captured 1 of 115 times while alice dragged and 26 of 33 times otherwise. Turn one page
  // at a time, and let a frame pass (about 333 ms at 3 fps) before the other page drags.
  let turning=Promise.resolve();
  const walk=async(tab,points,label)=>{
    const started=Date.now(),start=await self(tab),samples=[],turns={drags:0,turned:0};let dragYaw=null;
    const releaseKeys=async()=>{await tab.keyboard.up('KeyW');await tab.keyboard.up('ShiftLeft');};
    try{for(const target of points){
      const deadline=Date.now()+120000;
      for(;;){
        const pose=await tab.evaluate(()=>window.__riverCarriage().pose),dx=target[0]-pose.position[0],dz=-target[1]-pose.position[2],distance=Math.hypot(dx,dz);
        if(dragYaw!==null){if(pose.yaw!==dragYaw)turns.turned++;dragYaw=null;}
        // Stay inside the planner's 0.3 m corner clearance before turning. A fast press can carry the
        // walker through the waypoint at full speed; let it stop and measure again, or it coasts on
        // (a hosted run ended 0.9 m past its lantern, outside the town's arrival check).
        if(distance<.15){await releaseKeys();if(pose.speed<.05)break;await tab.waitForFunction(()=>window.__riverCarriage().pose.speed<.05,null,{timeout:10000});continue;}
        if(Date.now()>deadline)throw new Error(`${label}: stalled ${JSON.stringify({target,pose,turns,refusals:await tab.evaluate(()=>window.__commonsRefusals)})}`);
        const heading=Math.atan2(-dx,-dz),difference=Math.atan2(Math.sin(heading-pose.yaw),Math.cos(heading-pose.yaw));
        if(Math.abs(difference)>.035){
          await releaseKeys();
          const turn=turning.then(async()=>{
            const box=await tab.locator('#canvas-host').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.4;
            const drag=Math.max(-box.width*.35,Math.min(box.width*.35,-difference/.003));
            await tab.mouse.move(x,y);await tab.mouse.down();await tab.mouse.move(x+drag,y,{steps:3});await tab.mouse.up();
            await tab.waitForTimeout(350);
          });
          turning=turn.catch(()=>{});
          await turn;turns.drags++;dragYaw=pose.yaw;continue;
        }
        // A lifecycle release clears runtime input; repeat keydown cannot resume it.
        if(pose.speed<.05)await releaseKeys();
        await tab.locator('#canvas-host').focus();
        const fast=distance>2;
        if(fast)await tab.keyboard.down('ShiftLeft');else await tab.keyboard.up('ShiftLeft');
        await tab.keyboard.down('KeyW');
        await tab.waitForTimeout(Math.min(450,Math.max(30,distance*(fast?110:230))));
        // Keep walking during browser round trips, as spatial-streets does.
        // Pulsing/releasing every sample repeatedly brakes on CPU-rendered CI.
        // Reassert while held; a stopped observation starts a fresh press above.
        // Within two metres, stop before measuring again: held across a slow
        // round trip (about 9 fps on CPU-rendered CI) the walker overshoots by
        // more than the arrival radius and circles the waypoint until it stalls.
        if(!fast){await releaseKeys();await tab.waitForFunction(()=>window.__riverCarriage().pose.speed<.05,null,{timeout:10000});}
        samples.push((await self(tab)).position);
      }
    }
    }finally{await releaseKeys();}
    const target=points.at(-1);
    try{await tab.waitForFunction(target=>{const town=window.__riverMultiplayer(),p=town.snapshot.players.find(p=>p.id===town.selfId);return Math.hypot(p.position[0]-target[0],p.position[1]-target[1])<.6;},target,{timeout:10000});}
    catch(error){throw new Error(`${label}: the town did not confirm arrival ${JSON.stringify(await tab.evaluate(()=>{const town=window.__riverMultiplayer();
      return {pose:window.__riverCarriage().pose.position,town:town.snapshot.players.find(p=>p.id===town.selfId)?.position,connected:town.connected,refusals:window.__commonsRefusals};}).catch(()=>null))} (${error.message})`);}
    routes.push({label,seconds:(Date.now()-started)/1000,start:start.position,end:(await self(tab)).position,samples,turns});console.log(`${label} reached`);
  };
  try{
    await Promise.all([ready(page),ready(peer)]);
    const starts=await Promise.all([self(page),self(peer)]),timeOrigins=await Promise.all([page.evaluate(()=>performance.timeOrigin),peer.evaluate(()=>performance.timeOrigin)]);
    check(starts.every(p=>p.position[0]<world.eastGardenCommons.edge),'Both players start in the original District');
    // Matched parity captures: same client, quality, time and walking eye height in the District and the destination.
    const views=[],capture=async(tab,name)=>{await tab.waitForTimeout(600);await tab.screenshot({path:`output/playwright/bayou-${name}.png`});
      views.push({name,pose:(await self(tab)).position,scene:await tab.evaluate(()=>window.__riverLanternWalk?.().scene??null)});};
    await capture(page,'parity-district-arrival');
    const gate=[-2685,-1334];
    const approach=starts.map(player=>nav.route(player.position.slice(0,2),gate));
    check(approach.every(path=>path?.length),'Existing walking routes connect both arrivals to the eastern gateway');
    await Promise.all([walk(page,approach[0],'owner approach'),walk(peer,approach[1],'alice approach')]);
    const edge=world.eastGardenCommons.edge;
    await Promise.all([walk(page,[[edge-1,-1335],[edge+20,-1335]],'owner market street'),walk(peer,[[edge-1,-1336],[edge+12,-1336]],'alice market street')]);
    await capture(page,'parity-market-street');
    await Promise.all([walk(page,[[edge+80,-1334]],'owner outward'),walk(peer,[[edge+80,-1336]],'alice outward')]);
    check((await self(page)).position[0]>edge+70&&(await self(peer)).position[0]>edge+70,'Two real clients reached the Commons by keyboard walking');
    const peerId=(await self(peer)).id;
    await page.waitForFunction(id=>window.__riverMultiplayer().snapshot.players.some(p=>p.id===id&&p.position[0]>-2600),peerId);
    await page.screenshot({path:'output/playwright/east-garden-commons-arrival.png'});
    const seats=[0,1].map(chair=>plazaSalonSeats(world).find(seat=>seat.buildId===`bench:plaza-salon-chess-commons-${chair}`));
    await Promise.all([walk(page,[[edge+90,-1325],seats[0].approach],'owner table'),walk(peer,[[edge+90,-1325],seats[1].approach],'alice table')]);
    for(const [tab,seat] of [[page,seats[0]],[peer,seats[1]]]){
      await tab.waitForFunction(()=>window.__riverSeatAndWater().interaction==='sit');
      await tab.locator('#canvas-host').focus();await tab.keyboard.press('KeyZ');
      await tab.waitForFunction(id=>window.__riverSeatAndWater().seated===id,seat.id);
      await tab.keyboard.press('KeyX');await tab.locator('#table-game-panel[open]').waitFor();
    }
    await page.locator('#table-game-panel [data-mode=shared]').click();
    await peer.locator('#table-game-panel [data-invite=accept]').click();
    await page.waitForFunction(()=>window.__riverPlazaGames().mode==='shared');
    for(const [tab,from,to] of [[page,'f2','f3'],[peer,'e7','e5'],[page,'g2','g4'],[peer,'d8','h4']]){
      await tab.waitForFunction(()=>window.__riverPlazaGames().status.startsWith('Your move'));
      await tab.locator(`#table-game-panel .table-square[data-square=${from}]`).click();
      await tab.locator(`#table-game-panel .table-square[data-square=${to}]`).click();
    }
    await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.tables.find(t=>t.id==='chess-commons')?.result?.winner==='b');
    await peer.waitForFunction(()=>window.__riverMultiplayer().snapshot.tables.find(t=>t.id==='chess-commons')?.result?.winner==='b');
    check(true,'Both clients completed the shared Commons chess game through the normal board UI');
    await page.screenshot({path:'output/playwright/east-garden-commons-game.png'});
    for(const tab of [page,peer]){
      await tab.locator('#table-game-panel .table-game-close').click();
      await tab.locator('#canvas-host').focus();await tab.keyboard.press('KeyZ');
      await tab.waitForFunction(()=>!window.__riverSeatAndWater().seated);
    }
    await Promise.all([walk(page,[[edge+90,-1325],[edge+80,-1334]],'owner plaza'),walk(peer,[[edge+90,-1325],[edge+80,-1336]],'alice plaza')]);

    const before=await self(page),socketCount=await page.evaluate(()=>window.__commonsSockets.length),reconnectStart=Date.now();
    await page.evaluate(()=>window.__commonsSockets.at(-1).close());
    await page.waitForFunction(count=>window.__commonsSockets.length>count&&window.__commonsSockets.at(-1).readyState===WebSocket.OPEN&&window.__riverMultiplayer().connected,socketCount);
    const after=await self(page);
    check(after.id===before.id&&Math.hypot(...after.position.map((v,i)=>v-before.position[i]))<.5,'Reconnect keeps identity and Commons position');
    const reconnectMs=Date.now()-reconnectStart;

    // The Lantern Walk (#586): the two players split up, light lanterns with Z at
    // each one through the normal HUD interaction, and finish together.
    const at=([x,y])=>[edge+x,-1335+y],lanterns=world.eastGardenCommons.destination.lanterns,id=suffix=>lanterns.find(l=>l.id.endsWith(suffix)).id;
    const light=async(tab,lantern,label)=>{
      await tab.waitForFunction(lantern=>window.__riverLanternWalk().near===lantern,lantern,{timeout:15000});
      await tab.locator('#canvas-host').focus();await tab.keyboard.press('KeyZ');
      await tab.waitForFunction(lantern=>window.__riverMultiplayer().snapshot.lanternWalk?.lanterns.find(l=>l.id===lantern)?.lit,lantern,{timeout:15000});
      console.log(`${label} lit`);
    };
    const lanternStart=Date.now();
    await Promise.all([
      (async()=>{await walk(page,[at([80,1]),at([104.5,.5]),at([107,0])],'owner to tower lantern');await light(page,id('lantern-tower'),'owner tower');await capture(page,'tower-lantern');
        await walk(page,[at([104.5,.5]),at([85,-12]),at([84,-19.3])],'owner to rain garden lantern');await light(page,id('lantern-rain-garden'),'owner rain garden');})(),
      (async()=>{await walk(peer,[at([80,-1]),at([55,2]),at([49.6,8.9])],'alice to terrace lantern');await light(peer,id('lantern-terrace'),'alice terrace');
        await walk(peer,[at([47,1]),at([22.5,-1]),at([22.5,-8]),at([24,-12])],'alice to court lantern');await light(peer,id('lantern-court'),'alice court');await capture(peer,'court');})(),
    ]);
    const lanternMid=await page.evaluate(()=>window.__riverMultiplayer().snapshot.lanternWalk);
    check(lanternMid.lanterns.filter(l=>l.lit).length===4&&!lanternMid.round.completedAt,'Four lanterns lit by two players; the round waits for the fifth');
    await walk(page,[at([84,-12]),at([80,-2]),at([6.5,-2.5])],'owner to gateway lantern');await light(page,id('lantern-gateway'),'owner gateway');
    for(const tab of [page,peer])await tab.waitForFunction(()=>Boolean(window.__riverMultiplayer().snapshot.lanternWalk?.round?.completedAt),null,{timeout:15000});
    const lanternDone=await peer.evaluate(()=>window.__riverMultiplayer().snapshot.lanternWalk);
    check(lanternDone.round.lamplighters.length===2&&lanternDone.best?.seconds>0&&lanternDone.rounds>=1,'Both clients see the completed Lantern Walk credited to both players');
    check(await page.evaluate(()=>!document.querySelector('#lantern-walk-status').hidden&&document.querySelector('#lantern-walk-status').textContent.includes('Bayou Lantern is lit')),'The shared status announces the lit Bayou Lantern');
    await page.screenshot({path:'output/playwright/east-garden-commons-lantern-walk.png'});
    const lanternWalk={seconds:(Date.now()-lanternStart)/1000,roundSeconds:lanternDone.round.seconds,lamplighters:lanternDone.round.lamplighters};
    await Promise.all([walk(page,[[edge-1,-1335],gate],'owner return'),walk(peer,[at([22.5,-8]),at([22.5,-1]),[edge-1,-1336],[-2685,-1335]],'alice return')]);
    await Promise.all([walk(page,nav.route((await self(page)).position.slice(0,2),starts[0].position.slice(0,2)),'owner home'),walk(peer,nav.route((await self(peer)).position.slice(0,2),starts[1].position.slice(0,2)),'alice home')]);
    check((await page.evaluate(()=>performance.timeOrigin))===timeOrigins[0]&&(await peer.evaluate(()=>performance.timeOrigin))===timeOrigins[1],'Round trip preserved both documents without reload');
    check(errors.length===0,`No page errors: ${errors.join('; ')}`);
    const refusals={owner:await page.evaluate(()=>window.__commonsRefusals),alice:await peer.evaluate(()=>window.__commonsRefusals)};
    return {checks,routes,reconnectMs,lanternWalk,views,refusals,scope:'Two rendered fixture clients, normal keyboard walking from original District arrivals; shared chess and Lantern Walk activities; no physical-device or production acceptance'};
  }catch(error){
    if(traceInput){
      const failure=error instanceof Error?error:new Error(String(error));
      failure.journeyEvidence={schemaVersion:1,scope:'CI-only normal-journey observations; no keyboard-handler acceptance inferred',
        checks,routes,players:await captureInputAuthorityEvidence([['owner',page],['peer',peer]])};
      throw failure;
    }
    throw error;
  }finally{await peerContext.close();}
}
