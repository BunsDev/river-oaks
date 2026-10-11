async (page) => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const denied=await page.context().browser().newContext();
  try{const tab=await denied.newPage();await tab.goto('http://127.0.0.1:5173/studio.html');await tab.getByRole('status').filter({hasText:'Sign in and join'}).waitFor();if(await tab.locator('canvas').count())throw Error('Anonymous visitor opened the editor');}finally{await denied.close();}
  await page.goto('http://127.0.0.1:5173/');
  await page.waitForFunction(() => document.querySelector('#canvas-host')?.dataset.playerReady === 'true');
  await openHudSpace(page, 'settings-section', 'World');
  await page.getByRole('link', { name: 'Open World Studio' }).click({ timeout: 10000 });
  await page.waitForSelector('body[data-studio-ready="true"]',{timeout:20000});
  const checkPrompt=async()=>{
    const prompt=page.getByLabel('Ask the World Studio agent');
    await prompt.focus();
    const look=await prompt.evaluate(input=>{
      const field=getComputedStyle(input),pill=getComputedStyle(input.closest('.studio-agent-pill'));
      const panel=getComputedStyle(document.querySelector('.studio-agent-panel'));
      return {fieldOutline:field.outlineStyle,pillOutline:pill.outlineStyle,pillWidth:pill.outlineWidth,background:pill.backgroundColor,surface:panel.backgroundColor};
    });
    if(look.fieldOutline!=='none'||look.pillOutline!=='solid'||look.pillWidth!=='2px'||look.background!==look.surface)throw Error(`Scene prompt lost its unified themed focus: ${JSON.stringify(look)}`);
    await page.keyboard.press('Tab');
    const open=page.getByRole('button',{name:'Open agent chat'});
    if(!await open.evaluate(button=>button===document.activeElement&&getComputedStyle(button).outlineStyle==='solid'))throw Error('Prompt action lost keyboard focus');
    await page.keyboard.press('Enter');
    await page.getByRole('region',{name:'World Studio agent'}).waitFor();
    await page.locator('.studio-agent').press('Escape');
    if(!await prompt.evaluate(input=>input===document.activeElement))throw Error('Chat collapse did not restore prompt focus');
  };
  // Appearance follows the OS by default and honors the game's explicit Light/Dark choice.
  const appearance=async()=>{
    const {theme,header,box}=await page.evaluate(()=>({theme:document.documentElement.dataset.theme,header:getComputedStyle(document.querySelector('.studio-header')).backgroundColor,box:document.querySelector('#studio-viewport canvas').getBoundingClientRect().toJSON()}));
    await page.waitForTimeout(100);const shot=(await page.screenshot({clip:{x:box.x+4,y:box.y+4,width:1,height:1}})).toString('base64');
    const backdrop=await page.evaluate(async shot=>{const image=new Image();image.src='data:image/png;base64,'+shot;await image.decode();const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return [...ctx.getImageData(0,0,1,1).data.slice(0,3)];},shot);
    return {theme,header,dark:backdrop.every(channel=>channel<60)};
  };
  await page.emulateMedia({colorScheme:'dark'});await page.waitForFunction(()=>document.documentElement.dataset.theme==='dark');
  let look=await appearance();
  if(look.header!=='rgb(24, 32, 28)'||!look.dark)throw Error(`Dark system appearance left the Studio light: ${JSON.stringify(look)}`);
  await checkPrompt();
  await page.screenshot({path:'output/playwright/world-studio-dark.png'});
  await page.evaluate(()=>localStorage.setItem('river-oaks-appearance','light'));await page.reload();await page.waitForSelector('body[data-studio-ready="true"]');
  look=await appearance();
  if(look.theme!=='light'||look.header!=='rgb(245, 248, 246)'||look.dark)throw Error(`Explicit Light preference was ignored: ${JSON.stringify(look)}`);
  await checkPrompt();
  await page.evaluate(()=>localStorage.removeItem('river-oaks-appearance'));await page.emulateMedia({colorScheme:'light'});
  await page.reload();await page.waitForSelector('body[data-studio-ready="true"]');
  await page.locator('#studio-designer-open').click();
  await page.locator('[data-state]').filter({hasText:'Electron desktop editor'}).waitFor();
  if(!await page.locator('[data-connect]').isDisabled())throw Error('Browser without host offered a fake connection');
  await page.locator('[data-close]').press('Escape');
  await page.getByRole('button',{name:'Add building',exact:true}).click();
  await page.getByLabel('East (m)',{exact:true}).fill('24');
  await page.getByLabel('East (m)',{exact:true}).press('Tab');
  await page.getByLabel('Yaw (degrees)',{exact:true}).fill('45');
  await page.getByLabel('Yaw (degrees)',{exact:true}).press('Tab');
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  if(await page.getByLabel('Yaw (degrees)',{exact:true}).inputValue()!=='0')throw Error('Undo did not restore rotation');
  await page.getByRole('button',{name:'Redo',exact:true}).click();
  await page.getByLabel('East (m)',{exact:true}).fill('95');await page.getByLabel('East (m)',{exact:true}).press('Tab');
  if(await page.getByLabel('East (m)',{exact:true}).inputValue()!=='24')throw Error('Invalid footprint was accepted');
  await page.getByRole('button',{name:'Save on device',exact:true}).click();
  await page.reload();await page.waitForSelector('body[data-studio-ready="true"]');
  await page.locator('[data-item="building-1"]').click();
  if(await page.getByLabel('East (m)',{exact:true}).inputValue()!=='24')throw Error('Save/reopen lost transform');
  await page.getByRole('button',{name:'Frame selection',exact:true}).click();
  // Focus remains on the building while another item is selected; pointer picking must recover it.
  await page.locator('[data-item="@arrival"]').click();
  const box=await page.locator('#studio-viewport canvas').boundingBox();
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
  await page.waitForSelector('[data-item="building-1"][aria-pressed="true"]');
  // Locate the actual red X handle from rendered pixels, then drag it. This
  // exercises TransformControls and its production commit path, not a test hook.
  const shot=(await page.screenshot()).toString('base64');
  const handle=await page.evaluate(async ({shot,box})=>{
    const image=new Image();image.src='data:image/png;base64,'+shot;await image.decode();
    const canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;
    const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    let right=-1,point=null;
    for(let y=Math.ceil(box.y);y<box.y+box.height;y++)for(let x=Math.ceil(box.x);x<box.x+box.width;x++){
      const i=(y*canvas.width+x)*4;
      if(pixels[i]>220&&pixels[i+1]<65&&pixels[i+2]<65&&x>right){right=x;point={x:x-3,y};}
    }
    return point;
  },{shot,box});
  if(!handle)throw Error('Move handle was not rendered');
  const eastBefore=await page.getByLabel('East (m)',{exact:true}).inputValue();
  await page.mouse.move(handle.x,handle.y);await page.mouse.down();await page.mouse.move(handle.x+48,handle.y+22,{steps:12});await page.mouse.up();
  await page.waitForFunction(before=>document.querySelector('input[name="east"]').value!==before,eastBefore);
  await page.getByRole('button',{name:'Undo',exact:true}).click();
  if(await page.getByLabel('East (m)',{exact:true}).inputValue()!==eastBefore)throw Error('Gizmo drag did not undo as one transaction');
  const download=page.waitForEvent('download');await page.locator('#studio-export').click();
  const file=await download;if(file.suggestedFilename()!=='world-studio-region.json')throw Error('Wrong export filename');
  await page.getByRole('button',{name:'Add tree',exact:true}).click();
  await page.getByLabel('East (m)',{exact:true}).fill('-35');await page.getByLabel('East (m)',{exact:true}).press('Tab');
  await page.getByRole('button',{name:'Save on device',exact:true}).click();
  const before=await page.evaluate(()=>localStorage.getItem('river-oaks-world-studio-v1'));
  await page.locator('#studio-import').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{}')});
  if(await page.evaluate(()=>localStorage.getItem('river-oaks-world-studio-v1'))!==before)throw Error('Bad import overwrote saved draft');
  await page.locator('#studio-import').setInputFiles({name:'valid.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(JSON.parse(before).region))});
  await page.getByRole('button',{name:'Walk through',exact:true}).click();
  await page.waitForSelector('body[data-mode="walk"]');
  const start=await page.locator('#studio-position').textContent();
  await page.locator('#studio-viewport').focus();await page.keyboard.down('w');await page.waitForTimeout(750);await page.keyboard.up('w');
  if(await page.locator('#studio-position').textContent()===start)throw Error('Walkthrough did not move');
  await page.keyboard.press('Escape');await page.waitForSelector('body[data-mode="edit"]');
  await page.getByRole('button',{name:'Frame region',exact:true}).click();
  await page.locator('[data-item="building-1"]').click();
  await page.screenshot({path:'output/playwright/world-studio-desktop.png'});
  await page.setViewportSize({width:900,height:700});await page.screenshot({path:'output/playwright/world-studio-compact.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'output/playwright/world-studio-narrow.png'});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  if(overflow)throw Error('Editor overflows compact viewport');
  if(errors.length)throw Error(errors.join('\n'));
  return {passed:true,journey:'create-transform-undo-save-reopen-pick-export-import-walk',errors};
}
