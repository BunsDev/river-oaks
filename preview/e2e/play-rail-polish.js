async page => {
 // The play rail as a player sees it: one card per activity, no title row, a key
 // legend only during an activity, the cycling board fetching only while shown,
 // driving controls only during a ride, and the office card's actions on one line.
 // Screenshots of every tab in both themes go to output/playwright.
 const checks=[],check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'reduce'});
 await page.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});
 await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
 const rail=page.locator('.visit-tools');
 if(!await rail.evaluate(dock=>dock.open))await page.locator('.visit-tools-toggle').click();
 const tabs=async()=>page.locator('.play-rail-tab:not([hidden])').evaluateAll(nodes=>nodes.map(node=>node.id.slice('play-tab-'.length)));
 const overflow=()=>rail.evaluate(dock=>[...dock.querySelectorAll('.play-rail-pane:not([hidden]) *')].filter(node=>node.checkVisibility()&&node.scrollWidth>node.clientWidth+1&&getComputedStyle(node).overflowX==='visible').map(node=>node.className||node.tagName));
 check(await page.locator('.play-rail-heading').count()===0,'The rail has no title row: each card names its activity');
 check(await page.locator('.play-rail-context').isHidden(),'No key legend while choosing an activity');
 check(await page.locator('#player-drive-pad, .player-drive-pad').first().isHidden(),'Driving controls stay out of the way until a ride');
 const capture=async theme=>{
  await page.locator(`[data-theme-preference=${theme}]`).evaluate(button=>button.click());
  for(const id of await tabs()){
   await page.locator(`#play-tab-${id}`).click();await page.waitForTimeout(120);
   check((await overflow()).length===0,`${theme} ${id}: nothing spills sideways`);
   await rail.screenshot({path:`output/playwright/play-rail-${theme}-${id}.png`});
  }
 };
 await capture('dark');
 if((await tabs()).includes('cycling')){
  await page.locator('#play-tab-cycling').click();
  check(await page.locator('.cycling-board').evaluate(board=>board.open),'The Leaderboards tab shows its board open');
  await page.locator('#play-tab-character').click();
  check(!await page.locator('.cycling-board').evaluate(board=>board.open),'The board closes (and stops refreshing) when another tab shows');
 }
 await capture('light');
 await page.locator('#office-lobby').evaluate(button=>button.click());
 await page.locator('#play-tab-office:not([hidden])').waitFor({timeout:30000});
 await page.locator('#play-tab-office').click();
 const hiddenOfficeCards=await page.locator('.play-rail-pane:not([hidden]) .office-panel[hidden]').evaluateAll(cards=>cards.map(card=>({id:card.id,display:getComputedStyle(card).display,visible:card.checkVisibility()})));
 console.log('Hidden office card diagnostics',JSON.stringify(hiddenOfficeCards));
 check(hiddenOfficeCards.length>0&&hiddenOfficeCards.every(card=>!card.visible),'Office cards excluded from this world stay visually hidden');
 const officePanel=page.locator('.play-rail-pane:not([hidden]) .office-panel:visible');
 await officePanel.waitFor({state:'visible',timeout:30000});
 check(await officePanel.count()===1,'The active office tab shows one visible office card');
 const office=await officePanel.evaluate(panel=>{
  const card=panel.getBoundingClientRect(),text=panel.querySelector('h3').getBoundingClientRect();
  return {inset:text.left-card.left,buttons:[...panel.querySelectorAll(':scope > button:not([hidden])')].map(button=>button.getBoundingClientRect().height),
   picker:Boolean(panel.querySelector('.office-management select:disabled')),empty:panel.querySelector('.office-empty')?.textContent??null};
 });
 check(office.inset>=10,`The office card has an inset (${office.inset.toFixed(0)} px)`);
 check(office.buttons.length>=2&&office.buttons.every(height=>height<=46),`Office actions fit on one line each (${office.buttons.map(Math.round).join(', ')} px)`);
 check(!office.picker&&/once they are in town/.test(office.empty??''),'With nobody to invite, the card says so instead of a disabled picker');
 for(const theme of ['dark','light']){
  await page.locator(`[data-theme-preference=${theme}]`).evaluate(button=>button.click());
  await page.waitForTimeout(120);await rail.screenshot({path:`output/playwright/play-rail-${theme}-office-lobby.png`});
 }
 check(true,`Captured ${(await tabs()).join(', ')}`);
 return {checks};
}
