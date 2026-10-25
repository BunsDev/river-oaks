async page => {
  // Studewood (heights-studewood-1, #586 continuation toward 3x): two rendered clients
  // travel to Heights Boulevard, walk east along Twentieth Street into Studewood Park,
  // play its game table through the board UI, reconnect there, and walk back to Heights.
  const { loadDistrictData } = await import('../../server/district-data.js');
  const revision='heights-studewood-1',world=await loadDistrictData({districtRevision:revision}),layout=world.eastGardenCommons;
  const { plazaSalonSeats } = await import('../src/plaza-salon-plan.js');
  const checks=[],routes=[],origin='http://127.0.0.1:5173';
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const peerContext=await page.context().browser().newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await peerContext.addCookies([{name:'fixture_session',value:'alice',url:origin}]);
  const peer=await peerContext.newPage();peer.setDefaultTimeout(120000);peer.on('pageerror',e=>errors.push(e.message));
  const self=tab=>tab.evaluate(()=>{const town=window.__riverMultiplayer();return town.snapshot.players.find(p=>p.id===town.selfId);});
  const ready=async tab=>{
    await tab.emulateMedia({reducedMotion:'reduce'});
    await tab.addInitScript(()=>{
      const Original=window.WebSocket;window.__heightsSockets=[];window.__heightsRefusals=[];
      window.WebSocket=class extends Original{constructor(...args){super(...args);if(new URL(args[0],location.href).pathname!=='/multiplayer')return;window.__heightsSockets.push(this);
        this.addEventListener('message',event=>{try{const data=JSON.parse(event.data),reply=data.result??data;if(reply?.ok!==false&&!data.correction)return;
          window.__heightsRefusals.push({t:Math.round(performance.now()),error:reply?.error??null,at:(data.correction??reply?.correction)?.position??null});window.__heightsRefusals.splice(0,window.__heightsRefusals.length-12);}catch{/* not JSON */}});}};
    });
    await tab.goto(`${origin}/?motion-debug=1`);
    await tab.waitForFunction(revision=>window.__riverMultiplayer?.().connected
      && window.__riverMultiplayer().snapshot?.districtRevision===revision
      && document.querySelector('#canvas-host')?.dataset.playerReady==='true'
      && document.querySelector('#loading')?.hidden===true,revision,{timeout:180000});
    await tab.evaluate(()=>{const notice=document.querySelector('#walking-notice');if(!notice)throw new Error('The walking notice is missing');window.__heightsNotices=[];
      new MutationObserver(()=>{if(!notice.hidden&&notice.textContent)window.__heightsNotices.push(notice.textContent);}).observe(notice,{childList:true,characterData:true,subtree:true,attributes:true});});
    if(await tab.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await tab.locator('#panel-toggle').click();
    if(await tab.locator('.visit-tools').evaluate(node=>node.open))await tab.locator('.visit-tools-toggle').click();
  };
  const turn=async(tab,difference)=>{
    const box=await tab.locator('#canvas-host').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.4;
    const drag=Math.max(-box.width*.35,Math.min(box.width*.35,-difference/.003));
    await tab.mouse.move(x,y);await tab.mouse.down();await tab.mouse.move(x+drag,y,{steps:3});await tab.mouse.up();
  };
  const walk=async(tab,points,label)=>{
    const started=Date.now(),start=await self(tab),samples=[];
    const releaseKeys=async()=>{await tab.keyboard.up('KeyW');await tab.keyboard.up('ShiftLeft');};
    try{for(const target of points){
      const deadline=Date.now()+120000;
      for(;;){
        const pose=await tab.evaluate(()=>window.__riverCarriage().pose),dx=target[0]-pose.position[0],dz=-target[1]-pose.position[2],distance=Math.hypot(dx,dz);
        // Stay inside the planner's 0.3 m corner clearance before turning.
        if(distance<.15){await releaseKeys();break;}
        if(Date.now()>deadline)throw new Error(`${label}: stalled ${JSON.stringify({target,pose,refusals:await tab.evaluate(()=>window.__heightsRefusals)})}`);
        const heading=Math.atan2(-dx,-dz),difference=Math.atan2(Math.sin(heading-pose.yaw),Math.cos(heading-pose.yaw));
        if(Math.abs(difference)>.035){await releaseKeys();await turn(tab,difference);continue;}
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
      return {pose:window.__riverCarriage().pose.position,town:town.snapshot.players.find(p=>p.id===town.selfId)?.position,connected:town.connected,refusals:window.__heightsRefusals};}).catch(()=>null))} (${error.message})`);}
    routes.push({label,seconds:(Date.now()-started)/1000,start:start.position,end:(await self(tab)).position,samples});console.log(`${label} reached`);
  };
  const command=(tab,message)=>tab.evaluate(message=>window.__riverMultiplayerCommand(message),message);
  const chunk=(tab,id)=>tab.evaluate(id=>window.__riverBayouHeights()?.stream?.chunks.find(chunk=>chunk.id===id)?.state??null,id);
  try{
    await Promise.all([ready(page),ready(peer)]);
    const edge=layout.edge,west=layout.studewood.bounds[0],at=([x,y])=>[edge+x,-1335+y];
    check(await page.evaluate(()=>window.__riverBayouHeights?.()?.revision)==='heights-studewood-1','The client composed Studewood for the served revision');
    const views=[],capture=async(tab,name)=>{await tab.waitForTimeout(600);await tab.screenshot({path:`output/playwright/studewood-${name}.png`});
      views.push({name,pose:(await self(tab)).position,scene:await tab.evaluate(()=>window.__riverBayouHeights?.().scene??null)});};
    // Approved travel to Heights Boulevard's east sidewalk, then on foot from there.
    for(const [tab,y] of [[page,112.5],[peer,109.5]]){
      const arrival=await command(tab,{type:'travel',position:at([396,y])});
      check(arrival?.ok===true,`Travel to Heights Boulevard is approved (${y})`);
      await tab.waitForFunction(([x,n])=>{const pose=window.__riverCarriage().pose.position;return Math.hypot(pose[0]-x,-pose[2]-n)<.6;},at([396,y]),{timeout:60000});
    }
    for(const tab of [page,peer])await tab.waitForFunction(()=>window.__riverBayouHeights().stream.chunks.find(chunk=>chunk.id==='bayou-heights/heights-boulevard-north').state==='ready',null,{timeout:120000});
    await capture(page,'boulevard');
    await Promise.all([walk(page,[at([426,112.5]),at([445,112.5])],'owner twentieth'),walk(peer,[at([426,109.5]),at([445,109.5])],'alice twentieth')]);
    check((await self(page)).position[0]>west&&(await self(peer)).position[0]>west,'Two real clients walked along Twentieth Street into Studewood by keyboard');
    check(await page.evaluate(()=>window.__heightsNotices.includes('Entering Studewood')),'Crossing Heights Boulevard names Studewood');
    for(const tab of [page,peer])await tab.waitForFunction(()=>window.__riverBayouHeights().stream.chunks.find(chunk=>chunk.id==='bayou-heights/studewood-north').state==='ready');
    const streamed=await page.evaluate(()=>window.__riverBayouHeights().stream);
    console.log(`Heights resident ${streamed.residentBytes} of ${streamed.geometryBudgetBytes} bytes: measured ${JSON.stringify(streamed.measuredBytes)} estimated ${JSON.stringify(streamed.estimatedBytes)}`);
    check(streamed.residentBytes<=streamed.geometryBudgetBytes&&Object.entries(streamed.measuredBytes).every(([id,bytes])=>bytes<=streamed.estimatedBytes[id]),
      'Studewood streams within the Heights geometry ceiling and each part within its estimate');
    await capture(page,'studewood-street');

    // Studewood Park: both players sit at its table and finish a shared game through the board UI.
    const seats=[0,1].map(chair=>plazaSalonSeats(world).find(seat=>seat.buildId===`bench:plaza-salon-chess-studewood-${chair}`));
    // The owner takes the west chair and alice the east one: the straight line from the lawn to the east chair crosses a tree-row trunk.
    // The owner turns south at x 469, as the return leg does: from x 466 the line to the chair grazes the trunk at x 467.
    await Promise.all([walk(page,[at([445,103]),at([469,103]),seats[1].approach],'owner park'),walk(peer,[at([449,103]),at([478,103]),seats[0].approach],'alice park')]);
    await capture(page,'studewood-park');
    for(const [tab,seat] of [[page,seats[1]],[peer,seats[0]]]){
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
    for(const tab of [page,peer])await tab.waitForFunction(()=>window.__riverMultiplayer().snapshot.tables.find(t=>t.id==='chess-studewood')?.result?.winner==='b');
    check(true,'Both clients completed a shared game at the Studewood Park table through the normal board UI');
    await page.screenshot({path:'output/playwright/studewood-park-game.png'});
    for(const tab of [page,peer]){
      await tab.locator('#table-game-panel .table-game-close').click();
      await tab.locator('#canvas-host').focus();await tab.keyboard.press('KeyZ');
      await tab.waitForFunction(()=>!window.__riverSeatAndWater().seated);
    }
    const before=await self(page),socketCount=await page.evaluate(()=>window.__heightsSockets.length),reconnectStart=Date.now();
    await page.evaluate(()=>window.__heightsSockets.at(-1).close());
    await page.waitForFunction(count=>window.__heightsSockets.length>count&&window.__heightsSockets.at(-1).readyState===WebSocket.OPEN&&window.__riverMultiplayer().connected,socketCount);
    const after=await self(page),drift=Math.hypot(...after.position.map((v,i)=>v-before.position[i]));
    check(after.id===before.id&&drift<.5,'Reconnect keeps identity and Studewood position');
    const reconnectMs=Date.now()-reconnectStart;

    // Back to Heights Boulevard, one player at a time, as the Heights journey does on CPU-rendered CI.
    await walk(peer,[at([478,103]),at([449,103]),at([445,109.5]),at([396,109.5])],'alice boulevard');
    // North of the table by x 469, clear of the park bench at x 466.
    await walk(page,[at([469,103]),at([445,103]),at([445,112.5]),at([396,112.5])],'owner boulevard');
    check((await self(page)).position[0]<west&&(await self(peer)).position[0]<west,'Both players walked back to Heights Boulevard');
    check(await page.evaluate(()=>{const notices=window.__heightsNotices,studewood=notices.indexOf('Entering Studewood');
      return studewood>=0&&notices.indexOf('Entering Bayou Heights',studewood)>studewood;}),'Returning names Bayou Heights');
    await capture(page,'boulevard-return');
    check(errors.length===0,`No page errors: ${errors.join('; ')}`);
    const refusals={owner:await page.evaluate(()=>window.__heightsRefusals),alice:await peer.evaluate(()=>window.__heightsRefusals)};
    return {checks,routes,reconnectMs,drift,views,refusals,scope:'Two rendered fixture clients: approved travel to Heights Boulevard, then normal keyboard walking along Twentieth Street into Studewood; shared park table game and reconnect in Studewood; no physical-device or production acceptance'};
  }finally{await peerContext.close();}
}
