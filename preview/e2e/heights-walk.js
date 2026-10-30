// Shared setup for the two Bayou Heights journeys (bayou-heights and bayou-heights-return):
// two rendered fixture clients, keyboard walking from their District arrivals over the Commons
// and the Lantern Footbridge into Heights. One journey used to do all of it and walk home, and
// ran 14-19.5 minutes on the hosted runner against a 20-minute shard timeout; split in two, each
// shard walks in once and does half of the rest. Not a journey itself: the runner selects only
// files that begin with `async`.
//
// The journey passes its own origin: the runner rewrites the fixture origin in the journey's
// source, not in modules it imports.
export async function openHeights(page, { origin, captures }) {
  const traceInput = process.env.CI === 'true';
  const { installInputAuthorityTrace, captureInputAuthorityEvidence } = await import('./input-authority-trace.js');
  const { loadDistrictData } = await import('../../server/district-data.js');
  const { createResidentNavigation } = await import('../src/navigation.js');
  const revision='bayou-heights-1',world=await loadDistrictData({districtRevision:revision}),layout=world.eastGardenCommons;
  // Players may cross streets; the arrival spawn is on a road, which the pedestrian-only resident grid refuses.
  const nav=createResidentNavigation(world,{allowRoads:true}),checks=[],routes=[];
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
    await tab.goto(`${origin}/?motion-debug=1`);
    await tab.waitForFunction(revision=>window.__riverMultiplayer?.().connected
      && window.__riverMultiplayer().snapshot?.districtRevision===revision
      && document.querySelector('#canvas-host')?.dataset.playerReady==='true'
      // The avatar can be ready while the district is still building; checks below read the composed world.
      && document.querySelector('#loading')?.hidden===true,revision,{timeout:180000});
    // The walking HUD creates its notice after the world loads, so observe it once the player is ready.
    await tab.evaluate(()=>{const notice=document.querySelector('#walking-notice');if(!notice)throw new Error('The walking notice is missing');window.__heightsNotices=[];
      new MutationObserver(()=>{if(!notice.hidden&&notice.textContent)window.__heightsNotices.push(notice.textContent);}).observe(notice,{childList:true,characterData:true,subtree:true,attributes:true});});
    if(await tab.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await tab.locator('#panel-toggle').click();
    if(await tab.locator('.visit-tools').evaluate(node=>node.open))await tab.locator('.visit-tools-toggle').click();
  };
  const EAST=-Math.PI/2;
  // Each waypoint has 120 s (walk-driver.js), as in the Commons journey, whose longest leg is 73.5 m.
  // Long straight legs here are split to that length, so the stall deadline asks the same pace of a CPU-rendered walker.
  const { createWalkDriver } = await import('./walk-driver.js');
  const { walk, face } = createWalkDriver({self,routes,refusals:'__heightsRefusals'});
  const edge=layout.edge,west=layout.heights.bounds[0];
  const at=([x,y])=>[edge+x,-1335+y];
  // Pedestrian captures at walking eye height, with the scene's draw statistics.
  const views=[],capture=async(tab,name)=>{await tab.waitForTimeout(600);await tab.screenshot({path:`output/playwright/${captures}-${name}.png`});
    views.push({name,pose:(await self(tab)).position,scene:await tab.evaluate(()=>window.__riverBayouHeights?.().scene??null)});};

  // Both clients from their District arrivals to the footbridge's Heights landing, with the
  // streaming, status and notice checks on the way; ends with both players inside Heights.
  const enter=async()=>{
    await Promise.all([ready(page),ready(peer)]);
    const starts=await Promise.all([self(page),self(peer)]);
    check(starts.every(p=>p.position[0]<edge),'Both players start in the original District');
    check(await page.evaluate(()=>window.__riverBayouHeights?.()?.revision)==='bayou-heights-1','The client composed Bayou Heights for the served revision');
    await capture(page,'district-arrival');
    const gate=[-2685,-1334];
    const approach=starts.map(player=>nav.route(player.position.slice(0,2),gate));
    check(approach.every(path=>path?.length),'Existing walking routes connect both arrivals to the eastern gateway');
    await Promise.all([walk(page,approach[0],'owner approach'),walk(peer,approach[1],'alice approach')]);
    // Market Street, past the Bayou Lantern on either side, and over the footbridge.
    await Promise.all([walk(page,[at([-1,1.5]),at([50,1.5]),at([100,1.5])],'owner market street'),walk(peer,[at([-1,-1.5]),at([50,-1.5]),at([100,-1.5])],'alice market street')]);
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
    // Only notices since entering Heights: a walker that overshoots the waypoint just short of
    // the District edge steps into the Commons and back, and is rightly told so on the way.
    check(await page.evaluate(()=>{const notices=window.__heightsNotices;
      return document.querySelector('#lantern-walk-status').hidden&&!notices.slice(notices.indexOf('Entering Bayou Heights')).includes('Back in River Oaks District');}),
      'Bayou Heights hides the Commons Lantern Walk status without announcing the District');
    const peerId=(await self(peer)).id;
    await page.waitForFunction(([id,west])=>window.__riverMultiplayer().snapshot.players.some(p=>p.id===id&&p.position[0]>west),[peerId,west]);
  };
  // The town's last refusals and corrections seen by each client, for the journey's report.
  const refusals=async()=>({owner:await page.evaluate(()=>window.__heightsRefusals),alice:await peer.evaluate(()=>window.__heightsRefusals)});
  // In CI a failure carries the input-authority evidence of both pages.
  const failure=async error=>{
    if(!traceInput)return error;
    const failed=error instanceof Error?error:new Error(String(error));
    failed.journeyEvidence={schemaVersion:1,scope:'CI-only normal-journey observations; no keyboard-handler acceptance inferred',
      checks,routes,players:await captureInputAuthorityEvidence([['owner',page],['peer',peer]])};
    return failed;
  };
  const close=()=>peerContext.close();
  return {peer,self,walk,face,at,capture,check,checks,errors,routes,views,world,layout,edge,west,EAST,enter,refusals,failure,close};
}
