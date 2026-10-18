async page => {
  const checks=[],errors=[];const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
  page.on('pageerror',e=>errors.push(e.message));await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('http://127.0.0.1:5173/');await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  if(!await page.locator('.visit-tools').evaluate(n=>n.open))await page.locator('.visit-tools-toggle').click();
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  const before=await page.locator('#canvas-host').getAttribute('data-player-appearance');
  const open=async()=>{await page.getByRole('button',{name:'Open character studio',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.character-studio[open] .cs-preview')?.dataset.ready==='true');};
  const ready=async id=>page.waitForFunction(id=>{const el=document.querySelector('.cs-preview');return el.dataset.ready==='true'&&el.dataset.appearance===id;},id);
  await open();const dialog=page.getByRole('dialog',{name:'Character studio'});
  check(await dialog.locator('[data-turntable]').isDisabled(),'Reduced motion disables turntable');check(await dialog.locator('[name=pose]').isDisabled(),'Reduced motion disables animated poses');
  await page.waitForFunction(()=>document.querySelector('.character-studio').dataset.accountPhase==='ready');
  check(/current town look/.test(await dialog.locator('[data-account-status]').innerText()),'An unedited look is not reported as unsaved edits');
  // Guided start: each choice group is one tab stop, and the summary says what this character can change.
  await dialog.locator('[data-close]').focus();const stops=[];
  for(let i=0;i<12;i++){await page.keyboard.press('Tab');stops.push(await page.evaluate(()=>document.activeElement.name||document.activeElement.dataset.close!==undefined&&'close'||document.activeElement.tagName));}
  check(stops.filter(name=>name==='cs-character').length===1&&!stops.includes('cs-form'),'Human character choices are one tab stop');
  await dialog.locator('[data-character=sable]').click();await ready('sable-human');
  check(/dress color and hair color/.test(await dialog.locator('[data-cs-summary-options]').innerText()),'The guided summary lists the validated changes for Sable');
  await dialog.getByRole('radio',{name:'Ivory',exact:true}).focus();await page.keyboard.press('ArrowRight');
  check(await dialog.getAttribute('data-palette')==='rose','Arrow keys move through a color group');
  await dialog.getByRole('radio',{name:'Espresso',exact:true}).click();
  await page.setViewportSize({width:1440,height:900});
  check(await dialog.evaluate(n=>{const box=n.getBoundingClientRect(),controls=n.querySelector('.cs-controls');return box.width>=innerWidth-28&&box.height>=innerHeight-28&&n.scrollWidth<=n.clientWidth&&controls.scrollHeight<=controls.clientHeight+1;}),'Desktop Studio fills the window with all editing controls visible without scrolling');
  check(await dialog.getAttribute('data-palette')==='rose'&&await dialog.getAttribute('data-hair')==='espresso','Dress and hair changes form a distinct validated draft');
  check(await dialog.locator('[data-cs-summary-edit]').innerText()==='Your colors: Rose silk dress, Espresso hair.','The summary names the edited colors instead of contradicting the preview');
  await dialog.getByRole('button',{name:'Undo',exact:true}).click();check(await dialog.getAttribute('data-hair')==='authored','Undo restores the previous hair');
  await dialog.getByRole('button',{name:'Redo',exact:true}).click();check(await dialog.getAttribute('data-hair')==='espresso','Redo restores the edit');
  check(await dialog.getByRole('img',{name:'Live preview: Sable, Human, Rose silk dress, Espresso hair'}).isVisible()&&await dialog.getByRole('button',{name:'Undo',exact:true}).getAttribute('aria-keyshortcuts')==='Control+Z Meta+Z','The preview image names the staged look and Undo advertises its shortcut');
  await dialog.getByRole('button',{name:'Before / after',exact:true}).click();check(await dialog.locator('[data-comparing]').isVisible(),'Comparison shows the original');
  check(await dialog.getByRole('img',{name:/^Original look: /}).isVisible(),'The preview image names the original during comparison');
  await dialog.getByRole('button',{name:'Before / after',exact:true}).click();await ready('sable-human');
  await dialog.locator('[name=framing]').selectOption('portrait');await page.screenshot({path:'output/playwright/character-studio-portrait.png'});
  await dialog.locator('[name=framing]').selectOption('full');await dialog.locator('.cs-controls').evaluate(n=>n.scrollTop=0);await page.screenshot({path:'output/playwright/character-studio-desktop.png'});
  check(await page.locator('#canvas-host').getAttribute('data-player-appearance')===before,'Editing never changes the authoritative town appearance');
  await page.evaluate(()=>{const set=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key.startsWith('river-oaks-character-favorites'))throw new DOMException('Storage unavailable','QuotaExceededError');return set.call(this,key,value);};});
  await dialog.getByRole('button',{name:'Favorite this look',exact:true}).click();check(await dialog.locator('#cs-favorites option').count()>1,'A validated look can be favorited');
  await dialog.getByRole('button',{name:'Discard edits',exact:true}).click();await open();check(await dialog.getAttribute('data-appearance')===before,'Discard returns to confirmed character');
  check(await dialog.locator('#cs-favorites option').count()>1,'Storage failure preserves in-memory favorites across reopen');
  await dialog.locator('[data-character=sable]').click();await ready('sable-human');
  await dialog.getByRole('radio',{name:'Lagoon',exact:true}).click();await dialog.getByRole('button',{name:'Close studio',exact:true}).click();await open();check(await dialog.getAttribute('data-palette')==='lagoon','A kept draft survives closing and reopening');
  await dialog.getByRole('radio',{name:'Rose silk',exact:true}).click();await dialog.getByRole('button',{name:'Discard edits',exact:true}).click();await open();
  check(await dialog.getAttribute('data-palette')==='lagoon','Discard restores the previously kept draft');
  await dialog.getByRole('radio',{name:'Copper',exact:true}).click();check(await dialog.getAttribute('data-hair')==='copper','Clicking a hair color stages it');await page.keyboard.press('Control+z');
  check(await dialog.getAttribute('data-hair')==='authored'&&/^Undone: Sable/.test(await dialog.locator('[data-cs-announce]').evaluate(n=>new Promise(r=>requestAnimationFrame(()=>r(n.textContent))))),'Undo from a focused choice restores and announces the look');
  await dialog.locator('[data-character=rowan]').click();await ready('rowan-human');
  check(await dialog.locator('[data-cs-colors]').isHidden()&&/Rowan’s colors stay as designed/.test(await dialog.locator('[data-compatibility]').innerText()),'Unsupported color choices are withheld with explanatory feedback');
  await dialog.locator('[data-character=sable]').click();await ready('sable-human');await dialog.getByRole('radio',{name:'Rose silk',exact:true}).click();
  await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');await ready('rowan-human');
  check(await page.evaluate(()=>{const active=document.activeElement;return Boolean(active.closest('.character-studio'))&&!active.closest('[hidden]')&&!active.disabled;}),'Undo that hides the focused choice keeps focus in the Studio');
  await dialog.locator('[data-character=kai]').click();await ready('man-workwear');
  await dialog.getByRole('radio',{name:'Starlit noir',exact:true}).click();await ready('kai-noir');check(await dialog.getByRole('group',{name:'Wardrobe',exact:true}).isVisible(),'Wardrobe choices appear only for characters with several validated outfits');
  await dialog.getByRole('button',{name:'Remix Kai',exact:true}).click();
  check(await dialog.getAttribute('data-appearance')!=='kai-noir'&&(await dialog.getAttribute('data-appearance')).match(/kai|man-workwear/)&&/^Remix: Kai/.test(await dialog.locator('[data-cs-announce]').evaluate(n=>new Promise(r=>requestAnimationFrame(()=>r(n.textContent))))),'Remix varies the current character and announces the result');
  await dialog.getByRole('button',{name:'Surprise me',exact:true}).click();check(await dialog.getAttribute('data-appearance'),'Curated randomize produces a valid choice');
  await page.keyboard.press('Escape');check(!await dialog.isVisible(),'Escape closes the Studio');check(await page.getByRole('button',{name:'Open character studio',exact:true}).evaluate(n=>n===document.activeElement),'Closing restores focus to the entry');
  // Keyboard only, from the Studio entry to a saved draft: no pointer events.
  const keys=await page.context().browser().newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  try{
    await keys.addCookies(await page.context().cookies());const board=await keys.newPage();board.setDefaultTimeout(60000);board.on('pageerror',e=>errors.push(e.message));await board.goto(page.url());
    await board.locator('#loading').waitFor({state:'hidden'});await board.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
    if(!await board.locator('.visit-tools').evaluate(n=>n.open)){await board.locator('.visit-tools-toggle').focus();await board.keyboard.press('Enter');}
    await board.getByRole('button',{name:'Open character studio',exact:true}).focus();await board.keyboard.press('Enter');
    const studio=board.locator('.character-studio');await board.waitForFunction(()=>document.querySelector('.character-studio[open]')?.dataset.accountPhase==='ready'&&document.querySelector('.cs-preview').dataset.ready==='true');
    const tabTo=async name=>{for(let i=0;i<40;i++){await board.keyboard.press('Tab');if(await board.evaluate(name=>document.activeElement.name===name||document.activeElement.matches(name),name))return true;}return false;};
    const settled=id=>board.waitForFunction(id=>{const el=document.querySelector('.cs-preview');return el.dataset.ready==='true'&&el.dataset.appearance===id;},id);
    check(await tabTo('cs-character'),'Keyboard reaches the character choices');
    const start=await studio.getAttribute('data-appearance');
    while(await studio.getAttribute('data-appearance')!=='sable-human'){await board.keyboard.press('ArrowRight');if(await studio.getAttribute('data-appearance')===start)break;}
    await settled('sable-human');
    check(await tabTo('cs-palette'),'Keyboard reaches dress colors');await board.keyboard.press('ArrowRight');
    check(await tabTo('cs-hair'),'Keyboard reaches hair colors');await board.keyboard.press('ArrowRight');
    check(await studio.getAttribute('data-palette')==='rose'&&await studio.getAttribute('data-hair')==='espresso','Keyboard alone creates a distinct human variation');
    await board.keyboard.press('Control+z');check(await studio.getAttribute('data-hair')==='authored','The undo shortcut works from the keyboard path');
    await board.keyboard.press('Control+Shift+z');check(await studio.getAttribute('data-hair')==='espresso','The redo shortcut works from the keyboard path');
    check(await tabTo('[data-save]'),'Keyboard reaches Save draft');await board.keyboard.press('Enter');
    await board.waitForFunction(()=>/Private draft saved/.test(document.querySelector('.character-studio [data-account-status]').textContent));
    check(true,'Keyboard saves the draft privately');
    await board.keyboard.press('Escape');check(!await studio.evaluate(n=>n.open)&&await board.getByRole('button',{name:'Open character studio',exact:true}).evaluate(n=>n===document.activeElement),'Escape closes the keyboard session and returns focus to the entry');
  }finally{await keys.close();}
  // Real touch context, same existing authenticated fixture cookie.
  const touch=await page.context().browser().newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'reduce'});
  try{
    await touch.addCookies(await page.context().cookies());const phone=await touch.newPage();phone.setDefaultTimeout(60000);phone.on('pageerror',e=>errors.push(e.message));await phone.goto(page.url());
    await phone.locator('#loading').waitFor({state:'hidden'}).catch(async error=>{throw new Error(`${error.message}; phone loading: ${await phone.locator('#loading').innerText()}; errors: ${errors.join('; ')}`);});await phone.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
    if(!await phone.locator('.visit-tools').evaluate(n=>n.open))await phone.locator('.visit-tools-toggle').tap();
    const entry=phone.getByRole('button',{name:'Open character studio',exact:true});await entry.scrollIntoViewIfNeeded();await entry.tap();
    const mobile=phone.getByRole('dialog',{name:'Character studio'});await mobile.locator('[data-character=sable]').tap();
    await phone.waitForFunction(()=>document.querySelector('.cs-preview').dataset.appearance==='sable-human'&&document.querySelector('.cs-preview').dataset.ready==='true');
    await mobile.getByRole('radio',{name:'Botanical',exact:true}).tap();check(await mobile.getAttribute('data-palette')==='botanical','Touch editing changes the draft');
    check(await mobile.locator('[data-palette=botanical]').isVisible(),'Phone color choices remain reachable');
    check(await mobile.evaluate(n=>n.scrollWidth<=n.clientWidth),'Phone dialog has no horizontal overflow');
    await mobile.locator('.cs-workspace').evaluate(n=>n.scrollTop=0);await phone.screenshot({path:'output/playwright/character-studio-phone.png'});
    await mobile.getByRole('button',{name:'Close character studio',exact:true}).tap();
  }finally{await touch.close();}
  const animated=await page.context().browser().newContext({viewport:{width:1440,height:1000},reducedMotion:'no-preference'});
  try{
    await animated.addCookies(await page.context().cookies());const moving=await animated.newPage();moving.setDefaultTimeout(60000);moving.on('pageerror',e=>errors.push(e.message));await moving.goto(page.url());
    await moving.locator('#loading').waitFor({state:'hidden'});await moving.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
    if(!await moving.locator('.visit-tools').evaluate(n=>n.open))await moving.locator('.visit-tools-toggle').click();
    if(await moving.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await moving.locator('#panel-toggle').click();
    await moving.getByRole('button',{name:'Open character studio',exact:true}).click();const studio=moving.locator('.character-studio');await studio.locator('[data-character=sable]').click();
    await moving.waitForFunction(()=>document.querySelector('.cs-preview').dataset.appearance==='sable-human'&&document.querySelector('.cs-preview').dataset.ready==='true');
    await studio.locator('[name=pose]').selectOption('walk');await studio.locator('[data-turntable]').click();
    await moving.evaluate(()=>new Promise(resolve=>{let n=0;const tick=()=>++n<40?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}));
    await moving.screenshot({path:'output/playwright/character-studio-walk.png'});
    check(await studio.locator('[data-turntable]').getAttribute('aria-pressed')==='true','Motion-enabled preview offers walk and turntable');
    await studio.locator('[data-turntable]').click();await studio.locator('[name=pose]').selectOption('wave');
    await moving.evaluate(()=>new Promise(resolve=>{let n=0;const tick=()=>++n<40?requestAnimationFrame(tick):resolve();requestAnimationFrame(tick);}));
    await moving.screenshot({path:'output/playwright/character-studio-wave.png'});
    await moving.keyboard.press('Escape');
  }finally{await animated.close();}
  check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);
  return {passed:true,checks,scope:'Automated desktop/touch/reduced-motion draft journey; no published revisions or human accessibility acceptance'};
}
