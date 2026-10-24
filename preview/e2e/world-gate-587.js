// MVP gate for the connected-world expansion (#587): keyboard-only travel from the
// original District arrival into Bayou Market Commons and back, collision probes,
// two-player synchronization, reconnect, a failed world load with recovery, a
// repeated world rebuild for renderer resource cleanup, and fixed-view captures.
async page => {
  const { loadDistrictData } = await import('../../server/district-data.js');
  const { createResidentNavigation } = await import('../src/navigation.js');
  const { commonsAllows } = await import('../../shared/east-garden-commons-layout.js');
  const revision='east-garden-commons-market-1',world=await loadDistrictData({districtRevision:revision}),layout=world.eastGardenCommons;
  // Players may cross roads; spread spawns can land on one, which a pedestrian-only plan cannot leave.
  const nav=createResidentNavigation(world,{allowRoads:true}),origin='http://127.0.0.1:5173',shots='output/playwright';
  const checks=[],routes=[],views=[],loops=[],rebuilds=[],observations={};
  const check=(ok,label,detail)=>{if(!ok)throw new Error(`${label}${detail===undefined?'':`: ${JSON.stringify(detail)}`}`);checks.push(label);console.log(label);};
  const errors=[],watch=tab=>tab.on('pageerror',e=>errors.push(e.message));watch(page);
  const peerContext=await page.context().browser().newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  await peerContext.addCookies([{name:'fixture_session',value:'alice',url:origin}]);
  const peer=await peerContext.newPage();peer.setDefaultTimeout(120000);watch(peer);
  const edge=layout.edge,centre=edge+80,north=-1335,gate=[-2685,-1334];
  const self=tab=>tab.evaluate(()=>{const town=window.__riverMultiplayer();return town.snapshot.players.find(p=>p.id===town.selfId);});
  const pose=tab=>tab.evaluate(()=>window.__riverCarriage().pose);
  const graphics=tab=>tab.evaluate(()=>{const g=window.__riverRenderAudit.graphics();return{memory:g.memory,calls:g.render.calls,triangles:g.render.triangles,heap:performance.memory?.usedJSHeapSize??null};});
  const settle=tab=>tab.waitForTimeout(1500);
  const ready=async(tab,{failFirstWorldData=false}={})=>{
    await tab.emulateMedia({reducedMotion:'reduce'});
    await tab.addInitScript(()=>{
      localStorage.setItem('river-oaks-graphics','sharp');
      // What the polite live region says, as a screen reader would hear it.
      window.__gateNotices=[];
      new MutationObserver(()=>{const n=document.querySelector('#walking-notice');if(n&&!n.hidden&&n.textContent&&window.__gateNotices.at(-1)!==n.textContent)window.__gateNotices.push(n.textContent);}).observe(document,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['hidden']});
      const Original=window.WebSocket;window.__gateSockets=[];
      window.WebSocket=class extends Original{constructor(...args){super(...args);if(new URL(args[0],location.href).pathname==='/multiplayer')window.__gateSockets.push(this);}};
    });
    let failed=false;
    if(failFirstWorldData)await tab.route('**/api/world-data**',route=>{if(failed)return route.continue();failed=true;return route.abort('connectionreset');});
    await tab.goto(`${origin}/?motion-debug=1&render-audit=1`);
    return ()=>failed;
  };
  const arrived=tab=>tab.waitForFunction(revision=>window.__riverMultiplayer?.().connected
    && window.__riverMultiplayer().snapshot?.districtRevision===revision
    && document.querySelector('#canvas-host')?.dataset.playerReady==='true'
    && JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress??'{}').done,revision,{timeout:180000});
  const closePanels=async tab=>{
    if(await tab.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await tab.locator('#panel-toggle').click();
    if(await tab.locator('.visit-tools').evaluate(node=>node.open))await tab.locator('.visit-tools-toggle').click();
  };
  // Keyboard only: arrow keys turn, W walks, Shift walks briskly. No pointer steering.
  let turnSign=0;
  const walk=async(tab,points,label)=>{
    const started=Date.now();
    for(const target of points){
      const deadline=Date.now()+150000;
      for(;;){
        const p=await pose(tab),dx=target[0]-p.position[0],dz=-target[1]-p.position[2],distance=Math.hypot(dx,dz);
        if(distance<.15)break;
        if(Date.now()>deadline)throw new Error(`${label}: stalled ${JSON.stringify({target,pose:p})}`);
        const heading=Math.atan2(-dx,-dz),difference=Math.atan2(Math.sin(heading-p.yaw),Math.cos(heading-p.yaw));
        await tab.locator('#canvas-host').focus();
        if(Math.abs(difference)>.05){
          const key=(turnSign||1)*difference>0?'ArrowLeft':'ArrowRight';
          await tab.keyboard.down(key);await tab.waitForTimeout(Math.min(260,Math.max(25,Math.abs(difference)*300)));await tab.keyboard.up(key);
          if(!turnSign){const after=await pose(tab),moved=Math.atan2(Math.sin(after.yaw-p.yaw),Math.cos(after.yaw-p.yaw));if(Math.abs(moved)>1e-3)turnSign=Math.sign(moved)*(key==='ArrowLeft'?1:-1);}
          continue;
        }
        const fast=distance>2;
        if(fast)await tab.keyboard.down('ShiftLeft');
        await tab.keyboard.down('KeyW');
        await tab.waitForTimeout(Math.min(450,Math.max(30,distance*(fast?110:230))));
        await tab.keyboard.up('KeyW');if(fast)await tab.keyboard.up('ShiftLeft');
      }
    }
    const target=points.at(-1);
    await tab.waitForFunction(target=>{const town=window.__riverMultiplayer(),p=town.snapshot.players.find(p=>p.id===town.selfId);return Math.hypot(p.position[0]-target[0],p.position[1]-target[1])<.7;},target,{timeout:10000});
    const seconds=(Date.now()-started)/1000;routes.push({label,seconds});console.log(`${label} reached in ${seconds}s`);
  };
  // Hold W toward a target that should stop the player; return the server pose afterwards.
  const push=async(tab,heading,ms)=>{
    for(let i=0;i<40;i++){
      const p=await pose(tab),difference=Math.atan2(Math.sin(heading-p.yaw),Math.cos(heading-p.yaw));
      if(Math.abs(difference)<.04)break;
      const key=(turnSign||1)*difference>0?'ArrowLeft':'ArrowRight';
      await tab.keyboard.down(key);await tab.waitForTimeout(Math.min(260,Math.max(25,Math.abs(difference)*300)));await tab.keyboard.up(key);
    }
    await tab.keyboard.down('KeyW');await tab.waitForTimeout(ms);await tab.keyboard.up('KeyW');
    await tab.waitForTimeout(600);
    // Client poses are Three.js east/up/-north; report both in east/north metres.
    const client=(await pose(tab)).position;
    return {client:[client[0],-client[2]],server:(await self(tab)).position.slice(0,2)};
  };
  const capture=async(tab,name,camera)=>{
    await tab.evaluate(camera=>window.__riverRenderAudit.view(camera),camera);
    await tab.waitForTimeout(1200);
    const g=await graphics(tab),path=`${shots}/world-gate-587-${name}.png`;
    await tab.screenshot({path});
    await tab.evaluate(()=>window.__riverRenderAudit.release());
    views.push({name,camera,path,...g});
  };
  try{
    // Recovery 1: the owner's first world manifest request fails. The client falls back to the
    // default District, the first socket snapshot names the served revision, and it reloads once.
    const ownerFailed=await ready(page,{failFirstWorldData:true});
    await ready(peer);
    await Promise.all([arrived(page),arrived(peer)]);
    const navigations=await page.evaluate(()=>performance.getEntriesByType('navigation')[0]?.type);
    check(ownerFailed()&&navigations==='reload','A failed world manifest self-heals onto the served Commons revision',{navigations});
    // Recovery 2: a District data file fails during a rebuild; the accessible error offers reload.
    let failOnce=true;
    await page.route('**/data/district-vegetation.json',route=>{if(!failOnce)return route.continue();failOnce=false;return route.abort('connectionreset');});
    if(await page.locator('#panel-toggle').getAttribute('aria-expanded')!=='true'){await page.locator('#panel-toggle').focus();await page.keyboard.press('Enter');}
    // Keyboard reachability of the reload control is recorded, then the DOM click keeps the journey going.
    await page.locator('#reload').focus().catch(()=>{});
    observations.reloadKeyboard=await page.evaluate(()=>{const b=document.querySelector('#reload'),panel=document.querySelector('#control-panel'),r=b.getBoundingClientRect();
      return{focused:document.activeElement===b,visible:r.width>0&&r.height>0&&getComputedStyle(b).visibility!=='hidden',panelExpanded:document.querySelector('#panel-toggle')?.getAttribute('aria-expanded'),panelDisplay:getComputedStyle(panel).display,panelInert:panel.inert,bodyClass:document.body.className};});
    console.log('reload keyboard reachability',JSON.stringify(observations.reloadKeyboard));
    if(observations.reloadKeyboard.focused)await page.keyboard.press('Enter');else await page.evaluate(()=>document.querySelector('#reload').click());
    await page.locator('#loading.error').waitFor({timeout:60000});
    const failure=await page.locator('#loading').evaluate(node=>({role:node.getAttribute('role'),text:node.textContent.trim().replace(/\s+/g,' ')}));
    check(!failOnce&&failure.role==='status'&&/reload/i.test(failure.text),'A failed District data load announces itself and offers reload',failure);
    // The error panel's own reload takes focus, so a walking keyboard player can recover.
    observations.reloadAfterError=await page.evaluate(()=>({focused:document.activeElement?.className??null,report:!document.querySelector('.loading-report').hidden}));
    check(observations.reloadAfterError.focused==='loading-retry','A keyboard player can reload from the error, which takes focus',observations.reloadAfterError);
    await page.keyboard.press('Enter');
    await page.waitForFunction(()=>!document.querySelector('#loading.error')&&!document.querySelector('#reload').disabled,null,{timeout:120000});
    await arrived(page);
    check(true,'Reload recovers the Commons revision after the failed load');
    for(const tab of [page,peer]){
      const assets=JSON.parse(await tab.locator('#viewport').getAttribute('data-asset-progress'));
      check(assets.failed===0,'Every scene asset finished loading',assets);
    }
    await Promise.all([closePanels(page),closePanels(peer)]);

    // Accessible names on the keyboard/touch movement controls and focusable scene.
    const controls=await page.evaluate(()=>[...document.querySelectorAll('#walking-movement button, .walking-console > button')].map(b=>({id:b.id||b.dataset.walkKey,name:(b.getAttribute('aria-label')||b.textContent).trim()})));
    check(controls.length>0&&controls.every(c=>c.name.length>0),'Movement and interaction controls have accessible names',controls.filter(c=>!c.name));
    check(await page.locator('#canvas-host').evaluate(n=>n.tabIndex>=0),'The scene is keyboard focusable');

    const starts=await Promise.all([self(page),self(peer)]);
    check(starts.every(p=>p.position[0]<edge),'Both players arrive in the original District',starts.map(p=>p.position));
    const [x,y,h]=world.walkSpawn??starts[0].position;
    await capture(page,'district-arrival',{position:[x,h+2.4,-y+5],target:[x,h+1.4,-y-12],fov:55});
    const approach=starts.map(p=>nav.route(p.position.slice(0,2),gate));
    check(approach.every(path=>path?.length),'Walkable routes connect both arrivals to the eastern gateway');
    await Promise.all([walk(page,approach[0],'owner approach'),walk(peer,approach[1],'alice approach')]);
    observations.placeAtGateway=await page.locator('#walking-place').textContent();
    await walk(page,[[edge-1,north+1],[edge+20,north+1]],'owner to Market notices');
    const originalViewport=page.viewportSize();
    for(const viewport of [originalViewport,{width:390,height:844}]){
      await page.setViewportSize(viewport);
      await page.locator('.spatial-stream-status:not([hidden])').waitFor();
      await page.locator('#lantern-walk-status:not([hidden])').waitFor();
      const separated=await page.evaluate(()=>{
        const route=document.querySelector('.spatial-stream-status').getBoundingClientRect(),activity=document.querySelector('#lantern-walk-status').getBoundingClientRect();
        return route.bottom<=activity.top&&route.left>=0&&route.right<=innerWidth&&activity.left>=0&&activity.right<=innerWidth;
      });
      check(separated,`Route and Lantern Walk notices remain separate at ${viewport.width}px`);
      await page.screenshot({path:`${shots}/world-gate-587-notices-${viewport.width}.png`});
    }
    await page.setViewportSize(originalViewport);
    await Promise.all([walk(page,[[centre,north+1]],'owner outward'),walk(peer,[[edge-1,north-1],[centre,north-1]],'alice outward')]);
    check((await self(page)).position[0]>edge+60&&(await self(peer)).position[0]>edge+60,'Both clients reached the Commons plaza by keyboard only');
    observations.placeInCommons=await page.locator('#walking-place').textContent();
    check(/Bayou Market Commons/.test(observations.placeInCommons),'The walking HUD names the Commons for keyboard and screen-reader players',observations.placeInCommons);
    const peerId=(await self(peer)).id,ownerId=(await self(page)).id;
    const sync=async label=>{
      const [o,a]=await Promise.all([self(page),self(peer)]);
      const seen=await Promise.all([peer.evaluate(id=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===id)?.position,ownerId),page.evaluate(id=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===id)?.position,peerId)]);
      const error=[Math.hypot(seen[0][0]-o.position[0],seen[0][1]-o.position[1]),Math.hypot(seen[1][0]-a.position[0],seen[1][1]-a.position[1])];
      check(error.every(e=>e<1),`${label}: each client sees the other within 1 m of its server pose`,error);
      return error;
    };
    observations.syncInCommons=await sync('Commons arrival');
    await capture(page,'commons-gateway',{position:[edge-6,world.eastGardenCommons.ground+1.7,-north],target:[centre,world.eastGardenCommons.ground+1.2,-north],fov:55});
    await capture(page,'commons-plaza',{position:[centre-30,world.eastGardenCommons.ground+12,-(north-30)],target:[centre+10,world.eastGardenCommons.ground,-(north+10)],fov:55});
    await capture(page,'commons-pavilion',{position:[centre+13,world.eastGardenCommons.ground+1.7,-(north+8)],target:[centre+13,world.eastGardenCommons.ground+1.5,-(north+20)],fov:55});

    // Collision: a pavilion post, the rain garden edge and the empty reserve beyond the plaza.
    const post=layout.solids.find(s=>s.id.endsWith('/post-0')),postCentre=[(post.rect[0]+post.rect[2])/2,(post.rect[1]+post.rect[3])/2];
    await walk(page,[[postCentre[0],postCentre[1]-3]],'owner to post');
    // Headings: 0 walks north, -π/2 east, π south.
    const postHit=await push(page,0,2500);
    const postGap=Math.min(...[postHit.client,postHit.server].map(p=>Math.hypot(p[0]-postCentre[0],p[1]-postCentre[1])));
    check(postGap>=.25+.3,'Walking into a pavilion post is stopped outside it (client and server)',{postGap,postHit});
    const garden=layout.solids.find(s=>s.id.endsWith('/rain-garden'));
    await walk(page,[[centre,north-21]],'owner beside rain garden');
    const gardenHit=await push(page,-Math.PI/2,2500);
    check([gardenHit.client,gardenHit.server].every(p=>p[0]<garden.rect[0]),'The rain garden blocks walking through it',gardenHit);
    await walk(page,[[centre,north-37]],'owner to south plaza');
    const reserveHit=await push(page,Math.PI,4000);
    check([reserveHit.client,reserveHit.server].every(p=>commonsAllows(layout,p[0],p[1],.3)&&p[1]>layout.surfaces[1].rect[1]-.05),'The plaza edge keeps players out of the empty reserve',reserveHit);
    // The Market tree row lies west of centre; leave clearance for keyboard steering.
    await walk(page,[[centre+1,north-30],[centre+1,north+1],[centre,north+1]],'owner back to centre');

    // Reconnect while in the Commons.
    const before=await self(page),socketCount=await page.evaluate(()=>window.__gateSockets.length),reconnectStart=Date.now();
    await page.evaluate(()=>window.__gateSockets.at(-1).close());
    await page.waitForFunction(count=>window.__gateSockets.length>count&&window.__gateSockets.at(-1).readyState===WebSocket.OPEN&&window.__riverMultiplayer().connected,socketCount);
    observations.reconnectMs=Date.now()-reconnectStart;
    const after=await self(page),drift=Math.hypot(...after.position.map((v,i)=>v-before.position[i]));
    check(after.id===before.id&&drift<.5,'Reconnect keeps identity and Commons position',{drift});
    await peer.waitForFunction(id=>window.__riverMultiplayer().snapshot.players.some(p=>p.id===id&&p.position[0]>-2600),ownerId);
    observations.syncAfterReconnect=await sync('After reconnect');

    // Walking loops across the seam: renderer resources must not grow with travel.
    for(let i=0;i<5;i++){
      const loopStart=Date.now();
      await walk(page,[[edge-6,north+1]],`loop ${i+1} west`);
      await walk(page,[[centre,north+1]],`loop ${i+1} east`);
      await settle(page);
      loops.push({loop:i+1,seconds:(Date.now()-loopStart)/1000,...await graphics(page)});
    }
    const loopGrowth={geometries:loops.at(-1).memory.geometries-loops[0].memory.geometries,textures:loops.at(-1).memory.textures-loops[0].memory.textures};
    check(loopGrowth.geometries<=2&&loopGrowth.textures<=2,'Five seam crossings leave renderer geometries/textures stable',{loopGrowth,loops:loops.map(l=>l.memory)});

    // Return home on foot, then rebuild the world repeatedly through the normal reload control.
    await Promise.all([walk(page,[[edge-1,north+1],gate],'owner return'),walk(peer,[[edge-1,north-1],[-2685,-1336]],'alice return')]);
    await Promise.all([walk(page,nav.route((await self(page)).position.slice(0,2),starts[0].position.slice(0,2)),'owner home'),walk(peer,nav.route((await self(peer)).position.slice(0,2),starts[1].position.slice(0,2)),'alice home')]);
    check((await self(page)).position[0]<edge&&(await self(peer)).position[0]<edge,'Both players returned to the District on foot');
    observations.placeAtHome=await page.locator('#walking-place').textContent();
    observations.notices=await page.evaluate(()=>window.__gateNotices);
    const heard=observations.notices.filter(text=>/Entering Bayou Market Commons|Back in River Oaks District/.test(text));
    check(heard.filter(t=>t.startsWith('Entering')).length>=6&&heard.filter(t=>t.startsWith('Back')).length>=6,'The live region announces every crossing into and out of the Commons',heard);
    observations.syncAtHome=await sync('Back home');
    await capture(page,'district-return',{position:[x,h+2.4,-y+5],target:[x,h+1.4,-y-12],fov:55});
    for(let i=0;i<20;i++){
      await page.evaluate(()=>{document.querySelector('#reload').click();});
      await page.waitForFunction(()=>!document.querySelector('#reload').disabled&&document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress??'{}').done,null,{timeout:120000});
      await settle(page);
      rebuilds.push({rebuild:i+1,...await graphics(page)});
    }
    const rebuildGrowth={geometries:rebuilds.at(-1).memory.geometries-rebuilds[1].memory.geometries,textures:rebuilds.at(-1).memory.textures-rebuilds[1].memory.textures};
    check(rebuildGrowth.geometries<=2&&rebuildGrowth.textures<=2,'Twenty world rebuilds release their renderer geometries and textures',{rebuildGrowth,rebuilds:rebuilds.map(r=>r.memory)});
    check(errors.length===0,'No page errors',errors);
    return {checks,routes,views,loops,rebuilds,observations,
      scope:'Two rendered fixture clients on one host, keyboard-only walking from original District arrivals into the Commons blockout and back; in-memory authority; no physical-device, production or human accessibility acceptance'};
  }finally{await peerContext.close();}
}
