async page => {
  const { loadDistrictData } = await import('../../server/district-data.js');
  const { createResidentNavigation } = await import('../src/navigation.js');
  const { arrivalPedestrianRoute } = await import('../audit/baseline-580-route.js');
  const revision='east-garden-commons-market-1',world=await loadDistrictData({districtRevision:revision});
  const { plazaSalonSeats } = await import('../src/plaza-salon-plan.js');
  const nav=createResidentNavigation(world),checks=[],routes=[],origin='http://127.0.0.1:5173';
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const peerContext=await page.context().browser().newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await peerContext.addCookies([{name:'fixture_session',value:'alice',url:origin}]);
  const peer=await peerContext.newPage();peer.setDefaultTimeout(120000);peer.on('pageerror',e=>errors.push(e.message));
  const self=tab=>tab.evaluate(()=>{const town=window.__riverMultiplayer();return town.snapshot.players.find(p=>p.id===town.selfId);});
  const ready=async tab=>{
    await tab.emulateMedia({reducedMotion:'reduce'});
    await tab.addInitScript(()=>{
      const Original=window.WebSocket;window.__commonsSockets=[];
      window.WebSocket=class extends Original{constructor(...args){super(...args);if(new URL(args[0],location.href).pathname==='/multiplayer')window.__commonsSockets.push(this);}};
    });
    await tab.goto(`${origin}/?motion-debug=1`);
    await tab.waitForFunction(revision=>window.__riverMultiplayer?.().connected
      && window.__riverMultiplayer().snapshot?.districtRevision===revision
      && document.querySelector('#canvas-host')?.dataset.playerReady==='true',revision,{timeout:180000});
    if(await tab.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await tab.locator('#panel-toggle').click();
    if(await tab.locator('.visit-tools').evaluate(node=>node.open))await tab.locator('.visit-tools-toggle').click();
  };
  const walk=async(tab,points,label)=>{
    const started=Date.now(),start=await self(tab),samples=[];
    for(const target of points){
      const deadline=Date.now()+120000;
      for(;;){
        const pose=await tab.evaluate(()=>window.__riverCarriage().pose),dx=target[0]-pose.position[0],dz=-target[1]-pose.position[2],distance=Math.hypot(dx,dz);
        if(distance<.35)break;
        if(Date.now()>deadline)throw new Error(`${label}: stalled ${JSON.stringify({target,pose})}`);
        const heading=Math.atan2(-dx,-dz),difference=Math.atan2(Math.sin(heading-pose.yaw),Math.cos(heading-pose.yaw));
        if(Math.abs(difference)>.035){
          const box=await tab.locator('#canvas-host').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.4;
          const drag=Math.max(-box.width*.35,Math.min(box.width*.35,-difference/.003));
          await tab.mouse.move(x,y);await tab.mouse.down();await tab.mouse.move(x+drag,y,{steps:3});await tab.mouse.up();continue;
        }
        await tab.locator('#canvas-host').focus();
        const fast=distance>2;
        if(fast)await tab.keyboard.down('ShiftLeft');
        await tab.keyboard.down('KeyW');
        await tab.waitForTimeout(Math.min(450,Math.max(30,distance*(fast?110:230))));
        await tab.keyboard.up('KeyW');if(fast)await tab.keyboard.up('ShiftLeft');
        samples.push((await self(tab)).position);
      }
    }
    const target=points.at(-1);
    await tab.waitForFunction(target=>{const town=window.__riverMultiplayer(),p=town.snapshot.players.find(p=>p.id===town.selfId);return Math.hypot(p.position[0]-target[0],p.position[1]-target[1])<.6;},target,{timeout:10000});
    routes.push({label,seconds:(Date.now()-started)/1000,start:start.position,end:(await self(tab)).position,samples});console.log(`${label} reached`);
  };
  try{
    await Promise.all([ready(page),ready(peer)]);
    const starts=await Promise.all([self(page),self(peer)]),timeOrigins=await Promise.all([page.evaluate(()=>performance.timeOrigin),peer.evaluate(()=>performance.timeOrigin)]);
    check(starts.every(p=>p.position[0]<world.eastGardenCommons.edge),'Both players start in the original District');
    const gate=[-2685,-1334];
    const approach=starts.map(player=>arrivalPedestrianRoute(nav,player.position.slice(0,2),gate));
    check(approach.every(path=>path?.length),'Existing roadway exits and pedestrian routes connect both arrivals to the eastern gateway');
    await Promise.all([walk(page,approach[0],'owner approach'),walk(peer,approach[1],'alice approach')]);
    const edge=world.eastGardenCommons.edge;
    await Promise.all([walk(page,[[edge-1,-1335],[edge+80,-1334]],'owner outward'),walk(peer,[[edge-1,-1336],[edge+80,-1336]],'alice outward')]);
    check((await self(page)).position[0]>edge+70&&(await self(peer)).position[0]>edge+70,'Two real clients reached the Commons by keyboard walking');
    const peerId=(await self(peer)).id;
    await page.waitForFunction(id=>window.__riverMultiplayer().snapshot.players.some(p=>p.id===id&&p.position[0]>-2600),peerId);
    await page.screenshot({path:'output/playwright/baseline-580-arrival.png'});
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
    await page.screenshot({path:'output/playwright/baseline-580-game.png'});
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
    await Promise.all([walk(page,[[edge-1,-1335],gate],'owner return'),walk(peer,[[edge-1,-1336],[-2685,-1335]],'alice return')]);
    await Promise.all([walk(page,[...[...approach[0]].reverse(),starts[0].position.slice(0,2)],'owner home'),walk(peer,[...[...approach[1]].reverse(),starts[1].position.slice(0,2)],'alice home')]);
    check((await page.evaluate(()=>performance.timeOrigin))===timeOrigins[0]&&(await peer.evaluate(()=>performance.timeOrigin))===timeOrigins[1],'Round trip preserved both documents without reload');
    check(errors.length===0,`No page errors: ${errors.join('; ')}`);
    return {checks,routes,reconnectMs,scope:'Two rendered fixture clients, normal keyboard walking from original District arrivals; shared chess activity; no physical-device or production acceptance'};
  }finally{await peerContext.close();}
}
