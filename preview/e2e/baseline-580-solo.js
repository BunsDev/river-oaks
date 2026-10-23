async page => {
  const {loadDistrictData}=await import('../../server/district-data.js');
  const {createResidentNavigation}=await import('../src/navigation.js');
  const {arrivalPedestrianRoute}=await import('../audit/baseline-580-route.js');
  const {plazaSalonSeats}=await import('../src/plaza-salon-plan.js');
  const revision='east-garden-commons-blockout-1',world=await loadDistrictData({districtRevision:revision});
  const nav=createResidentNavigation(world),edge=world.eastGardenCommons.edge,checks=[],routes=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{
    const Native=window.WebSocket;window.__soloSockets=[];
    window.WebSocket=class extends Native{constructor(...args){super(...args);if(new URL(args[0],location.href).pathname==='/multiplayer')window.__soloSockets.push(this);}};
  });
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.waitForFunction(revision=>window.__riverMultiplayer?.().connected&&window.__riverMultiplayer().snapshot?.districtRevision===revision&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',revision,{timeout:180000});
  await page.waitForFunction(()=>JSON.parse(document.querySelector('#viewport')?.dataset.assetProgress??'{}').done);
  const assets=JSON.parse(await page.locator('#viewport').getAttribute('data-asset-progress'));check(assets.failed===0,'Solo assets loaded without failure');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  if(await page.locator('.visit-tools').evaluate(node=>node.open))await page.locator('.visit-tools-toggle').click();
  const self=()=>page.evaluate(()=>{const town=window.__riverMultiplayer();return town.snapshot.players.find(p=>p.id===town.selfId);});
  const initial=await self(),timeOrigin=await page.evaluate(()=>performance.timeOrigin);
  check(await page.evaluate(()=>window.__riverMultiplayer().snapshot.players.length===1),'Exactly one player starts at the original arrival');
  const walk=async(points,label)=>{
    const started=Date.now(),start=(await self()).position,samples=[];
    for(const target of points){
      const deadline=Date.now()+180000;
      for(;;){
        const pose=await page.evaluate(()=>window.__riverCarriage().pose),dx=target[0]-pose.position[0],dz=-target[1]-pose.position[2],distance=Math.hypot(dx,dz);
        if(distance<.25)break;
        if(Date.now()>deadline)throw new Error(`${label} stalled: ${JSON.stringify({target,pose})}`);
        const heading=Math.atan2(-dx,-dz),difference=Math.atan2(Math.sin(heading-pose.yaw),Math.cos(heading-pose.yaw));
        if(Math.abs(difference)>.035){
          const box=await page.locator('#canvas-host').boundingBox(),x=box.x+box.width*.5,y=box.y+box.height*.4;
          const drag=Math.max(-box.width*.35,Math.min(box.width*.35,-difference/.003));
          await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+drag,y,{steps:3});await page.mouse.up();continue;
        }
        await page.locator('#canvas-host').focus();await page.keyboard.down('KeyW');
        await page.waitForTimeout(Math.min(450,Math.max(30,distance*400)));await page.keyboard.up('KeyW');
        samples.push((await self()).position);
      }
    }
    const target=points.at(-1);
    await page.waitForFunction(target=>{const t=window.__riverMultiplayer(),p=t.snapshot.players.find(p=>p.id===t.selfId);return Math.hypot(p.position[0]-target[0],p.position[1]-target[1])<.6;},target);
    routes.push({label,seconds:(Date.now()-started)/1000,start,end:(await self()).position,samples});console.log(`${label} reached`);
  };
  const gate=[-2685,-1334],approach=arrivalPedestrianRoute(nav,initial.position.slice(0,2),gate);
  check(Boolean(approach?.length),'Solo approach uses the existing sidewalk exit and normal pedestrian routing');
  await walk([...approach,[edge-1,-1335],[edge+80,-1335]],'solo outward at normal pace');
  check((await self()).position[0]>edge+70,'Solo player reached Commons by normal keyboard walking');
  const seat=plazaSalonSeats(world).find(s=>s.buildId==='bench:plaza-salon-chess-commons-0');
  await walk([[edge+90,-1325],seat.approach],'solo pavilion');
  await page.waitForFunction(()=>window.__riverSeatAndWater().interaction==='sit');
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyZ');
  await page.waitForFunction(id=>window.__riverSeatAndWater().seated===id,seat.id);
  await page.keyboard.press('KeyX');await page.locator('#table-game-panel[open]').waitFor();
  await page.screenshot({path:'output/playwright/baseline-580-solo-pavilion.png'});
  check(true,'Solo player can sit and open the existing table activity');
  await page.locator('#table-game-panel .table-game-close').click();await page.locator('#canvas-host').focus();await page.keyboard.press('KeyZ');
  await page.waitForFunction(()=>!window.__riverSeatAndWater().seated);
  await walk([[edge+90,-1325],[edge+80,-1335]],'solo plaza');
  const before=await self(),count=await page.evaluate(()=>window.__soloSockets.length),started=Date.now();
  await page.evaluate(()=>window.__soloSockets.at(-1).close());
  await page.waitForFunction(count=>window.__soloSockets.length>count&&window.__soloSockets.at(-1).readyState===WebSocket.OPEN&&window.__riverMultiplayer().connected,count);
  const after=await self(),reconnectMs=Date.now()-started;
  check(after.id===before.id&&Math.hypot(...after.position.map((v,i)=>v-before.position[i]))<.5,'Solo reconnect retains identity and Commons position');
  await walk([[edge-1,-1335],gate,...[...approach].reverse(),initial.position.slice(0,2)],'solo return at normal pace');
  const final=await self();
  check(final.id===initial.id&&JSON.stringify(final.appearance)===JSON.stringify(initial.appearance),'Solo round trip preserves identity and appearance');
  check(await page.evaluate(()=>window.__riverMultiplayer().snapshot.players.length===1),'Solo journey remains a one-player session');
  check(await page.evaluate(()=>performance.timeOrigin)===timeOrigin,'Solo round trip preserves the document without reload');
  check(errors.length===0,`No solo page errors: ${errors.join('; ')}`);
  return {checks,routes,reconnectMs,scope:'One real local fixture client; normal 1.65 m/s walking without Shift, actual seating/table UI, reconnect and return. No target-device, production or human accessibility acceptance.'};
}
