async page => {
  const origin='http://127.0.0.1:5173',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  const visit=async tab=>{
    tab.on('pageerror',error=>errors.push(error.message));
    await tab.goto(`${origin}/?motion-debug=1`,{waitUntil:'commit'});
    await tab.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true');
    if(await tab.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await tab.locator('#panel-toggle').click();
    await tab.locator('[data-section=community-section]').click();
    if(!await tab.locator('#community-more').evaluate(node=>node.open))await tab.locator('#community-more > summary').click();
    await tab.locator('#community-local').selectOption('local-00');
    await tab.locator('#community-meet').click();
    await tab.locator('#community-dialogue').waitFor({state:'visible'});
  };
  await visit(page);
  await page.waitForFunction(()=>!document.querySelector('#wish-grant')?.hidden);
  const owner=await page.request.get(`${origin}/auth/session`);
  check((await owner.json()).canGrantWishes===true,'The development owner receives Jevica permission');
  check(!await page.locator('#wish-grant').isDisabled(),'Jevica can grant a solo wish after server verification');
  const guestContext=await page.context().browser().newContext();
  try {
    const guest=await guestContext.newPage();await visit(guest);
    const session=await (await guest.request.get(`${origin}/auth/session`)).json();
    check(session.canGrantWishes===false,'Another identity has no Jevica permission');
    check(await guest.locator('#wish-grant').evaluate(node=>node.hidden),'A solo guest cannot access wish granting');
    check(!await guest.locator('.shared-build-controls').isVisible(),'Solo guests cannot build');
  } finally {await guestContext.close();}
  check(errors.length===0,`No browser errors: ${errors.join('; ')}`);
  return {passed:true,checks,errors};
}
