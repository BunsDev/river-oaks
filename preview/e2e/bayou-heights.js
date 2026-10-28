async page => {
  // Bayou Heights (bayou-heights-1, #586 continuation), outbound: two rendered clients walk from
  // their District arrivals over the Commons and the Lantern Footbridge into Heights, play the
  // icehouse table through the board UI, reconnect there, and reach Nineteenth & Yale. The walk
  // home is the bayou-heights-return journey, in its own hosted shard (see heights-walk.js).
  const origin='http://127.0.0.1:5173';
  const { openHeights } = await import('./heights-walk.js');
  const heights=await openHeights(page,{origin,captures:'heights'});
  const { peer, self, walk, face, at, capture, check, checks, errors, routes, views, world, EAST } = heights;
  const { plazaSalonSeats } = await import('../src/plaza-salon-plan.js');
  try{
    await heights.enter();
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
    await Promise.all([walk(page,[at([203,-9]),at([201,1.5]),at([201,50]),at([201,96])],'owner green'),walk(peer,[at([199,-9]),at([209,-1.5]),at([209,50]),at([209,96])],'alice green')]);
    await capture(page,'green-bandstand');
    const before=await self(page),socketCount=await page.evaluate(()=>window.__heightsSockets.length),reconnectStart=Date.now();
    await page.evaluate(()=>window.__heightsSockets.at(-1).close());
    await page.waitForFunction(count=>window.__heightsSockets.length>count&&window.__heightsSockets.at(-1).readyState===WebSocket.OPEN&&window.__riverMultiplayer().connected,socketCount);
    const after=await self(page),drift=Math.hypot(...after.position.map((v,i)=>v-before.position[i]));
    check(after.id===before.id&&drift<.5,'Reconnect keeps identity and Heights position');
    const reconnectMs=Date.now()-reconnectStart;
    // Facing west from deep in Heights a client draws the District, the Commons and Heights at
    // once, about seven million triangles a second on the CPU. In CI both clients render on one
    // four-core runner, and one such view held still slows the other client's walk to a fifth of
    // walking speed (see the ledger, docs/superpowers/plans/2026-10-24-next-district-586.md).
    // A walker that overshoots its waypoint turns back west, so whoever waits faces east, the lighter view.
    await Promise.all([walk(page,[at([201,50]),at([201,1.5]),at([250,1.5]),at([300,1.5])],'owner nineteenth').then(()=>face(page,EAST,'owner faces east')),
      walk(peer,[at([209,50]),at([209,-1.5]),at([255,-1.5]),at([300,-1.5])],'alice nineteenth').then(()=>face(peer,EAST,'alice faces east'))]);
    await capture(page,'nineteenth-and-yale');
    check((await self(page)).position[0]>world.eastGardenCommons.heights.bounds[0]&&(await self(peer)).position[0]>world.eastGardenCommons.heights.bounds[0],'Both players reached Nineteenth & Yale inside Bayou Heights');
    check(errors.length===0,`No page errors: ${errors.join('; ')}`);
    return {checks,routes,reconnectMs,drift,views,refusals:await heights.refusals(),scope:'Two rendered fixture clients, normal keyboard walking from original District arrivals over the Commons and the Lantern Footbridge; shared icehouse table game and reconnect in Heights; the walk home is bayou-heights-return; no physical-device or production acceptance'};
  }catch(error){
    throw await heights.failure(error);
  }finally{await heights.close();}
}
