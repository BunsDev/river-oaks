async page => {
  const checks=[],samples=[];
  const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
  await page.goto('http://127.0.0.1:5173/');
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  if(!await page.locator('.visit-tools').evaluate(node=>node.open))await page.locator('.visit-tools-toggle').click();
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.locator('input[name=player-character][value=sable]').check();
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='sable-human'&&document.querySelector('#canvas-host').dataset.playerReady==='true');
  for(const [id,form] of [['sable-human','human'],['rowan-human','human']]) {
    await page.locator(`input[name=player-form][value=${form}]`).check();
    await page.waitForFunction(id=>{const d=document.querySelector('#canvas-host').dataset;return d.playerAppearance===id&&d.playerReady==='true';},id);
    const sample=await page.evaluate(async id=>{
      const {characterDefinitionFor,characterAppearanceFor}=await import('/src/character-definition.js');
      const definition=characterDefinitionFor('fixture-owner',id),look=characterAppearanceFor(definition,'fixture-owner');
      const stamps=[];await new Promise(resolve=>{const frame=t=>{stamps.push(t);if(stamps.length<61)requestAnimationFrame(frame);else resolve();};requestAnimationFrame(frame);});
      const times=stamps.slice(1).map((t,i)=>t-stamps[i]).sort((a,b)=>a-b);
      return {id,rig:definition.rig,form:look.form,frameMs:{p50:times[30],p95:times[57]},renderStats:document.querySelector('#canvas-host').dataset.renderStats,canvas:[...document.querySelectorAll('#viewport canvas')].map(c=>[c.width,c.height]),userAgent:navigator.userAgent};
    },id);
    check(sample.form===form,`${id} resolves through the versioned contract`);
    check(sample.canvas.length>0,`${id} rendered on a real canvas`);
    await page.screenshot({path:`output/playwright/character-contract-${form}.png`});samples.push(sample);
  }
  return {passed:true,checks,samples,scope:'Whole-world fixture frame intervals, not isolated avatar performance or device acceptance'};
}
