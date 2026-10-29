async page => {
  // Bayou Heights (bayou-heights-1, #586 continuation), return: two rendered clients walk from
  // their District arrivals over the Commons and the Lantern Footbridge into Heights, then home
  // again one at a time, and the District releases the Heights presentation. The outbound half
  // (icehouse game, reconnect, Nineteenth & Yale) is the bayou-heights journey (see heights-walk.js).
  const origin='http://127.0.0.1:5173';
  const { openHeights } = await import('./heights-walk.js');
  const heights=await openHeights(page,{origin,captures:'heights-return'});
  const { peer, self, walk, face, at, capture, check, checks, errors, routes, views, edge, EAST } = heights;
  try{
    await heights.enter();
    await capture(page,'footbridge-landing');
    // Home: back over the footbridge and the Commons to the District, one player at a time. Facing
    // west from Heights a client draws the District, the Commons and Heights at once, about seven
    // million triangles a second on the CPU; in CI both clients render on one four-core runner, and
    // one such view held still slows the other client's walk to a fifth of walking speed (see the
    // ledger, docs/superpowers/plans/2026-10-24-next-district-586.md). Whoever waits faces east.
    await face(page,EAST,'owner faces east at the landing');
    await walk(peer,[at([100,-1.5]),at([50,-1.5]),at([-2,-1.5])],'alice home');
    await face(peer,EAST,'alice faces east at home');
    await walk(page,[at([100,1.5]),at([50,1.5]),at([-2,1.5])],'owner home');
    check((await self(page)).position[0]<edge&&(await self(peer)).position[0]<edge,'Both players walked back to the original District');
    check(await page.evaluate(()=>{const notices=window.__heightsNotices,heights=notices.indexOf('Entering Bayou Heights');
      return heights>=0&&notices.indexOf('Entering Bayou Market Commons',heights)>heights&&notices.lastIndexOf('Back in River Oaks District')>heights;}),'Returning names the Commons and then the District');
    for(const tab of [page,peer])await tab.waitForFunction(()=>!window.__riverBayouHeights().ready&&window.__riverBayouHeights().stream.residentBytes===0);
    check(true,'Walking home to the District releases the Heights presentation');
    await capture(page,'district-return');
    check(errors.length===0,`No page errors: ${errors.join('; ')}`);
    return {checks,routes,views,refusals:await heights.refusals(),scope:'Two rendered fixture clients, normal keyboard walking from original District arrivals over the Commons and the Lantern Footbridge into Heights and home again; the icehouse game and reconnect are the bayou-heights journey; no physical-device or production acceptance'};
  }catch(error){
    throw await heights.failure(error);
  }finally{await heights.close();}
}
