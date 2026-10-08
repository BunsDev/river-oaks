async page=>{
  const origin='http://127.0.0.1:5173',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/?motion-debug=1`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('.world-portal-form').waitFor({state:'visible'});
  await page.locator('.world-portal-form input[name=title]').fill('Moon Garden');
  await page.locator('.world-portal-form input[name=id]').fill('moon-garden');
  await page.locator('.world-portal-form textarea[name=description]').fill('A quiet place to meet.');
  await page.locator('.world-portal-design').click();
  await page.locator('.region-editor').waitFor({state:'visible'});
  const map=page.locator('.region-editor-map');
  const clickMap=async(x,y)=>{const box=await map.boundingBox();await map.click({position:{x:box.width*x,y:box.height*y}});};
  await page.locator('.region-editor-tools button[data-tool=building]').click();
  await clickMap(.225,.225);
  await page.locator('.region-editor-fields label').filter({hasText:'Kind'}).locator('select').selectOption('retail');
  await page.locator('.region-editor-fields label').filter({hasText:'Walk-in space'}).locator('select').selectOption('art');
  await page.locator('.region-editor-fields label').filter({hasText:'Interior name'}).locator('input').fill('Moon Gallery');
  await page.locator('.region-editor-fields label').filter({hasText:'Interior name'}).locator('input').press('Tab');
  await clickMap(.75,.3);
  await page.locator('.region-editor-fields label').filter({hasText:'Walk-in space'}).locator('select').selectOption('home');
  await page.locator('.region-editor-fields label').filter({hasText:'Home access'}).locator('select').selectOption('owner');
  await page.locator('.region-editor-fields label').filter({hasText:'Interior name'}).locator('input').fill('Moon House');
  await page.locator('.region-editor-fields label').filter({hasText:'Interior name'}).locator('input').press('Tab');
  await page.locator('.region-editor-tools button[data-tool=tree]').click();
  await page.locator('.region-editor [data-coordinate=east]').fill('44.8');
  await page.locator('.region-editor [data-coordinate=north]').fill('-32');
  await page.locator('.region-editor [data-action=place-coordinate]').click();
  await page.locator('.region-editor-tools button[data-tool=place]').click();
  await clickMap(.25,.733);
  await page.locator('.region-editor-chooser').selectOption('places:place-1');
  await page.locator('.region-editor-fields label').filter({hasText:'Name'}).locator('input').fill('Moon Arch');
  await page.locator('.region-editor-fields label').filter({hasText:'Name'}).locator('input').press('Tab');
  await page.locator('.region-editor-tools button[data-tool=terrain]').click();
  await clickMap(.392,.35);
  await page.locator('.region-editor-fields label').filter({hasText:'Height (m)'}).locator('input').fill('2');
  await page.locator('.region-editor-fields label').filter({hasText:'Height (m)'}).locator('input').press('Tab');
  await page.locator('.region-editor-tools button[data-tool=road]').click();
  await clickMap(.183,.533);
  await clickMap(.317,.533);
  await page.locator('.region-editor-tools button[data-tool=parcel]').click();
  await clickMap(.1,.1);
  await clickMap(.37,.35);
  await page.locator('.region-editor-fields label').filter({hasText:'Name'}).locator('input').fill('Gallery Lot');
  await page.locator('.region-editor-fields label').filter({hasText:'Name'}).locator('input').press('Tab');
  const adminId=await page.evaluate(()=>window.__riverMultiplayer().selfId);
  await page.waitForFunction(id=>[...document.querySelectorAll('.region-editor-fields label')].some(label=>label.textContent.includes('Owner')
    &&[...label.querySelectorAll('option')].some(option=>option.value===id)),adminId);
  await page.locator('.region-editor-fields label').filter({hasText:'Owner'}).locator('select').selectOption(adminId);
  await page.screenshot({path:'output/playwright/region-editor.png'});
  await page.locator('.region-editor [data-action=done]').click();
  check((await page.locator('.world-portal-region-source').textContent()).includes('ready to publish'),'The editor provides a publishable region draft');
  const localDraft=await page.evaluate(()=>JSON.parse(localStorage.getItem('river-oaks-creator-region-draft-v1')));
  check(localDraft.buildings.length===2&&localDraft.parcels?.[0]?.owner_id===adminId,'Buildings and the assigned parcel survive in the local draft');
  await page.locator('.world-portal-form button[type=submit]').click();
  await page.locator('.world-portal-list a').filter({hasText:'Moon Garden'}).waitFor({state:'visible',timeout:15000}).catch(async()=>{
    throw new Error(`Publish result: ${await page.locator('.world-portal-status').textContent()}; links: ${await page.locator('.world-portal-list a').allTextContents()}`);
  });
  check((await page.locator('.world-portal-status').textContent()).includes('published'),'Jevica publishes from the world directory');
  await page.screenshot({path:'output/playwright/shared-world-publish.png'});
  const visitUrl=new URL(await page.locator('.world-portal-list a').filter({hasText:'Moon Garden'}).getAttribute('href'),page.url());
  check(visitUrl.searchParams.get('world')==='moon-garden','The directory gives the new world a shareable URL');
  visitUrl.searchParams.set('motion-debug','1');
  await page.goto(visitUrl.href,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&window.__riverMultiplayer?.().snapshot?.worldId==='moon-garden');
  await page.waitForFunction(()=>document.querySelector('#view-name')?.textContent==='Moon Garden');
  await page.waitForFunction(()=>document.querySelector('#terrain-state')?.textContent==='Creator-authored terrain');
  await page.waitForFunction(()=>document.querySelector('.walking-title span')?.textContent==='Moon Garden');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('.world-portal-design').waitFor({state:'visible'});
  await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedWorldPlace=text;}}}));
  await page.locator('#places-list li').filter({hasText:'Moon Arch'}).locator('button[aria-label^="Copy a link"]').click();
  const sharedPlace=new URL(await page.evaluate(()=>window.__copiedWorldPlace));
  check(sharedPlace.searchParams.get('world')==='moon-garden'&&!sharedPlace.searchParams.has('play')
    &&sharedPlace.searchParams.get('place')?.startsWith('spot:'),'A published world place link keeps its world and shared play mode');
  check((await page.locator('.world-portal-design').textContent())==='Edit region draft','The saved draft is available after navigating to the published world');
  const authored=await (await page.request.get(`${origin}/api/world-data?world=moon-garden`)).json();
  check(authored.world.buildings.length===2&&authored.world.trees.length===1&&authored.world.communityLocations.some(place=>place.name==='Moon Arch')&&authored.world.roads.length===2&&authored.world.terrain.heights_m.includes(2),'The editor submits terrain, roads, buildings, trees, and places to the shared world');
  check(authored.world.parcels.length===1&&authored.world.parcels[0].ownerId===adminId&&authored.world.parcels[0].name==='Gallery Lot',
    'The published region retains its named parcel and Jevica account ownership');
  check(await page.locator('.world-map-road').count()===authored.world.roads.length
    &&await page.locator('.world-map-building').count()===authored.world.buildings.length
    &&(await page.locator('.world-map-place title').allTextContents()).includes('Moon Arch'),
  'The map renders the published region roads, buildings, and named place');
  check(await page.locator('.world-map-parcel').count()===1
    &&(await page.locator('.world-map-parcel-list').textContent()).includes('Gallery Lot · Your parcel'),
  'The live world map shows the parcel boundary and its account ownership');
  await page.locator('.world-map-parcel-list>summary').click();
  await page.locator('.world-map-parcel-list button').click();
  check((await page.locator('.world-map-hint').textContent()).includes('Gallery Lot · Your parcel')
    &&await page.locator('.world-map-actions button',{hasText:'Go here'}).isDisabled(),
  'Parcel selection shows its area and cannot teleport through its building');
  const plotVisual=await page.locator('.world-map-parcel').evaluate(shape=>({
    width:shape.getBoundingClientRect().width,height:shape.getBoundingClientRect().height,
    stroke:getComputedStyle(shape).stroke,selected:shape.classList.contains('selected')}));
  check(plotVisual.width>20&&plotVisual.height>20&&plotVisual.stroke!=='none'&&plotVisual.selected,
    `The parcel boundary is visible and selected: ${JSON.stringify(plotVisual)}`);
  await page.locator('.world-map-surface').screenshot({path:'output/playwright/world-parcel-surface.png'});
  await page.locator('.world-map').screenshot({path:'output/playwright/world-parcels.png'});
  check(authored.world.stores.length===2&&authored.world.stores.some(store=>store.name==='Moon Gallery')&&authored.world.stores.some(store=>store.name==='Moon House'&&store.category==='home'&&store.access==='owner'),'The region package publishes a walk-in venue and Jevica-only home');
  check((await page.locator('#stores-count').textContent())==='2','Both creator interiors appear in the world directory');
  await page.locator('#enter-destination').click();
  await page.waitForFunction(()=>document.querySelector('#walking-hud')?.dataset.inside==='venue-building-1');
  check(true,'Jevica can enter the creator venue in the shared world');
  await page.waitForTimeout(1100);
  // Open More actions only when it is shown and closed: the HUD moves actions between
  // the primary slot and More as context changes, and a second summary click closes it.
  if(!await page.locator('.walking-more').evaluate(more=>more.open||more.hidden))await page.locator('.walking-more summary').click();
  await page.locator('#walking-enter').click();
  await page.waitForFunction(()=>document.querySelector('#walking-hud')?.dataset.inside==='');
  check(true,'Jevica can leave the creator venue');
  await page.locator('#store-category').selectOption('Homes');
  check((await page.locator('#store-results').textContent())==='1 of 2 destinations','The directory filters to homes');
  await page.waitForTimeout(1100);
  await page.locator('#enter-destination').click();
  await page.waitForFunction(()=>document.querySelector('#walking-hud')?.dataset.inside==='venue-building-2');
  check(true,'Jevica can enter the furnished home');
  if(!(await page.locator('.visit-tools').evaluate(node=>node.open)))await page.locator('.visit-tools-toggle').click();
  await page.locator('#build-kind').selectOption('side-table');
  await page.locator('#build-mode').click();
  const canvas=await page.locator('#canvas-host').boundingBox();
  let furnitureAim=null;
  for(const [fx,fy] of [[.5,.72],[.4,.72],[.6,.72],[.5,.8],[.35,.8],[.65,.8],[.3,.7],[.7,.7]]){
    await page.mouse.move(canvas.x+canvas.width*fx,canvas.y+canvas.height*fy);
    await page.waitForTimeout(250);
    if(await page.locator('#build-hint').getAttribute('data-valid')==='true'){furnitureAim=[fx,fy];break;}
  }
  check(Boolean(furnitureAim),`The home builder finds a clear floor spot (${await page.locator('#build-hint').textContent()})`);
  await page.locator('#build-place').click();
  await page.waitForFunction(()=>window.__riverMultiplayer().snapshot.builds.some(item=>item.kind==='side-table'));
  check(true,'Jevica places a shared side table inside her home');
  await page.locator('#build-mode').click();
  await page.screenshot({path:'output/playwright/creator-home.png'});
  await page.waitForTimeout(1100);
  if(!await page.locator('.walking-more').evaluate(more=>more.open||more.hidden))await page.locator('.walking-more summary').click();
  await page.locator('#walking-enter').click();
  await page.waitForFunction(()=>document.querySelector('#walking-hud')?.dataset.inside==='');
  await page.locator('#store-clear').click();
  await page.locator('.world-portal-list button[aria-label="Edit revision draft for Moon Garden"]').click();
  await page.locator('.region-editor').waitFor({state:'visible'});
  await page.locator('.region-editor-chooser').selectOption('places:place-1');
  await page.locator('.region-editor-fields label').filter({hasText:'Name'}).locator('input').fill('Revised Moon Arch');
  await page.locator('.region-editor-fields label').filter({hasText:'Name'}).locator('input').press('Tab');
  await page.locator('.region-editor [data-action=done]').click();
  await page.locator('.world-portal-revision button', {hasText:'Save revision draft'}).click();
  await page.waitForFunction(()=>document.querySelector('.world-portal-revision-status')?.textContent.includes('saved across devices'));
  const session=await (await page.request.get(`${origin}/auth/session`)).json();
  const draftResponse=await page.evaluate(async token=>{
    const response=await fetch('/api/world-draft/load',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':token},body:JSON.stringify({id:'moon-garden'})});
    return {status:response.status,data:await response.json()};
  },session.csrfToken);
  check(draftResponse.status===200&&draftResponse.data.draft.region.places.some(place=>place.name==='Revised Moon Arch'),'Jevica saves a version-bound revision draft on the server');
  check(!(await (await page.request.get(`${origin}/api/world-data?world=moon-garden`)).json()).world.communityLocations.some(place=>place.name==='Revised Moon Arch'),'Saving a draft leaves the live geography unchanged');
  check((await page.locator('#stores-count').textContent())==='2','The published world renders its own venue and home without River Oaks stores');
  check((await page.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===window.__riverMultiplayer().selfId)?.canBuild))===true,'Jevica can build in her new world');
  check(new URL(page.url()).searchParams.get('world')==='moon-garden','The published world has a shareable URL');
  const otherContext=await page.context().browser().newContext();
  try {
    let directoryRequests=0;
    await otherContext.route('**/api/worlds',route=>++directoryRequests===1
      ? route.fulfill({status:503,json:{error:'temporarily_unavailable'}})
      : route.continue());
    const guest=await otherContext.newPage();guest.on('pageerror',error=>errors.push(error.message));
    sharedPlace.searchParams.set('motion-debug','1');
    await guest.goto(sharedPlace.href,{waitUntil:'commit'});
    await guest.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:30000}).catch(async()=>{
      throw new Error(`Guest join: ${JSON.stringify(await guest.evaluate(()=>({url:location.href,multiplayer:document.querySelector('#canvas-host')?.dataset.multiplayer,ready:document.querySelector('#canvas-host')?.dataset.playerReady,connected:window.__riverMultiplayer?.().connected,status:document.querySelector('#multiplayer-status')?.textContent,assets:document.querySelector('#viewport')?.dataset.assetProgress,session:document.querySelector('.multiplayer-gate')?.textContent.slice(0,300)})))}`);
    });
    await guest.waitForFunction(()=>document.querySelector('#view-name')?.textContent==='Moon Garden',null,{timeout:60000}).catch(async()=>{
      throw new Error(`Guest world directory: ${await guest.locator('.world-portal-status').textContent()}`);
    });
    await guest.waitForFunction(()=>document.querySelector('.world-portal-status')?.textContent==='2 worlds to visit',null,{timeout:60000});
    check(directoryRequests>=2,'The directory recovers after a temporary failure');
    await guest.waitForFunction(()=>document.querySelector('#terrain-state')?.textContent==='Creator-authored terrain');
    const moonArch=authored.world.communityLocations.find(place=>place.name==='Moon Arch');
    await guest.waitForFunction(position=>{
      const client=window.__riverMultiplayer?.(),player=client?.snapshot?.players.find(item=>item.id===client.selfId);
      return player&&Math.hypot(player.position[0]-position[0],player.position[1]-position[1])<5;
    },moonArch.position,{timeout:15000}).catch(async()=>{
      throw new Error(`Shared place arrival: ${JSON.stringify(await guest.evaluate(()=>({url:location.href,status:document.querySelector('#places-status')?.textContent,
        self:window.__riverMultiplayer?.().selfId,players:window.__riverMultiplayer?.().snapshot?.players.map(player=>({id:player.id,position:player.position}))})))}`);
    });
    check(true,'A copied place link brings another resident into the same published world near its named place');
    check(await guest.locator('.world-portal-form').evaluate(node=>node.hidden),'A guest has no publishing form');
    check(await guest.locator('.world-portal-list button[aria-label^="Edit revision draft"]').count()===0,'A guest cannot open a region revision draft');
    const deniedDraft=await guest.evaluate(async()=>{
      const session=await (await fetch('/auth/session')).json();
      return (await fetch('/api/world-draft/load',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({id:'moon-garden'})})).status;
    });
    check(deniedDraft===403,'The server refuses a guest revision draft request');
    const deniedHistory=await guest.evaluate(async()=>{
      const session=await (await fetch('/auth/session')).json();
      return (await fetch('/api/world-draft/history',{method:'POST',headers:{'Content-Type':'application/json','X-CSRF-Token':session.csrfToken},body:JSON.stringify({id:'moon-garden'})})).status;
    });
    check(deniedHistory===403,'The server keeps published version history private to Jevica');
    check((await guest.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(p=>p.id===window.__riverMultiplayer().selfId)?.canBuild))===false,'A guest can visit but cannot build');
    check((await guest.evaluate(()=>window.__riverMultiplayer().snapshot.builds.some(item=>item.kind==='side-table'))),'The guest sees Jevica’s home furnishing in shared state');
    if(await guest.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await guest.locator('#panel-toggle').click();
    await guest.locator('[data-section=explore-section]').click();
    await guest.locator('#store-category').selectOption('Homes');
    check(await guest.locator('#enter-destination').isDisabled(),'The directory disables private home entry for uninvited guests');
    check((await guest.locator('#enter-destination').textContent())==='Invitation required','A guest sees that home entry requires an invitation');
    await guest.locator('#visit-destination').click();
    await guest.waitForFunction(()=>document.querySelector('#walking-enter')?.textContent.includes('Invitation required'));
    check(await guest.locator('#walking-enter').isDisabled(),'The doorway also blocks guest entry');
    check((await guest.locator('#walking-hud').getAttribute('data-inside'))!=='venue-building-2','The guest remains outside');
    await guest.locator('[data-section=community-section]').click();
    await guest.locator('.multiplayer-person button[aria-label^="Add "]').first().click();
    await page.locator('[data-section=community-section]').click();
    await page.waitForFunction(()=>[...document.querySelectorAll('.multiplayer-social-row')].some(row=>row.textContent.includes('wants to connect')),null,{timeout:15000});
    await page.locator('.multiplayer-social-row button', {hasText:'Accept'}).click();
    await page.locator('.multiplayer-social-row button', {hasText:'Message'}).click();
    await page.locator('select[aria-label^="Private home access for"]').selectOption({label:'Moon House'});
    await page.locator('.multiplayer-social-conversation button', {hasText:'Invite into home'}).click();
    await page.waitForFunction(()=>document.querySelector('.multiplayer-social-status')?.textContent.includes('can now enter this home'));
    check(true,'Jevica invites an accepted contact into a specific private home from the People panel');
    await guest.locator('[data-section=explore-section]').click();
    await guest.waitForFunction(()=>!document.querySelector('#enter-destination')?.disabled);
    await guest.locator('#enter-destination').click();
    await guest.waitForFunction(()=>document.querySelector('#walking-hud')?.dataset.inside==='venue-building-2');
    check((await guest.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===window.__riverMultiplayer().selfId)?.canBuild))===false,'Invited visitors can enter the home without building permission');
    await page.locator('.multiplayer-social-contacts .multiplayer-social-row button', {hasText:'Remove'}).click();
    await page.locator('.multiplayer-home-guests button', {hasText:'Remove access'}).click();
    await page.waitForFunction(()=>document.querySelector('.multiplayer-social-status')?.textContent.includes('can no longer enter Moon House'));
    check(true,'Jevica can revoke home access after removing the visitor from contacts');
    await guest.waitForFunction(()=>document.querySelector('#walking-hud')?.dataset.inside!=='venue-building-2',null,{timeout:15000});
    await guest.waitForFunction(()=>document.querySelector('#enter-destination')?.disabled,null,{timeout:15000});
    check(await guest.locator('#enter-destination').isDisabled(),'Revocation moves the guest outside and blocks reentry');
    await guest.waitForFunction(()=>window.__riverMultiplayer().snapshot.players.length===2);
    check(true,'The new world has shared presence');
    await guest.waitForFunction(()=>[...document.querySelectorAll('.world-portal-list li')]
      .some(row=>row.querySelector('a')?.textContent==='Moon Garden'&&row.querySelector('small')?.textContent.includes('2 visitors online')),null,{timeout:30000});
    check(true,'The world directory shows current visitors without exposing their identities');
  } finally {await otherContext.close();}
  await page.locator('[data-section=explore-section]').click();
  await Promise.all([page.waitForNavigation({waitUntil:'commit',timeout:60000}),
    page.locator('.world-portal-revision button', {hasText:'Apply saved draft'}).click()]);
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected
    && window.__riverMultiplayer().snapshot.regionSha256
    && document.querySelector('#view-name')?.textContent==='Moon Garden',null,{timeout:60000});
  const live=await (await page.request.get(`${origin}/api/world-data?world=moon-garden`)).json();
  check(live.world.communityLocations.some(place=>place.name==='Revised Moon Arch'),'Applying a saved draft updates the published region');
  check((await page.locator('.world-map-place title').allTextContents()).includes('Revised Moon Arch'),'The map follows the applied region revision');
  check((await page.evaluate(()=>window.__riverMultiplayer().snapshot.regionSha256))===live.regionSha256,'The client reconnects to the applied region');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('.world-portal-list button[aria-label="Edit revision draft for Moon Garden"]').click();
  await page.locator('.region-editor').waitFor({state:'visible'});
  await page.locator('.region-editor [data-action=done]').click();
  await page.locator('.world-portal-revision select[aria-label="Previous published version"]').selectOption('1');
  page.once('dialog',dialog=>dialog.accept());
  await page.locator('.world-portal-revision button', {hasText:'Load version into editor'}).click();
  await page.locator('.region-editor').waitFor({state:'visible'});
  await page.locator('.region-editor-chooser').selectOption('places:place-1');
  check((await page.locator('.region-editor-fields label').filter({hasText:'Name'}).locator('input').inputValue())==='Moon Arch','Jevica loads a retained published version into the private editor');
  await page.locator('.region-editor [data-action=done]').click();
  check(await page.locator('.world-portal-revision button', {hasText:'Apply saved draft'}).isDisabled(),'A restored version must be saved before it can be applied');
  await page.locator('.world-portal-revision button', {hasText:'Save revision draft'}).click();
  await page.waitForFunction(()=>document.querySelector('.world-portal-revision-status')?.textContent.includes('saved across devices'));
  await Promise.all([page.waitForNavigation({waitUntil:'commit',timeout:60000}),
    page.locator('.world-portal-revision button', {hasText:'Apply saved draft'}).click()]);
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected
    && window.__riverMultiplayer().snapshot.regionSha256
    && document.querySelector('#view-name')?.textContent==='Moon Garden',null,{timeout:60000});
  const restored=await (await page.request.get(`${origin}/api/world-data?world=moon-garden`)).json();
  check(restored.world.communityLocations.some(place=>place.name==='Moon Arch'),'Saving and applying the retained version restores the live region');
  check(restored.regionSha256===(await page.evaluate(()=>window.__riverMultiplayer().snapshot.regionSha256)),'The client reconnects to the restored region');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('#landmark-name').fill('Moon arrival');
  await page.locator('#landmark-add').click();
  await page.waitForFunction(()=>document.querySelector('#landmarks-list li .place-name')?.textContent==='Moon arrival');
  const savedWorldLink=new URL(await page.locator('#landmarks-list li button[aria-label^="Copy a link"]').evaluate(async button=>{
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>{window.__copiedLandmark=text;}}});
    button.click();await new Promise(resolve=>setTimeout(resolve,0));return window.__copiedLandmark;
  }));
  check(savedWorldLink.searchParams.get('world')==='moon-garden'&&savedWorldLink.searchParams.has('at'),'A landmark link includes its origin world and server-saved position');
  await page.goto(`${origin}/?motion-debug=1`,{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&window.__riverMultiplayer().snapshot.worldId==='river-oaks');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.waitForFunction(()=>document.querySelector('#landmarks-list li .place-name')?.textContent==='Moon arrival');
  const returnLink=page.locator('#landmarks-list li a[aria-label^="Go to Moon arrival"]');
  const destination=new URL(await returnLink.getAttribute('href'));
  check(destination.searchParams.get('world')==='moon-garden'&&destination.searchParams.get('at')===savedWorldLink.searchParams.get('at'),'The account directory routes a saved landmark to its original world');
  await returnLink.evaluate(link=>link.href+='&motion-debug=1');
  await Promise.all([page.waitForNavigation({waitUntil:'commit'}),returnLink.click()]);
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.multiplayer==='joined'&&document.querySelector('#view-name')?.textContent==='Moon Garden');
  await page.waitForFunction(at=>{
    const client=window.__riverMultiplayer?.(),player=client?.snapshot?.players.find(item=>item.id===client.selfId);
    const [x,north]=at.split(',').map(Number);
    return player&&Math.hypot(player.position[0]-x,player.position[1]-north)<1.3;
  },destination.searchParams.get('at'),{timeout:15000}).catch(async()=>{
    throw new Error(`Cross-world arrival: ${JSON.stringify(await page.evaluate(()=>({url:location.href,client:window.__riverMultiplayer?.(),status:document.querySelector('#places-status')?.textContent})))}`);
  });
  check(true,'Go opens the saved world and arrives at its landmark');
  check(errors.length===0,`No browser errors: ${errors.join('; ')}`);
  return {passed:true,checks,errors};
}
