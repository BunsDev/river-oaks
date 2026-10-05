async page => {
  const origin='http://127.0.0.1:5180',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const ready=tab=>tab.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true');
  page.on('pageerror',error=>errors.push(error.message));
  await page.context().addCookies([{name:'fixture_session',value:'guest',url:origin}]);
  await page.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(page);
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return Number(d.storePeopleTotal)>0&&d.storePeopleReady===d.storePeopleTotal;});
  check(await page.locator('#canvas-host').getAttribute('data-characters-ready')==='0','Multiplayer creates no street resident models');
  const options=await page.locator('#community-local option').evaluateAll(nodes=>nodes.map(node=>node.value));
  const indoor=await page.evaluate(()=>window.__riverMultiplayer().snapshot.locals.filter(local=>local.indoor).map(local=>local.id));
  check(options.length>0&&options.length===indoor.length&&options.every(id=>indoor.includes(id)),'The NPC directory contains only building residents');
  check(await page.evaluate(()=>window.__riverPeople().every(person=>person.id.startsWith('store-'))),'Rendered NPC identities belong to buildings');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  check(await page.locator('#nearby-people button').count()===0,'Outdoor players have no nearby NPC interactions');
  await page.locator('#community-local').selectOption(options[0]);
  await page.locator('#community-meet').click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});
  await page.waitForFunction(id=>{const local=window.__riverMultiplayer().snapshot.locals.find(local=>local.id===id);return window.__riverCarriage().pose.roomId===local.storeId&&window.__riverPeople().some(person=>person.id===id&&person.visible);},options[0]);
  check(true,'Building NPCs remain visible and conversational inside their room');
  const ownerContext=await page.context().browser().newContext();
  try {
    await ownerContext.addCookies([{name:'fixture_session',value:'owner',url:origin}]);
    const owner=await ownerContext.newPage();owner.on('pageerror',error=>errors.push(error.message));
    await owner.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(owner);
    await owner.waitForFunction(()=>document.querySelector('#canvas-host').dataset.carriageDriverReady==='true'&&window.__riverCarriage().visible);
    check(await owner.evaluate(()=>window.__riverCarriage().princeVisible&&!document.querySelector('#player-companion').hidden&&!document.querySelector('.vehicle-garage').hidden),'Jevica retains her companion, chauffeur, and vehicles in multiplayer');
    await owner.waitForFunction(()=>window.__riverMultiplayer().remotes?.some(player=>player.ready));
    check(true,'A real player is still rendered as a remote avatar');
  } finally {await ownerContext.close();}
  check(!errors.length,`No browser errors: ${errors.join('; ')}`);
  return {passed:true,checks};
}
