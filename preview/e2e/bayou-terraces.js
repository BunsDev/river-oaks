async page => {
  // The Bayou Terraces (bayou-terraces-1, #586 continuation toward 3x): two rendered
  // clients travel to the Heights greenway, walk west over the Twentieth Street footbridge
  // into the north terrace gardens, play its game table through the board UI, reconnect
  // there, and walk back over the bridge.
  const { loadDistrictData } = await import('../../server/district-data.js');
  const revision='bayou-terraces-1',world=await loadDistrictData({districtRevision:revision}),layout=world.eastGardenCommons;
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
    const edge=layout.edge,bank=layout.heights.bounds[0],at=([x,y])=>[edge+x,-1335+y];
    check(await page.evaluate(()=>window.__riverBayouHeights?.()?.revision)==='bayou-terraces-1','The client composed the Bayou Terraces for the served revision');
    const views=[],capture=async(tab,name)=>{await tab.waitForTimeout(600);await tab.screenshot({path:`output/playwright/terraces-${name}.png`});
      views.push({name,pose:(await self(tab)).position,scene:await tab.evaluate(()=>window.__riverBayouHeights?.().scene??null)});};
    // Approved travel to the greenway beside the footbridge, then on foot from there.
    for(const [tab,y] of [[page,112],[peer,110]]){
      const arrival=await command(tab,{type:'travel',position:at([156.5,y])});
      check(arrival?.ok===true,`Travel to the Heights greenway is approved (${y})`);
      await tab.waitForFunction(([x,n])=>{const pose=window.__riverCarriage().pose.position;return Math.hypot(pose[0]-x,-pose[2]-n)<.6;},at([156.5,y]),{timeout:60000});
    }
    for(const tab of [page,peer])await tab.waitForFunction(()=>window.__riverBayouHeights().stream.chunks.find(chunk=>chunk.id==='bayou-heights/bayou-terrace-north').state==='ready',null,{timeout:120000});
    const streamed=await page.evaluate(()=>window.__riverBayouHeights().stream);
    console.log(`Heights resident ${streamed.residentBytes} of ${streamed.geometryBudgetBytes} bytes: measured ${JSON.stringify(streamed.measuredBytes)} estimated ${JSON.stringify(streamed.estimatedBytes)}`);
    check(streamed.residentBytes<=streamed.geometryBudgetBytes&&Object.entries(streamed.measuredBytes).every(([id,bytes])=>bytes<=streamed.estimatedBytes[id]),
      'The north terrace streams in at the greenway, within the Heights geometry ceiling and each part within its estimate');
    await capture(page,'greenway-footbridge');
    await Promise.all([walk(page,[at([130,112]),at([101,112])],'owner footbridge'),walk(peer,[at([130,110]),at([100,110])],'alice footbridge')]);
    check((await self(page)).position[0]<bank&&(await self(peer)).position[0]<bank,'Two real clients crossed the Twentieth Street footbridge onto the west bank by keyboard');
    check(await page.evaluate(()=>window.__heightsNotices.includes('Entering Bayou Terraces')),'Crossing the footbridge names the Bayou Terraces');
    await capture(page,'riverside-walk');

    // The gardens table: both players sit and finish a shared game through the board UI.
    const seats=[0,1].map(chair=>plazaSalonSeats(world).find(seat=>seat.buildId===`bench:plaza-salon-chess-terrace-${chair}`));
    await Promise.all([walk(page,[at([101,128]),seats[1].approach],'owner gardens'),walk(peer,[at([96,124]),seats[0].approach],'alice gardens')]);
    await capture(page,'gardens');
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
    for(const tab of [page,peer])await tab.waitForFunction(()=>window.__riverMultiplayer().snapshot.tables.find(t=>t.id==='chess-terrace')?.result?.winner==='b');
    check(true,'Both clients completed a shared game at the terrace gardens table through the normal board UI');
    await page.screenshot({path:'output/playwright/terraces-gardens-game.png'});
    for(const tab of [page,peer]){
      await tab.locator('#table-game-panel .table-game-close').click();
      await tab.locator('#canvas-host').focus();await tab.keyboard.press('KeyZ');
      await tab.waitForFunction(()=>!window.__riverSeatAndWater().seated);
    }
    const before=await self(page),socketCount=await page.evaluate(()=>window.__heightsSockets.length),reconnectStart=Date.now();
    await page.evaluate(()=>window.__heightsSockets.at(-1).close());
    await page.waitForFunction(count=>window.__heightsSockets.length>count&&window.__heightsSockets.at(-1).readyState===WebSocket.OPEN&&window.__riverMultiplayer().connected,socketCount);
    const after=await self(page),drift=Math.hypot(...after.position.map((v,i)=>v-before.position[i]));
    check(after.id===before.id&&drift<.5,'Reconnect keeps identity and terrace position');
    const reconnectMs=Date.now()-reconnectStart;

    // Back over the footbridge to the greenway, one player at a time, as the Heights journey does on CPU-rendered CI.
    await walk(peer,[at([96,124]),at([100,110]),at([156.5,110])],'alice greenway');
    await walk(page,[at([101,128]),at([101,112]),at([156.5,112])],'owner greenway');
    check((await self(page)).position[0]>bank&&(await self(peer)).position[0]>bank,'Both players walked back over the footbridge to the greenway');
    check(await page.evaluate(()=>{const notices=window.__heightsNotices,terraces=notices.indexOf('Entering Bayou Terraces');
      return terraces>=0&&notices.indexOf('Entering Bayou Heights',terraces)>terraces;}),'Returning names Bayou Heights');
    await capture(page,'greenway-return');
    check(errors.length===0,`No page errors: ${errors.join('; ')}`);
    const refusals={owner:await page.evaluate(()=>window.__heightsRefusals),alice:await peer.evaluate(()=>window.__heightsRefusals)};
    return {checks,routes,reconnectMs,drift,views,refusals,scope:'Two rendered fixture clients: approved travel to the Heights greenway, then normal keyboard walking over the Twentieth Street footbridge into the north terrace gardens; shared gardens table game and reconnect on the terrace; no physical-device or production acceptance'};
  }finally{await peerContext.close();}
}
