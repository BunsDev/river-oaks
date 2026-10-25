async (page) => {
  const {readFile} = await import('node:fs/promises');
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5173/studio.html');
  await page.waitForSelector('body[data-studio-ready="true"]');
  const panel=page.getByRole('dialog',{name:'Neighborhood candidates'});
  const open=()=>page.getByRole('button',{name:'Neighborhood',exact:true}).click();
  const close=()=>panel.getByRole('button',{name:'Close',exact:true}).click();
  const preview=async()=>{await panel.getByRole('button',{name:'Preview candidate',exact:true}).click();await panel.getByRole('button',{name:'Apply candidate',exact:true}).waitFor({state:'visible'});await page.waitForFunction(()=>!document.querySelector('.studio-neighborhood [data-apply]').disabled);};
  const apply=()=>panel.getByRole('button',{name:'Apply candidate',exact:true}).click();
  const exported=async()=>{
    const downloaded=page.waitForEvent('download');await panel.getByRole('button',{name:'Export authoring',exact:true}).click();
    const file=await downloaded;return JSON.parse(await readFile(await file.path(),'utf8'));
  };
  await open();await preview();
  await panel.getByRole('button',{name:'Cancel preview',exact:true}).click();
  if(!await panel.getByRole('button',{name:'Apply candidate',exact:true}).isDisabled())throw Error('Cancelled preview stayed applicable');
  await close();
  // A file read begun before generation must not overwrite its later application.
  await page.evaluate(()=>{
    const original=File.prototype.text;
    File.prototype.text=function(){if(this.name!=='delayed-region.json')return original.call(this);
      return new Promise(resolve=>{window.releaseNeighborhoodOldImport=async()=>{resolve(await original.call(this));File.prototype.text=original;};});};
  });
  const {blankRegion}=await import('../src/region-draft.js');
  await page.locator('#studio-import').setInputFiles({name:'delayed-region.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(blankRegion()))});
  await open();await preview();await page.screenshot({path:'output/playwright/neighborhood-authoring-plan.png'});await apply();await close();
  await page.evaluate(()=>window.releaseNeighborhoodOldImport());
  const objects=page.locator('[data-item^="h-"]');if(await objects.count()!==16)throw Error('Candidate did not reach the Studio scene');
  const id=await objects.first().getAttribute('data-item');await objects.first().click();
  await page.getByLabel('Height (m)',{exact:true}).fill('8');await page.getByLabel('Height (m)',{exact:true}).press('Tab');
  await open();await panel.getByRole('button',{name:'Preview approval of selected object',exact:true}).click();
  await page.waitForFunction(()=>!document.querySelector('.studio-neighborhood [data-apply]').disabled);await apply();
  let artifact=await exported();if(!artifact.approved.includes(id)||artifact.region.buildings.find(b=>b.id===id).size[2]!==8)throw Error('Approval lost edited building');
  await close();await page.getByRole('button',{name:'Undo',exact:true}).click();await open();
  if((await exported()).approved.includes(id))throw Error('Undo retained approval');
  await close();await page.getByRole('button',{name:'Redo',exact:true}).click();await open();
  await panel.getByLabel('Variation seed').fill('studio-journey-two');await preview();await apply();artifact=await exported();
  if(!artifact.approved.includes(id)||artifact.region.buildings.find(b=>b.id===id).size[2]!==8)throw Error('Regeneration moved approved work');
  await close();await page.locator(`[data-item="${id}"]`).click();await page.getByRole('button',{name:'Delete object',exact:true}).click();
  await page.getByRole('button',{name:'Save on device',exact:true}).click();await page.reload();await page.waitForSelector('body[data-studio-ready="true"]');
  await page.screenshot({path:'output/playwright/neighborhood-authoring-scene.png'});await open();artifact=await exported();
  if(artifact.region.buildings.some(b=>b.id===id)||!artifact.overrides.some(o=>o.id===id&&o.value===null))throw Error('Save/reopen lost deletion history');
  await panel.getByLabel('Recipe or authoring JSON').setInputFiles({name:'authoring.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(artifact))});
  await preview();await apply();if((await exported()).sha256!==artifact.sha256)throw Error('Authoring round trip changed content');
  await panel.getByLabel('Recipe or authoring JSON').setInputFiles({name:'bad.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({...artifact,sha256:'bad'}))});
  await panel.getByRole('button',{name:'Preview candidate',exact:true}).click();await panel.getByRole('status').filter({hasText:'integrity'}).waitFor();
  if(!await panel.getByRole('button',{name:'Apply candidate',exact:true}).isDisabled())throw Error('Corrupt artifact became applicable');
  const architectureEvidence=[];
  for(const [label,count] of [['Garden Market',16],['Garden Court',6]]){
    await panel.getByRole('button',{name:`Use ${label}`,exact:true}).click();await preview();await apply();
    const current=await exported();await close();
    const stats=JSON.parse(await page.locator('#studio-viewport').getAttribute('data-neighborhood-stats'));
    if(stats.buildings!==count||stats.fallbacks!==0)throw Error(`${label} did not render its complete architecture`);
    await page.screenshot({path:`output/playwright/neighborhood-${current.recipe.id}.png`});
    architectureEvidence.push({id:current.recipe.id,...stats});
    if(label==='Garden Market'){
      const {compileNeighborhoodArchitecture}=await import('../../shared/neighborhood/architecture.js');
      const entry=compileNeighborhoodArchitecture(current).sockets.find(s=>s.role==='entry'&&s.rotation===0);
      if(!entry)throw Error('Market lacks a south-facing entry');
      await page.locator('[data-item="@arrival"]').click();
      for(const [label,value] of [['East (m)',entry.position[0]],['North (m)',entry.position[1]-3.5]]){
        await page.getByLabel(label,{exact:true}).fill(String(value));await page.getByLabel(label,{exact:true}).press('Tab');
      }
      await page.getByRole('button',{name:'Walk through',exact:true}).click();
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      await page.screenshot({path:'output/playwright/neighborhood-market-facade.png'});await page.keyboard.down('w');
      try{await page.waitForFunction(n=>Number(document.querySelector('#studio-position').textContent.match(/\/ ([\d.-]+) N/)?.[1])>n+.25,entry.position[1],{timeout:10000});}finally{await page.keyboard.up('w');}
      await page.screenshot({path:'output/playwright/neighborhood-market-entry.png'});
      await page.keyboard.press('Escape');
    }
    await open();
  }
  const phoneEvidence=[];
  for(const width of [390,320]){
    await page.setViewportSize({width,height:844});await page.screenshot({path:`output/playwright/neighborhood-authoring-phone-${width}.png`});
    const layout=await panel.evaluate(el=>({client:el.clientWidth,scroll:el.scrollWidth,overflowing:[...el.querySelectorAll('input,button,label')].filter(child=>child.getBoundingClientRect().right>el.getBoundingClientRect().right-1).map(child=>child.tagName+':'+(child.getAttribute('data-file')!==null?'file':child.textContent.trim()))}));
    if(layout.scroll>layout.client+1||layout.overflowing.length)throw Error(`Candidate panel overflows at ${width}px: ${JSON.stringify(layout)}`);
    phoneEvidence.push({width,...layout});
  }
  await panel.press('Escape');if(!await page.getByRole('button',{name:'Neighborhood',exact:true}).evaluate(el=>el===document.activeElement))throw Error('Close did not restore opener focus');
  if(errors.length)throw Error(errors.join('; '));
  return {passed:true,buildings:artifact.region.buildings.length,approved:artifact.approved.length,sha256:artifact.sha256,architectureEvidence,phoneEvidence,scope:'Local fixture Chromium: preview/apply/cancel, approvals, edit/undo/redo, reroll, save/reopen, export/import, two architectural candidates, real-key storefront entry and responsive panel. Not human or production acceptance.'};
}
