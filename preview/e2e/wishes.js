async page => {
  const checks=[],errors=[];
  const check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  const origin=await page.evaluate(()=>location.origin==='null'?'http://127.0.0.1:5181':location.origin);
  await page.goto(`${origin}/?motion-debug=1`);
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.charactersReady==='24');
  check(await page.locator('#player-form').count()===0,'Jevica has no alternate character selector');
  check(await page.locator('#canvas-host').getAttribute('data-player-form')==='jevica','Jevica is loaded');
  await page.getByRole('button',{name:'Meet someone nearby',exact:true}).click();
  await page.locator('#wish-grant').waitFor({state:'visible'});
  check(JSON.stringify(await page.locator('#wish-choice option').evaluateAll(options=>options.map(option=>option.value)))===JSON.stringify(['dragon','flight','invisibility','mind-reading','dog']),'All five wishes are offered');
  for(const kind of ['dragon','flight','invisibility','mind-reading','dog']) {
    await page.locator('#wish-choice').selectOption(kind);
    await page.locator('#wish-grant').click();
    await page.waitForFunction(()=>document.querySelector('.wish-card').dataset.phase==='gift');
    check(await page.locator('#wish-grant').isDisabled(),`${kind}: cannot stack a second wish`);
    check(await page.locator('#wish-undo').evaluate(element=>element===document.activeElement),`${kind}: keyboard focus moves to undo`);
    await page.waitForFunction(()=>document.querySelector('.wish-card').dataset.phase==='pleading',null,{timeout:60000});
    check(await page.locator('.wish-journal').getAttribute('data-trouble')==='1',`${kind}: town incident recorded`);
    check((await page.locator('#wish-status').textContent()).includes('Jevica'),`${kind}: resident asks for removal`);
    const visual=await page.evaluate(()=>window.__riverWishes().find(person=>person.wish));
    check(visual?.modelReady,`${kind}: resident uses the loaded rig`);
    if(kind==='dragon')check(visual.props.includes('Wish dragon')&&!visual.props.includes('Wish egg'),'Egg visibly hatches into dragon');
    if(kind==='flight')check(visual.height>=2.9,'Flight lifts the actual resident');
    if(kind==='invisibility')check(visual.skin===0&&visual.clothes>0,'Invisible body keeps visible clothing');
    if(kind==='mind-reading')check(visual.props.includes('Wish tears'),'Mind reader shows sadness');
    if(kind==='dog')check(!visual.bodyVisible&&visual.props.includes('Wish dog'),'Dog replaces the human body');
    await page.screenshot({path:`output/playwright/wish-${kind}.png`});
    await page.locator('#wish-undo').click();
    await page.waitForFunction(()=>document.querySelector('.wish-card').dataset.phase==='ready');
    await page.waitForFunction(()=>window.__riverWishes().every(person=>!person.wish && !person.props.length && person.bodyVisible));
    check(await page.evaluate(()=>window.__riverWishes().every(person=>!person.wish && !person.props.length && person.bodyVisible)),`${kind}: undo restores rendered residents`);
    check(await page.locator('.wish-journal').getAttribute('data-trouble')==='0',`${kind}: undo clears incident`);
    check(await page.locator('#wish-choice').evaluate(element=>element===document.activeElement),`${kind}: keyboard focus returns to choice`);
  }
  check((await page.locator('#wish-town-status').textContent()).includes('5 undone'),'All five wishes removed');
  await page.setViewportSize({width:390,height:844});
  check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'No mobile horizontal overflow');
  await page.locator('#wish-choice').selectOption('dog');await page.locator('#wish-grant').click();
  check(await page.locator('#wish-undo').evaluate(element=>element.getBoundingClientRect().height>=44),'Mobile undo is a 44px target');
  await page.screenshot({path:'output/playwright/wish-mobile.png'});
  await page.locator('#wish-undo').click();
  check(!errors.length,`No uncaught errors: ${errors.join('; ')}`);
  return {checks,errors,scope:'Browser preview wish lifecycle through real controls; no native Unreal acceptance.'};
}
