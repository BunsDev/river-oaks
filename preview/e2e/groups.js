async page => {
  const checks=[];
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  const second=await(await page.context().browser().newContext()).newPage();
  for(const tab of [page,second]) {
    tab.setDefaultTimeout(60000);
    await tab.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});
    await tab.waitForFunction(()=>window.__riverMultiplayer?.().connected);
  }
  try {
    for(const tab of [page,second]) {
      const toggle=tab.locator('#panel-toggle');
      if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
      await tab.locator('[data-section=community-section]').click();
    }
    // Earlier development journeys' residents can still be listed in this town,
    // so add the second player by id rather than the first Add button.
    const secondId=await second.evaluate(()=>window.__riverMultiplayer().selfId);
    await page.locator(`.multiplayer-person[data-peer-id="${secondId}"] button[aria-label^="Add "]`).click();
    await second.locator('.multiplayer-social-row button',{hasText:'Accept'}).click();
    await page.locator('.multiplayer-social-row button',{hasText:'Message'}).waitFor({state:'attached'});
    await page.locator('.multiplayer-groups-create input[name=name]').fill('Moon Garden Friends');
    await page.locator('.multiplayer-groups-create button').click();
    await page.locator('.multiplayer-group-row').filter({hasText:'Moon Garden Friends'}).waitFor({state:'attached'});
    await page.locator('.multiplayer-group-row').filter({hasText:'Moon Garden Friends'}).getByRole('button',{name:'Open'}).click();
    const [chosen]=await page.locator('.multiplayer-group-invite select').selectOption({value:secondId});
    check(chosen===secondId,'An accepted contact appears in the group invitation picker');
    await page.locator('.multiplayer-group-invite button').click();
    await page.waitForFunction(()=>document.querySelector('.multiplayer-group-status')?.textContent.includes('Group invitation sent'),null,{timeout:10000})
      .catch(async()=>{throw new Error(`Group invite failed: ${await page.locator('.multiplayer-group-status').textContent()}; selected ${await page.locator('.multiplayer-group-invite select').inputValue()}`);});
    await second.locator('.multiplayer-group-row').filter({hasText:'Moon Garden Friends'}).getByRole('button',{name:'Accept'}).click();
    await second.locator('.multiplayer-group-row').filter({hasText:'Moon Garden Friends'}).getByRole('button',{name:'Open'}).click();
    await second.locator('.multiplayer-group-form input').fill('Hello from the group');
    await second.locator('.multiplayer-group-form button').click();
    await page.locator('.multiplayer-group-history').getByText('Hello from the group').waitFor({state:'attached'});
    check(await page.locator('.multiplayer-chat-history').getByText('Hello from the group').count()===0,
      'Group messages stay out of public town chat');
    await second.reload({waitUntil:'commit'});
    await second.waitForFunction(()=>window.__riverMultiplayer?.().connected);
    const toggle=second.locator('#panel-toggle');
    if(await toggle.getAttribute('aria-expanded')==='false')await toggle.click();
    await second.locator('[data-section=community-section]').click();
    await second.locator('.multiplayer-group-row').filter({hasText:'Moon Garden Friends'}).getByRole('button',{name:'Open'}).click();
    await second.locator('.multiplayer-group-history').getByText('Hello from the group').waitFor({state:'attached'});
    check(true,'Group membership and conversation survive reconnect');
    return {checks};
  } finally {await second.context().close();}
}
