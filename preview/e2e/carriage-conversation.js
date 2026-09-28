async page => {
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.charactersReady==='24'&&document.querySelector('#canvas-host')?.dataset.playerReady==='true');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
  const ids=await page.locator('#community-local option').evaluateAll(options=>options.map(o=>o.value).filter(id=>!id.startsWith('store-')));
  for(const id of ids) {
    await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();
    await page.locator('#community-dialogue').waitFor({state:'visible'});await page.locator('#community-close').click();
    if(!await page.locator('.player-settings').evaluate(e=>e.open))await page.locator('.player-settings > summary').click();
  await page.locator('#player-carriage').click();
    const distance=await page.evaluate(()=>{const c=window.__riverCarriage();return c.placement?Math.hypot(c.pose.position[0]-c.placement.position[0],c.pose.position[2]-c.placement.position[2]):Infinity;});
    if(distance>8)continue;
    await page.locator('#player-ride').click();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.riding==='true');
    await page.waitForTimeout(350);
    if(!await page.locator('#walking-talk').isVisible()){await page.locator('#player-ride').click();continue;}
    const before=await page.evaluate(()=>window.__riverCarriage());
    const bodyBefore=await page.evaluate(()=>window.__riverPlayerAttention());
    await page.locator('#walking-talk').click();await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
    await page.waitForTimeout(1200);
    const after=await page.evaluate(()=>window.__riverCarriage());
    const attention=await page.evaluate(()=>window.__riverPlayerAttention());
    if(attention.mode!=='conversation'||!attention.target||Math.abs(attention.bodyYaw-bodyBefore.bodyYaw)>.001)throw new Error('Mounted attention lost the partner or rotated the seated body');
    if(!after.riding||Math.hypot(...before.pose.position.map((v,i)=>v-after.pose.position[i]))>.001)throw new Error('Seated conversation moved or unmounted Jevica');
    if(errors.length)throw new Error(errors.join('; '));
    const name=await page.locator('#community-name').textContent();
    await page.screenshot({path:'output/playwright/carriage-conversation.png'});
    await page.locator('#community-close').click();await page.locator('#player-ride').click();
    return {checks:['Nearby conversation is available from the carriage','Talking retains the same mounted position','Dialogue opens for a real outdoor resident','Jevica attends to her partner without rotating the seated body'],name,attention,errors};
  }
  throw new Error('No mounted nearby conversation was verified');
}
