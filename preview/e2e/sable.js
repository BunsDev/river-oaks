async page => {
  const errors=[],checks=[];page.on('pageerror',error=>errors.push(error.message));
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  if(await page.locator('#people-toggle').getAttribute('aria-expanded')==='true')await page.locator('#people-toggle').click();
  if(!await page.locator('.visit-tools').evaluate(el=>el.open))await page.locator('.visit-tools-toggle').click();
  await page.locator('input[name=player-character][value=sable]').check();
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerAppearance==='sable-human'&&document.querySelector('#canvas-host').dataset.playerReady==='true');
  if(await page.locator('input[name=player-form]').count())throw new Error('Retired form selector remains');
  checks.push('Sable renders as a human without a form selector');
  await page.reload();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  if(await page.locator('#canvas-host').getAttribute('data-player-appearance')!=='sable-human')throw new Error('Human appearance was not retained');
  checks.push('Human identity survives reload');if(errors.length)throw new Error(errors.join('; '));return {checks,errors};
}
