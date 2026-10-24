async page => {
  // Bayou Heights (bayou-heights-1, #586 continuation): two rendered clients walk from
  // their District arrivals over the Commons and the Lantern Footbridge into Heights,
  // play the icehouse table through the board UI, reconnect there, and walk home.
  const traceInput = process.env.CI === 'true';
  const { installInputAuthorityTrace, captureInputAuthorityEvidence } = await import('./input-authority-trace.js');
  const { loadDistrictData } = await import('../../server/district-data.js');
  const { createResidentNavigation } = await import('../src/navigation.js');
  const revision='bayou-heights-1',world=await loadDistrictData({districtRevision:revision}),layout=world.eastGardenCommons;
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
      const Original=window.WebSocket;window.__heightsSockets=[];window.__heightsRefusals=[];
      window.WebSocket=class extends Original{constructor(...args){super(...args);if(new URL(args[0],location.href).pathname!=='/multiplayer')return;window.__heightsSockets.push(this);
        // A stalled walk reports the town's latest refusals and corrections, so a CI first failure explains itself.
        this.addEventListener('message',event=>{try{const data=JSON.parse(event.data),reply=data.result??data;if(reply?.ok!==false&&!data.correction)return;
          window.__heightsRefusals.push({t:Math.round(performance.now()),error:reply?.error??null,at:(data.correction??reply?.correction)?.position??null});window.__heightsRefusals.splice(0,window.__heightsRefusals.length-12);}catch{/* not JSON */}});}};
    });
    // DIAGNOSTIC BRANCH ONLY: three.js announces each Scene to its devtools hook.
    await tab.addInitScript(()=>{window.__diagScenes=[];window.__THREE_DEVTOOLS__=new EventTarget();window.__THREE_DEVTOOLS__.addEventListener('observe',event=>{if(event.detail?.isScene)window.__diagScenes.push(event.detail);});});
    await tab.goto(`${origin}/?motion-debug=1`);
    await tab.waitForFunction(revision=>window.__riverMultiplayer?.().connected
      && window.__riverMultiplayer().snapshot?.districtRevision===revision
      && document.querySelector('#canvas-host')?.dataset.playerReady==='true',revision,{timeout:180000});
    // The walking HUD creates its notice after the world loads, so observe it once the player is ready.
    await tab.evaluate(()=>{const notice=document.querySelector('#walking-notice');if(!notice)throw new Error('The walking notice is missing');window.__heightsNotices=[];
      new MutationObserver(()=>{if(!notice.hidden&&notice.textContent)window.__heightsNotices.push(notice.textContent);}).observe(notice,{childList:true,characterData:true,subtree:true,attributes:true});});
    if(await tab.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await tab.locator('#panel-toggle').click();
    if(await tab.locator('.visit-tools').evaluate(node=>node.open))await tab.locator('.visit-tools-toggle').click();
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
        if(Math.abs(difference)>.035){
          await releaseKeys();
          const box=await tab.locator('#canvas-host').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.4;
          const drag=Math.max(-box.width*.35,Math.min(box.width*.35,-difference/.003));
          await tab.mouse.move(x,y);await tab.mouse.down();await tab.mouse.move(x+drag,y,{steps:3});await tab.mouse.up();continue;
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
      return {pose:window.__riverCarriage().pose.position,town:town.snapshot.players.find(p=>p.id===town.selfId)?.position,connected:town.connected,refusals:window.__heightsRefusals};}).catch(()=>null))} (${error.message})`);}
    routes.push({label,seconds:(Date.now()-started)/1000,start:start.position,end:(await self(tab)).position,samples});console.log(`${label} reached`);
  };
  try{
    await Promise.all([ready(page),ready(peer)]);
    const starts=await Promise.all([self(page),self(peer)]),edge=layout.edge,west=layout.heights.bounds[0];
    const at=([x,y])=>[edge+x,-1335+y];
    check(starts.every(p=>p.position[0]<edge),'Both players start in the original District');
    check(await page.evaluate(()=>window.__riverBayouHeights?.()?.revision)==='bayou-heights-1','The client composed Bayou Heights for the served revision');
    console.log('PROBE scenes',JSON.stringify(await page.evaluate(()=>window.__diagScenes.map(scene=>({children:scene.children.length,heights:Boolean(scene.getObjectByName('Bayou Heights'))})))));
    check(await page.evaluate(()=>Boolean(window.__diagScenes.find(scene=>scene.getObjectByName('Bayou Heights'))?.getObjectByName('Bayou Heights').parent)),'DIAGNOSTIC: the probe can reach the world group');
    // Pedestrian captures at walking eye height, with the scene's draw statistics.
    const views=[],capture=async(tab,name)=>{await tab.waitForTimeout(600);await tab.screenshot({path:`output/playwright/heights-${name}.png`});
      views.push({name,pose:(await self(tab)).position,scene:await tab.evaluate(()=>window.__riverBayouHeights?.().scene??null)});};
    await capture(page,'district-arrival');
    const gate=[-2685,-1334];
    const approach=starts.map(player=>nav.route(player.position.slice(0,2),gate));
    check(approach.every(path=>path?.length),'Existing walking routes connect both arrivals to the eastern gateway');
    await Promise.all([walk(page,approach[0],'owner approach'),walk(peer,approach[1],'alice approach')]);
    // Market Street, past the Bayou Lantern on either side, and over the footbridge.
    await Promise.all([walk(page,[at([-1,1.5]),at([100,1.5])],'owner market street'),walk(peer,[at([-1,-1.5]),at([100,-1.5])],'alice market street')]);
    await capture(page,'footbridge-approach');
    check(await page.evaluate(()=>!document.querySelector('#lantern-walk-status').hidden),'The Lantern Walk status shows on Market Street in the Commons');
    // Heights streams as its own location: walking Market Street brings it in before the footbridge.
    for(const tab of [page,peer])await tab.waitForFunction(()=>window.__riverBayouHeights().ready);
    const streamed=await page.evaluate(()=>window.__riverBayouHeights().stream);
    console.log(`Heights resident ${streamed.residentBytes} bytes: ${JSON.stringify(streamed.measuredBytes)}`);
    check(streamed.residentBytes>0&&streamed.residentBytes<=streamed.geometryBudgetBytes&&Object.entries(streamed.measuredBytes).every(([id,bytes])=>bytes<=streamed.estimatedBytes[id]),
      'Bayou Heights streamed in before the footbridge, within its geometry ceiling and each part within its estimate');
    await Promise.all([walk(page,[at([133,1.5]),at([165,1.5])],'owner footbridge'),walk(peer,[at([133,-1.5]),at([165,-1.5])],'alice footbridge')]);
    check((await self(page)).position[0]>west&&(await self(peer)).position[0]>west,'Two real clients crossed the Lantern Footbridge into Bayou Heights by keyboard walking');
    check(await page.evaluate(()=>window.__riverBayouHeights().inside===true&&window.__heightsNotices.some(text=>text==='Entering Bayou Heights')),'Crossing the footbridge names Bayou Heights');
    check(await page.evaluate(()=>document.querySelector('#lantern-walk-status').hidden&&!window.__heightsNotices.includes('Back in River Oaks District')),'Bayou Heights hides the Commons Lantern Walk status without announcing the District');
    const peerId=(await self(peer)).id;
    await page.waitForFunction(([id,west])=>window.__riverMultiplayer().snapshot.players.some(p=>p.id===id&&p.position[0]>west),[peerId,west]);
    await capture(page,'greenway');

    // The icehouse patio: both players sit at its table and finish a shared game through the board UI.
    const seats=[0,1].map(chair=>plazaSalonSeats(world).find(seat=>seat.buildId===`bench:plaza-salon-chess-icehouse-${chair}`));
    await Promise.all([walk(page,[at([196,1.5]),at([203,-9]),seats[0].approach],'owner icehouse'),walk(peer,[at([206,-1.5]),at([206,-9]),at([199,-9]),seats[1].approach],'alice icehouse')]);
    await capture(page,'icehouse-patio');
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
    for(const tab of [page,peer])await tab.waitForFunction(()=>window.__riverMultiplayer().snapshot.tables.find(t=>t.id==='chess-icehouse')?.result?.winner==='b');
    check(true,'Both clients completed a shared game at the icehouse table through the normal board UI');
    await page.screenshot({path:'output/playwright/heights-icehouse-game.png'});
    for(const tab of [page,peer]){
      await tab.locator('#table-game-panel .table-game-close').click();
      await tab.locator('#canvas-host').focus();await tab.keyboard.press('KeyZ');
      await tab.waitForFunction(()=>!window.__riverSeatAndWater().seated);
    }

    // Heights Green and its bandstand, then Nineteenth & Yale toward Heights Hall.
    // Clear lanes between the market stalls and the lawn's tree rows lead north to the bandstand.
    await Promise.all([walk(page,[at([203,-9]),at([201,1.5]),at([201,96])],'owner green'),walk(peer,[at([199,-9]),at([209,-1.5]),at([209,96])],'alice green')]);
    await capture(page,'green-bandstand');
    const before=await self(page),socketCount=await page.evaluate(()=>window.__heightsSockets.length),reconnectStart=Date.now();
    await page.evaluate(()=>window.__heightsSockets.at(-1).close());
    await page.waitForFunction(count=>window.__heightsSockets.length>count&&window.__heightsSockets.at(-1).readyState===WebSocket.OPEN&&window.__riverMultiplayer().connected,socketCount);
    const after=await self(page),drift=Math.hypot(...after.position.map((v,i)=>v-before.position[i]));
    check(after.id===before.id&&drift<.5,'Reconnect keeps identity and Heights position');
    const reconnectMs=Date.now()-reconnectStart;
    await Promise.all([walk(page,[at([201,1.5]),at([300,1.5])],'owner nineteenth'),walk(peer,[at([209,-1.5]),at([300,-1.5])],'alice nineteenth')]);
    await capture(page,'nineteenth-and-yale');
    // DIAGNOSTIC BRANCH ONLY: loop rate and draw stats with each top-level group hidden in turn.
    const probe=async(tab,label)=>{
      const rows=await tab.evaluate(async()=>{
        const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),host=document.querySelector('#canvas-host');
        let frames=0;const tick=()=>{frames++;requestAnimationFrame(tick);};requestAnimationFrame(tick);
        const root=window.__diagScenes.find(scene=>scene.getObjectByName('Bayou Heights')),heights=root.getObjectByName('Bayou Heights'),world=heights.parent;
        const tris=group=>{let total=0;group.traverseVisible(mesh=>{if(mesh.isMesh){const g=mesh.geometry;total+=(g.index?.count??g.attributes.position?.count??0)/3*(mesh.isInstancedMesh?mesh.count:1);}});return Math.round(total);};
        const measure=async()=>{await sleep(1500);const f0=frames,t0=performance.now(),p0=window.__riverCarriage().pose.position;await sleep(5000);
          const stats=JSON.parse(host.dataset.renderStats||'{}'),p1=window.__riverCarriage().pose.position;
          return {loopHz:+((frames-f0)/((performance.now()-t0)/1000)).toFixed(2),calls:stats.calls,triangles:stats.triangles,moved:+Math.hypot(p1[0]-p0[0],p1[2]-p0[2]).toFixed(2)};};
        const landscape=heights.children.find(part=>part.name==='bayou-heights/landscape');
        const groups=[...root.children.filter(child=>child!==world).map(child=>['root',child]),...world.children.map(child=>['world',child]),
          ...heights.children.map(child=>['heights',child]),...(landscape?landscape.children.map(child=>['landscape',child]):[])];
        const out=[{label:'all',quality:host.dataset.quality,...await measure()}];
        for(const [where,group] of groups){
          const name=`${where}:${group.name||group.type}#${group.children.length}`,count=tris(group);
          if(!group.visible||count<40000){out.push({label:name,visible:group.visible,tris:count,skipped:true});continue;}
          group.visible=false;
          try{const row=await measure();out.push({label:name,tris:count,...row,heldHidden:!group.visible});}finally{group.visible=true;}
        }
        return out;
      });
      for(const row of rows)console.log(`PROBE ${label} ${JSON.stringify(row)}`);
    };
    await probe(page,'owner east x300');
    await Promise.all([walk(page,[at([297,1.5])],'owner turn west'),walk(peer,[at([297,-1.5])],'alice turn west')]);
    await probe(page,'owner west x297');
    await probe(peer,'alice west x297');
    throw new Error('diagnostic probe complete');

    // Home: back over the footbridge and the Commons to the District.
    await Promise.all([walk(page,[at([165,1.5]),at([100,1.5]),at([-2,1.5])],'owner home'),walk(peer,[at([165,-1.5]),at([100,-1.5]),at([-2,-1.5])],'alice home')]);
    check((await self(page)).position[0]<edge&&(await self(peer)).position[0]<edge,'Both players walked back to the original District');
    check(await page.evaluate(()=>{const notices=window.__heightsNotices,heights=notices.indexOf('Entering Bayou Heights');
      return heights>=0&&notices.indexOf('Entering Bayou Market Commons',heights)>heights&&notices.lastIndexOf('Back in River Oaks District')>heights;}),'Returning names the Commons and then the District');
    for(const tab of [page,peer])await tab.waitForFunction(()=>!window.__riverBayouHeights().ready&&window.__riverBayouHeights().stream.residentBytes===0);
    check(true,'Walking home to the District releases the Heights presentation');
    await capture(page,'district-return');
    check(errors.length===0,`No page errors: ${errors.join('; ')}`);
    const refusals={owner:await page.evaluate(()=>window.__heightsRefusals),alice:await peer.evaluate(()=>window.__heightsRefusals)};
    return {checks,routes,reconnectMs,drift,views,refusals,scope:'Two rendered fixture clients, normal keyboard walking from original District arrivals over the Commons and the Lantern Footbridge; shared icehouse table game and reconnect in Heights; no physical-device or production acceptance'};
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
