async page=>{
  const checks=[];const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  const second=await(await page.context().browser().newContext()).newPage();
  const open=async tab=>{
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});
    await tab.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('.world-events-form select')?.options.length>0);
    const toggle=tab.locator('#panel-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
    await tab.locator('[data-section=explore-section]').click();
  };
  try {
    await open(page);await open(second);
    check(await second.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===window.__riverMultiplayer().selfId).canBuild)===false,
      'A nonadmin resident can host a gathering without building permissions');
    await second.locator('.world-events-studio>summary').click();
    await second.locator('.world-events-form input[name=title]').fill('Moonlit Story Circle');
    await second.locator('.world-events-form textarea').fill('Bring a story to share.\nMeet beneath the stars.');
    await second.locator('.world-events-form input[name=capacity]').fill('2');
    await second.locator('.world-events-form button').click();
    const hosted=second.locator('.world-event').filter({hasText:'Moonlit Story Circle'});
    await hosted.waitFor({state:'visible'}).catch(async()=>{
      await second.screenshot({path:'output/playwright/world-events-host-failure.png'});
      throw new Error(`Schedule result: ${await second.locator('.world-events-status').textContent()}; form ${JSON.stringify(await second.locator('.world-events-form').evaluate(form=>[...form.elements].map(input=>({name:input.name,value:input.value,valid:input.validity?.valid,message:input.validationMessage}))))}`);
    });
    check((await hosted.locator('.world-event-description').textContent()).includes('\nMeet beneath the stars.'),'A multiline description survives scheduling');
    check((await hosted.textContent()).includes('1/2 going'),'The host occupies the first RSVP place');
    await page.getByRole('button',{name:'Refresh events',exact:true}).click();
    const listed=page.locator('.world-event').filter({hasText:'Moonlit Story Circle'});
    await listed.waitFor({state:'visible'});
    await listed.getByRole('button',{name:'I’m going',exact:true}).click();
    await listed.getByRole('button',{name:'Withdraw RSVP',exact:true}).waitFor({state:'visible'});
    check(await page.evaluate(()=>document.activeElement?.dataset.action==='rsvp'),'RSVP updates retain keyboard focus on the action');
    check((await listed.textContent()).includes('2/2 going'),'A second account joins the persistent guest count');
    const link=await listed.getByRole('link',{name:'Visit meeting point'}).getAttribute('href');
    check(!new URL(link).searchParams.has('play')&&new URL(link).searchParams.get('place')==='arrival',
      'The event links to its shared world and server-checked outdoor destination');
    await listed.scrollIntoViewIfNeeded();
    await listed.screenshot({path:'output/playwright/world-events.png'});
    await listed.getByRole('link',{name:'Visit meeting point'}).click();
    await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.multiplayer==='joined'&&document.querySelector('#places-status')?.textContent.includes("You're at Arrival"));
    check(new URL(page.url()).searchParams.get('place')==='arrival','Visiting the event arrives through the normal shared travel flow');
    const toggle=page.locator('#panel-toggle');if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
    await page.locator('[data-section=explore-section]').click();
    await page.locator('.world-event').filter({hasText:'Moonlit Story Circle'}).getByRole('button',{name:'Withdraw RSVP'}).click();
    await page.locator('.world-event').filter({hasText:'Moonlit Story Circle'}).getByRole('button',{name:'I’m going',exact:true}).waitFor({state:'visible'});
    check(true,'RSVP survives reconnect and can be withdrawn');
    second.once('dialog',dialog=>dialog.accept());await hosted.getByRole('button',{name:'Cancel event'}).click();
    await second.waitForFunction(()=>document.querySelector('.world-events-status')?.textContent==='Event cancelled.');
    check(await second.evaluate(()=>document.activeElement?.textContent==='Refresh events'),'Cancellation returns focus to refresh');
    await page.getByRole('button',{name:'Refresh events',exact:true}).click();
    await listed.waitFor({state:'detached'});check(true,'Host cancellation removes the event for every account');
    check(await second.evaluate(()=>window.__riverMultiplayer().snapshot.players.find(player=>player.id===window.__riverMultiplayer().selfId).canGrantWishes)===false,
      'Hosting and cancelling never grant wish permissions');
    return {checks};
  } finally {await second.context().close();}
}
