async page => {
  const checks=[], errors=[];
  const check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'reduce'});
  const current=await page.evaluate(()=>location.origin);
  await page.goto(current.startsWith('http')?current:'http://127.0.0.1:5173/');
  await page.evaluate(()=>{localStorage.removeItem('river-oaks-character');localStorage.removeItem('river-oaks-beast-movement');});
  await page.reload();
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  check(await page.locator('.character-picker').isVisible(),'Solo character picker is available');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  check(await page.locator('.character-option[data-option=variant]').isHidden(),'A person with one style shows no style switch');
  check(await page.locator('#player-beast-movement').isHidden(),'The humanoid default offers no beast movement');
  // Person, then style (where there is more than one), then form: each triple is one look.
  const choose=async (character,variant,form)=>{
    await page.locator(`input[name=player-character][value=${character}]`).check();
    if(await page.locator('.character-option[data-option=variant]').isVisible())await page.locator(`input[name=player-variant][value=${variant}]`).check();
    await page.locator(`input[name=player-form][value=${form}]`).check();
  };
  const looks=[
    ['jevica-beast','jevica','signature','beast','Rose enchantress · beast',null],
    ['sable-human','sable','signature','human','Fox charmer · humanoid',null],
    ['woman-casual','sable','signature','beast','Fox charmer · beast','sable-fox-turnaround'],
    ['rowan-human','rowan','signature','human','Wolf wanderer · humanoid',null],
    ['man-casual','rowan','signature','beast','Wolf wanderer · beast','rowan-wolf-turnaround'],
    ['woman-tailored','vesper','signature','human','Velvet confidante · humanoid','vesper-velvet-turnaround'],
    ['vesper-beast','vesper','signature','beast','Velvet confidante · beast',null],
    ['man-tailored','aurel','signature','human','Midnight host · humanoid','aurel-human'],
    ['midnight-host-wolf','aurel','signature','beast','Midnight host · beast','aurel-wolf'],
    ['lyra-human','lyra','signature','human','Lynx muse · humanoid','lyra-human'],
    ['woman-daywear','lyra','signature','beast','Lynx muse · beast','lyra-lynx'],
    ['man-workwear','kai','formal','human','Starlight maker · celestial formal · humanoid','kai-three-celestial-styles'],
    ['kai-formal-beast','kai','formal','beast','Starlight maker · celestial formal · beast',null],
    ['kai-explorer','kai','explorer','human','Starlight maker · explorer casual · humanoid','kai-three-celestial-styles'],
    ['kai-explorer-beast','kai','explorer','beast','Starlight maker · explorer casual · beast',null],
    ['kai-noir','kai','noir','human','Starlight maker · starlit noir · humanoid','kai-three-celestial-styles'],
    ['kai-noir-beast','kai','noir','beast','Starlight maker · starlit noir · beast',null],
    ['forest-aristocrat','silvan','masculine','human','Forest aristocrat · masculine · humanoid','forest-aristocrat-masculine'],
    ['forest-aristocrat-beast','silvan','masculine','beast','Forest aristocrat · masculine · beast',null],
    ['forest-aristocrat-feminine','silvan','feminine','human','Forest aristocrat · feminine · humanoid','forest-aristocrat-feminine'],
    ['forest-aristocrat-feminine-beast','silvan','feminine','beast','Forest aristocrat · feminine · beast',null],
  ];
  for(const [profile,character,variant,form,role,reference] of looks){
    await choose(character,variant,form);
    await page.waitForFunction(id=>{const host=document.querySelector('#canvas-host');return host.dataset.playerReady==='true'&&host.dataset.playerAppearance===id;},profile);
    check(await page.locator('#player-role').textContent()===role,`${profile}: identity and 3D appearance update`);
    check(await page.locator(`input[name=player-character][value=${character}]`).isChecked()&&await page.locator(`input[name=player-form][value=${form}]`).isChecked(),`${profile}: the picker shows the person and form`);
    check(await page.locator('#player-beast-movement').isVisible()===(form==='beast'),`${profile}: beast movement is offered only in a beast form`);
    check(await page.locator('#player-flight').isVisible()===(character==='jevica'),`${profile}: only Jevica is offered flight`);
    if(reference){
      check(await page.locator('.player-portrait img').isVisible(),`${profile}: reference portrait is visible`);
      check(await page.locator('#player-reference').getAttribute('href')===`/assets/characters/references/${reference}.png`,`${profile}: full reference is linked`);
    }else{
      await page.waitForFunction(()=>document.querySelector('.player-portrait img.live-portrait')?.src.startsWith('data:image/'),null,{timeout:15000});
      check(await page.locator('.player-portrait img').isVisible()&&await page.locator('#player-reference').isHidden(),`${profile}: a studio portrait of the 3D form stands in for reference art`);
    }
  }
  await page.reload();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  check(await page.locator('input[name=player-character][value=silvan]').isChecked()&&await page.locator('input[name=player-variant][value=feminine]').isChecked()&&await page.locator('input[name=player-form][value=beast]').isChecked(),'Solo person, style and form persist on this device');
  await page.evaluate(()=>localStorage.setItem('river-oaks-character','midnight-host-hybrid'));
  await page.reload();
  await page.waitForFunction(()=>{const host=document.querySelector('#canvas-host');return host.dataset.playerReady==='true'&&host.dataset.playerAppearance==='midnight-host-wolf';});
  check(await page.locator('input[name=player-character][value=aurel]').isChecked()&&await page.locator('input[name=player-form][value=beast]').isChecked(),'A saved wolf-eared host returns as his wolf form');
  await choose('jevica','signature','human');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true'&&document.querySelector('#canvas-host').dataset.playerAppearance==='jevica');
  for(const form of ['jevica']) {
    await page.waitForFunction(form=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&d.playerForm===form;},form);
    await page.locator('.player-portrait img').evaluate(img=>img.decode());
    check(await page.locator('.player-portrait img').evaluate(img=>img.complete&&img.naturalWidth>0),`${form}: real model portrait loads`);
    check(await page.locator('#player-description').textContent(),`${form}: description updates`);
    check(await page.locator('#player-camera').getAttribute('aria-pressed')==='true',`${form}: third-person camera`);
    await page.locator('#player-flight').click();
    await page.waitForFunction(()=>document.querySelector('#player-flight').getAttribute('aria-pressed')==='true');
    check(await page.locator('#canvas-host').getAttribute('data-flight-vehicle')===form,`${form}: matching flight vehicle`);
    await page.waitForFunction(()=>Number(document.querySelector('#walking-hud').dataset.altitude)>=3.4,{},{timeout:15000});
    await page.screenshot({path:`output/playwright/${form}-flight.png`});
    check(true,`${form}: completes ascent to cruising altitude`);
    await page.waitForFunction(()=>Number(document.querySelector('#walking-hud').dataset.altitude)>2);
    await page.locator('#canvas-host').focus();
    const before=Number(await page.locator('#walking-hud').getAttribute('data-altitude'));
    await page.keyboard.down('Space');
    try {
      await page.waitForFunction(before=>Number(document.querySelector('#walking-hud').dataset.altitude)>before+0.4,before,{timeout:5000});
    } finally {await page.keyboard.up('Space');}
    check(true,`${form}: ascent changes real altitude`);
    check(await page.locator('.walking-title strong').textContent()==='In flight',`${form}: HUD reflects flight`);
    await page.screenshot({path:`output/playwright/${form}-flight.png`});
    await page.keyboard.press('KeyB');
    await page.waitForFunction(()=>document.querySelector('#player-flight').getAttribute('aria-pressed')==='false'&&Number(document.querySelector('#walking-hud').dataset.altitude)===0);
    check(Number(await page.locator('#walking-hud').getAttribute('data-altitude'))===0,`${form}: landed at ground level`);
    await page.screenshot({path:`output/playwright/${form}-district.png`});
  }
  if(!await page.locator('.player-settings').evaluate(e=>e.open))await page.locator('.player-settings > summary').click();
  await page.locator('#player-camera').click();
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.cameraMode==='first');
  check(true,'First-person toggle');
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyV');
  check(await page.locator('#player-camera').getAttribute('aria-pressed')==='true','V restores third person');
  await page.evaluate(()=>document.documentElement.dataset.theme='dark');
  await page.screenshot({path:'output/playwright/jevica-ui-dark.png'});
  await page.setViewportSize({width:390,height:844});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  check(!await page.locator('.player-settings').evaluate(el=>el.open),'Mobile character controls start collapsed');
  check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'No mobile horizontal overflow');
  await page.screenshot({path:'output/playwright/jevica-ui-mobile.png'});
  await page.locator('.visit-tools-toggle').focus();await page.keyboard.press('Enter');
  check(await page.locator('#player-flight').isVisible(),'Keyboard expands character controls');
  check(await page.locator('#player-flight').evaluate(el=>el.getBoundingClientRect().height>=44),'44px flight target');
  await page.locator('.player-portrait img').evaluate(img=>img.decode());
  check(await page.locator('.player-portrait img').evaluate(img=>new URL(img.src).pathname)==='/assets/characters/jevica-portrait.png','Mobile portrait matches the current form');
  await page.screenshot({path:'output/playwright/jevica-ui-mobile-expanded.png'});
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,errors};
}
