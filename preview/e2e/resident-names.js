async page => {
  // Residents are shown by GitHub username and only Jevica's account is ever
  // shown as Jevica. The fixture's "impostor" and "lookalike" sessions are
  // non-admin accounts whose session claims Jevica ("Jevica", and "Jеv1ca" with
  // a Cyrillic е and a digit), as a stale or forged record would. The owner is
  // a Jevica account whose session name is irrelevant.
  const origin='http://127.0.0.1:5180',ownerId='user_01M40Y914S1H4EJCEHH91DKTAY',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const ready=async tab=>tab.waitForFunction(()=>window.__riverMultiplayer?.().connected
    &&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  const open=async(id,tab)=>{
    tab??=await (await page.context().browser().newContext()).newPage();
    tab.on('pageerror',error=>errors.push(`${id}: ${error.message}`));
    await tab.context().addCookies([{name:'fixture_session',value:id,url:origin}]);
    await tab.goto(origin+'/?motion-debug=1',{waitUntil:'commit'});await ready(tab);
    return tab;
  };
  const openPeople=async tab=>{
    const control=tab.locator('#panel-toggle');
    if(await control.getAttribute('aria-expanded')==='false')await control.click();
    await tab.locator('[data-section=community-section]').click();
  };
  const named=async(tab,id)=>tab.evaluate(id=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===id)?.name,id);
  const waitForPlayer=(tab,id)=>tab.waitForFunction(id=>window.__riverMultiplayer().snapshot.players.some(player=>player.id===id),id,{timeout:60000});
  // Every name surface: roster rows and their button labels, nameplates, chat,
  // contacts, the profile card, the map's player list and the player's own name.
  // Whatever reads as Jevica, under any disguise, must belong to the owner.
  const sweep=async(tab,label)=>{
    const found=await tab.evaluate(async ownerId=>{
      const {reservedName}=await import('/src/resident-names.js');
      const surfaces=['.multiplayer-roster','.multiplayer-chat','.multiplayer-social','.multiplayer-profile','.remote-player-label','.world-map-player-list','#player-name'];
      const offenders=[],owned=[];
      for(const surface of surfaces)for(const root of document.querySelectorAll(surface))for(const node of [root,...root.querySelectorAll('*')]){
        const own=[...node.childNodes].filter(child=>child.nodeType===Node.TEXT_NODE).map(child=>child.textContent).join('');
        for(const value of [own,node.getAttribute('aria-label'),node.getAttribute('title'),node.getAttribute('alt')]){
          if(!value||!reservedName(value))continue;
          // The character panel names the viewer's own account.
          const holder=node.closest('[data-peer-id],[data-author-id]');
          const account=node.closest('#player-name')?window.__riverMultiplayer().selfId:holder?.dataset.peerId??holder?.dataset.authorId??null;
          (account===ownerId?owned:offenders).push({surface,value,account});
        }
      }
      return {offenders,owned};
    },ownerId);
    check(found.offenders.length===0,`${label}: nothing but the owner reads as Jevica (${JSON.stringify(found.offenders)})`);
    return found.owned;
  };

  await open('alice',page);
  check(await named(page,'alice')==='alice','A resident is shown by their GitHub username');
  const owner=await open('owner'),impostor=await open('impostor');
  await waitForPlayer(page,ownerId);await waitForPlayer(page,'impostor');
  check(await named(page,ownerId)==='Jevica','The admin account is Jevica');
  check(await named(page,'impostor')==='resident','A non-admin session claiming Jevica is not shown as Jevica');
  check(await named(impostor,'impostor')==='resident'&&await named(owner,'impostor')==='resident','Every viewer, including the impostor, sees the same name');
  await impostor.waitForFunction(()=>document.querySelector('#player-name')?.textContent==='resident');
  check(true,'The impostor’s own character panel does not call them Jevica');

  // Roster rows and their button labels.
  await openPeople(page);
  const row=page.locator('.multiplayer-person[data-peer-id="impostor"]');
  await row.waitFor({state:'attached'});
  check(await row.locator('.multiplayer-person-name').textContent()==='resident','The roster names the impostor by their safe name');
  check(await page.locator(`.multiplayer-person[data-peer-id="${ownerId}"] .multiplayer-person-name`).textContent()==='Jevica','The roster names the admin Jevica');
  const labels=await row.locator('button').evaluateAll(buttons=>buttons.map(button=>button.getAttribute('aria-label')));
  check(labels.includes('View profile for resident')&&labels.includes('Add resident as a contact')&&labels.includes('Report disruption by resident'),
    `Roster buttons are labelled with the safe name (${labels.join(' | ')})`);

  // Nameplates over avatars.
  await page.waitForFunction(ownerId=>{
    const labels=Object.fromEntries([...document.querySelectorAll('.remote-player-label')].map(label=>[label.dataset.peerId,label.textContent]));
    return labels.impostor?.startsWith('resident')&&labels[ownerId]?.startsWith('Jevica');
  },ownerId,{timeout:60000});
  check(true,'Nameplates show the impostor safely and the admin as Jevica');

  // Chat from both.
  for(const [tab,text] of [[impostor,'hello from the impostor'],[owner,'hello from the owner']]){
    await openPeople(tab);
    await tab.locator('.multiplayer-chat-form input').fill(text);
    await tab.locator('.multiplayer-chat-form button').click();
  }
  await page.waitForFunction(()=>document.querySelectorAll('.multiplayer-chat-message').length>=2,null,{timeout:30000});
  const authors=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.multiplayer-chat-message')].map(row=>[row.dataset.authorId,row.querySelector('strong').textContent])));
  check(authors.impostor==='resident'&&authors[ownerId]==='Jevica',`Chat shows the impostor safely and the admin as Jevica (${JSON.stringify(authors)})`);

  // Profile card and contact invitation.
  await row.getByRole('button',{name:'View profile for resident'}).click();
  await page.waitForFunction(()=>document.querySelector('.multiplayer-profile h4')?.textContent==='resident',null,{timeout:30000});
  check(true,'The impostor’s profile card does not call them Jevica');
  await row.getByRole('button',{name:'Add resident as a contact'}).click();
  const listed=await page.waitForFunction(()=>[...document.querySelectorAll('.multiplayer-social-row span')].some(span=>span.textContent==='resident'),null,{timeout:30000})
    .then(()=>true,()=>false);
  const social=await page.evaluate(()=>({status:document.querySelector('.multiplayer-social-status')?.textContent,
    rows:[...document.querySelectorAll('.multiplayer-social-row span')].map(span=>span.textContent)}));
  check(listed,`The contact list shows the impostor’s safe name (${JSON.stringify(social)})`);

  // The live player list on the map, where the world has one.
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  const players=page.locator('.world-map-player-list');
  if(await players.count()){
    await players.locator('summary').click();
    await page.locator('.world-map-player-list button[data-peer-id="impostor"]').waitFor({state:'attached',timeout:30000});
    check(await page.locator('.world-map-player-list button[data-peer-id="impostor"]').textContent().then(text=>!text.includes('Jevica')),
      'The map’s live player list shows the impostor safely');
  }

  const owned=await sweep(page,'Alice’s view');
  check(owned.length>=3,'The admin is still shown as Jevica on the roster, nameplate and chat');
  await sweep(impostor,'The impostor’s own view');
  await sweep(owner,'The admin’s view');

  // A lookalike spelling is caught the same way.
  await impostor.context().close();
  const lookalike=await open('lookalike');
  await waitForPlayer(page,'lookalike');
  check(await named(page,'lookalike')==='resident','A lookalike spelling of Jevica is not shown as Jevica');
  await page.waitForFunction(()=>document.querySelector('.multiplayer-person[data-peer-id="lookalike"] .multiplayer-person-name')?.textContent==='resident');
  await sweep(page,'Alice’s view with the lookalike');
  await sweep(lookalike,'The lookalike’s own view');
  await lookalike.context().close();await owner.context().close();
  check(errors.length===0,`No page errors: ${errors.join(' | ')}`);
  return {checks};
}
