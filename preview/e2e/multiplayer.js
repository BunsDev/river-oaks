async page => {
  const origin='http://127.0.0.1:5180',checks=[],errors=[];
  page.setDefaultTimeout(45000);page.setDefaultNavigationTimeout(60000);
  const check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
  const ready=async p=>{await p.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host').dataset.playerReady==='true',null,{timeout:60000});};
  page.on('pageerror',error=>errors.push('Alice: '+error.message));
  await page.context().addCookies([{name:'fixture_session',value:'alice',url:origin}]);
  await page.setViewportSize({width:1440,height:1000});
  await page.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(page);
  const otherContext=await page.context().browser().newContext({viewport:{width:1440,height:1000}});
  await otherContext.addCookies([{name:'fixture_session',value:'bob',url:origin}]);
  const other=await otherContext.newPage();other.setDefaultTimeout(45000);other.setDefaultNavigationTimeout(60000);other.on('pageerror',error=>errors.push('Bob: '+error.message));
  try {
    await other.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(other);
    await page.waitForFunction(()=>window.__riverMultiplayer().remotes?.some(player=>player.id==='bob'&&player.ready),null,{timeout:60000});
    await other.waitForFunction(()=>window.__riverMultiplayer().remotes?.some(player=>player.id==='alice'&&player.ready),null,{timeout:60000});
    await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.carriageDriverReady==='true');
    check(await page.locator('.character-picker').isVisible(),'Shared appearance picker is available');
    check(await page.evaluate(()=>document.querySelector('.force-controls').hidden&&document.querySelector('.vehicle-garage').hidden&&!window.__riverCarriage().visible),'Unsynchronized carriage and Force controls remain hidden in shared play after assets load');
    check(await page.evaluate(()=>!window.__riverPeople().some(p=>p.id==='carriage-driver')&&!window.__riverMultiplayer().snapshot.locals.some(p=>p.id==='carriage-driver')),'Shared diagnostics and town exclude the solo coachman');
    await page.locator('#canvas-host').focus();await page.keyboard.press('KeyT');
    check(await page.evaluate(()=>!window.__riverForce().enabled),'Force shortcut cannot bypass shared-mode gating');
    check(await page.evaluate(()=>window.__riverMultiplayer().snapshot.players.length===2),'Two accounts share the roster and rendered avatars');
    await page.locator('input[name=player-character][value=vesper]').check();
    await page.locator('input[name=player-form][value=human]').check();
    await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true'&&document.querySelector('#canvas-host').dataset.playerAppearance==='woman-tailored');
    await other.waitForFunction(()=>window.__riverMultiplayer().remotes?.some(player=>player.id==='alice'&&player.ready&&player.appearance==='woman-tailored'));
    check(await other.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(player=>player.id==='alice').appearance==='woman-tailored'),'A peer sees the selected avatar');
    // Person and form chosen in quick succession reach the town as the final look.
    await page.locator('input[name=player-character][value=kai]').check();
    await page.locator('input[name=player-form][value=beast]').check();
    await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true'&&document.querySelector('#canvas-host').dataset.playerAppearance==='kai-formal-beast',null,{timeout:15000});
    check(!/wait a moment/i.test(await page.locator('#player-status').textContent()),'Quick person-then-form choices settle without a cooldown error');
    await page.locator('#player-beast-movement').click();
    await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.find(player=>player.id==='alice')?.movement==='beast');
    await other.waitForFunction(()=>window.__riverMultiplayer().remotes?.some(player=>player.id==='alice'&&player.ready&&player.appearance==='kai-formal-beast'&&player.movement==='beast'&&player.beastMotion>.9));
    check(true,'A peer sees beast movement on the shared beast form');
    await page.reload({waitUntil:'commit'});await ready(page);
    await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='kai-formal-beast');
    check(await page.locator('input[name=player-character][value=kai]').isChecked()&&await page.locator('input[name=player-form][value=beast]').isChecked(),'Appearance survives reconnect');
    check(await page.locator('#player-beast-movement').getAttribute('aria-pressed')==='true','Beast movement belongs to the account and survives reconnect');
    await page.bringToFront();
    const openPanel=page.getByRole('button',{name:'Explore River Oaks',exact:true});
    if(await openPanel.isVisible())await openPanel.click();
    check(await page.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(player=>player.id==='alice')?.canGrantWishes===true),'Alice fixture retains server-issued wish permission after reconnect');
    const targets=await page.evaluate(()=>{
      const locals=window.__riverMultiplayer().snapshot.locals.filter(local=>local.indoor&&!local.wish);
      const player=window.__riverMultiplayer().snapshot.players.find(player=>player.id==='alice');
      const nearest=[...locals].sort((a,b)=>Math.hypot(a.position[0]-player.position[0],a.position[1]-player.position[1])-Math.hypot(b.position[0]-player.position[0],b.position[1]-player.position[1]));
      const sparse=[...locals].sort((a,b)=>locals.filter(p=>Math.hypot(p.position[0]-b.position[0],p.position[1]-b.position[1])<9).length-locals.filter(p=>Math.hypot(p.position[0]-a.position[0],p.position[1]-a.position[1])<9).length);
      return [...new Set([...nearest.slice(0,3),...sparse].map(local=>local.id))];
    });
    let opened=false;
    for(const target of targets.slice(0,6)){
      await page.locator('#community-local').selectOption(target);
      await page.getByRole('button',{name:'Meet a local',exact:true}).click();
      opened=await page.waitForFunction(()=>document.querySelector('#community-dialogue')?.hidden===false,null,{timeout:6000}).then(()=>true,()=>false);
      if(opened)break;
      await page.waitForTimeout(1200);
    }
    check(opened,'A shared resident is reachable after a bounded retry');
    await page.locator('#wish-grant').waitFor({state:'visible'});
    const resident=await page.locator('#community-local').inputValue();
    await page.locator('#wish-choice').selectOption('dragon');await page.locator('#wish-grant').click();
    await page.waitForFunction(()=>document.querySelector('.wish-card').dataset.phase==='gift');
    await other.waitForFunction(id=>window.__riverMultiplayer().snapshot.locals.find(local=>local.id===id)?.wish?.kind==='dragon',resident);
    await page.waitForFunction(()=>document.querySelector('.wish-card')?.getAttribute('aria-busy')==='false');
    check(await page.locator('#wish-undo').evaluate(node=>node===document.activeElement),'Confirmed grant moves keyboard focus to undo');
    check(await other.evaluate(id=>window.__riverMultiplayer().snapshot.locals.find(local=>local.id===id).wish.ownerId==='alice',resident),'Second player sees server-owned dragon wish');
    await page.waitForFunction(()=>document.querySelector('.wish-card').dataset.phase==='trouble',null,{timeout:30000});
    await other.waitForFunction(()=>window.__riverMultiplayer().snapshot.wishes.trouble===1);
    check(await page.evaluate(()=>window.__riverWishes().some(person=>person.wish?.kind==='dragon'&&person.props.includes('Wish dragon'))),'Egg hatches into a visible dragon');
    check(await other.evaluate(()=>window.__riverMultiplayer().snapshot.wishes.affected>0),'The same wish disrupts town residents for both players');
    await page.locator('#wish-undo').click();
    await other.waitForFunction(id=>!window.__riverMultiplayer().snapshot.locals.find(local=>local.id===id).wish,resident);
    await page.waitForFunction(()=>document.querySelector('.wish-card')?.getAttribute('aria-busy')==='false');
    check(await page.locator('#wish-choice').evaluate(node=>node===document.activeElement),'Confirmed undo restores keyboard focus');
    await page.locator('#wish-choice').selectOption('invisibility');await page.locator('#wish-grant').click();
    await page.waitForFunction(()=>document.querySelector('.wish-card').dataset.phase==='trouble',null,{timeout:30000});
    check(await page.evaluate(()=>window.__riverWishes().some(person=>person.wish?.kind==='invisibility'&&person.skin===0&&person.clothes>0)),'Invisible resident keeps visible clothing in shared play');
    await other.reload({waitUntil:'commit'});await ready(other);
    await other.waitForFunction(id=>window.__riverMultiplayer().snapshot.locals.find(local=>local.id===id)?.wish?.kind==='invisibility',resident);
    check(true,'Reload rejoins the existing town and keeps its active wishes');
    await page.waitForFunction(id=>window.__riverMultiplayer().snapshot.locals.find(local=>local.id===id)?.wish?.kind==='invisibility',resident);
    if(await page.locator('#wish-undo').isHidden()) {
      await page.locator('#community-local').selectOption(resident);
      await page.getByRole('button',{name:'Meet a local',exact:true}).click();
      await page.locator('#wish-undo').waitFor({state:'visible',timeout:15000});
    }
    await page.locator('#wish-undo').click();
    await page.waitForFunction(()=>document.querySelector('.wish-card')?.getAttribute('aria-busy')==='false' && !document.querySelector('#wish-choice')?.disabled);
    await page.locator('#wish-choice').press('Escape');
    await page.locator('#community-dialogue').waitFor({state:'hidden'});
    // Resident travel can leave the player beside an indoor wall. Return to
    // the outdoor arrival before checking movement in the shared town.
    const placesToggle=page.locator('#panel-toggle');
    if(await placesToggle.getAttribute('aria-expanded')==='false')await placesToggle.click();
    await page.locator('[data-section=explore-section]').click();
    await page.locator('#places-list li[data-place-id="arrival"] button[aria-label^="Go to"]').click();
    await page.waitForFunction(() => document.querySelector('#places-status')?.textContent.includes("You're at Arrival"));
    const arrival=await page.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(p=>p.id==='alice').position);
    await other.waitForFunction(position=>{
      const player=window.__riverMultiplayer().snapshot.players.find(p=>p.id==='alice');
      return player && Math.hypot(player.position[0]-position[0],player.position[1]-position[1])<1.5;
    },arrival);
    const closePanel=page.getByRole('button',{name:'Close exploration panel',exact:true});
    if(await closePanel.isVisible())await closePanel.click();
    // Try each walking direction and require the peer to observe real travel.
    let walked=false;
    await page.bringToFront();await page.locator('#canvas-host').focus();
    for(const key of ['KeyS','KeyW','KeyA','KeyD']){
      const before=await other.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(p=>p.id==='alice').position);
      await page.keyboard.down(key);
      try { await page.waitForTimeout(1800); } finally { await page.keyboard.up(key); }
      walked=await other.waitForFunction(({id,before})=>{const p=window.__riverMultiplayer().snapshot.players.find(p=>p.id===id);return Math.hypot(p.position[0]-before[0],p.position[1]-before[1])>0.25;},{id:'alice',before},{timeout:5000}).then(()=>true,()=>false);
      if(walked)break;
    }
    check(walked,'Walking is validated and visible to the other player');
    await page.setViewportSize({width:390,height:844});
    check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Shared town has no mobile horizontal overflow');
    await page.screenshot({path:'output/playwright/multiplayer-mobile.png'});
    // Sign out through the same authenticated HTTP + socket lifecycle used by the client.
    await other.bringToFront();
    const showControls=other.getByRole('button',{name:'Explore River Oaks',exact:true});
    if(await showControls.isVisible())await showControls.click();
    await other.locator('#access-signout').click();
    await other.getByRole('link',{name:'Continue with GitHub'}).waitFor({state:'visible'});
    await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.length===1);
    check(await other.getByRole('link',{name:'Continue with GitHub'}).isVisible(),'Sign-out revokes play and returns to the sign-in gate');
    check(!errors.length,'No uncaught errors: '+errors.join('; '));
    return {passed:true,checks,errors,scope:'Two real browsers, test-only authenticated identities, real shared server; not live WorkOS or production hosting acceptance.'};
  } catch(error) {return {passed:false,checks,errors,failure:error.stack};} finally {await otherContext.close();}
}
