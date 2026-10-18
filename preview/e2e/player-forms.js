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
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.multiplayer==='joined');
  if(!await page.locator('.visit-tools').evaluate(node=>node.open))await page.locator('.visit-tools-toggle').click();
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  check(await page.locator('.character-picker').isVisible(),'Authenticated character picker is available');
  check(await page.locator('.character-option[data-option=variant]').isHidden(),'A person with one style shows no style switch');
  // Person, then style (where there is more than one), then form: each triple is one look.
  const choose=async (character,variant,form)=>{
    const settled=async expected=>page.waitForFunction(async expected=>{
      const {sharedAppearance}=await import('/src/shared-appearances.js');
      const host=document.querySelector('#canvas-host'),current=sharedAppearance(host.dataset.playerAppearance);
      return host.dataset.playerReady==='true'&&Object.entries(expected).every(([key,value])=>current[key]===value);
    },expected);
    await page.locator(`input[name=player-character][value=${character}]`).check();
    await settled({character});
    if(await page.locator('.character-option[data-option=variant]').isVisible()){
      await page.locator(`input[name=player-variant][value=${variant}]`).check();
      await settled({character,variant});
    }
    await settled({character,form});
  };
  const looks=[
    ['sable-human','sable','signature','human','City storyteller · human',null],
    ['rowan-human','rowan','signature','human','City wanderer · human',null],
    ['woman-tailored','vesper','signature','human','Velvet confidante · human','vesper-velvet-turnaround'],
    ['man-tailored','aurel','signature','human','Midnight host · human','aurel-human'],
    ['lyra-human','lyra','signature','human','Velvet muse · human','lyra-human'],
    ['man-workwear','kai','formal','human','Starlight maker · celestial formal · human','kai-three-celestial-styles'],
    ['kai-explorer','kai','explorer','human','Starlight maker · explorer casual · human','kai-three-celestial-styles'],
    ['kai-noir','kai','noir','human','Starlight maker · starlit noir · human','kai-three-celestial-styles'],
    ['forest-aristocrat','silvan','masculine','human','Forest aristocrat · masculine · human','forest-aristocrat-masculine'],
    ['forest-aristocrat-feminine','silvan','feminine','human','Forest aristocrat · feminine · human','forest-aristocrat-feminine'],
  ];
  for(const [profile,character,variant,form,role,reference] of looks){
    await choose(character,variant,form);
    await page.waitForFunction(id=>{const host=document.querySelector('#canvas-host');return host.dataset.playerReady==='true'&&host.dataset.playerAppearance===id;},profile);
    check(await page.locator('#player-role').textContent()===role,`${profile}: identity and 3D appearance update`);
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
  await page.evaluate(()=>localStorage.setItem('river-oaks-character','midnight-host-hybrid'));
  await page.reload();
  await page.waitForFunction(()=>{const host=document.querySelector('#canvas-host');return host.dataset.playerReady==='true'&&host.dataset.playerAppearance==='forest-aristocrat-feminine';});
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
  const rememberedPlayOpen=await page.locator('.visit-tools').evaluate(el=>el.open);
  await page.setViewportSize({width:390,height:844});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  check(!await page.locator('.player-settings').evaluate(el=>el.open),'Mobile character controls start collapsed');
  check(await page.locator('.visit-tools').evaluate(el=>el.open)===rememberedPlayOpen,'The chosen play-rail state survives a mobile reload');
  check(!await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'No mobile horizontal overflow');
  await page.screenshot({path:'output/playwright/jevica-ui-mobile.png'});
  if(await page.locator('.visit-tools').evaluate(el=>el.open))await page.locator('.visit-tools-toggle').click();
  await page.locator('.visit-tools-toggle').focus();await page.keyboard.press('Enter');
  check(await page.locator('#player-flight').isVisible(),'Keyboard expands character controls');
  check(await page.locator('#player-flight').evaluate(el=>el.getBoundingClientRect().height>=44),'44px flight target');
  await page.locator('.player-portrait img').evaluate(img=>img.decode());
  check(await page.locator('.player-portrait img').evaluate(img=>new URL(img.src).pathname)==='/assets/characters/jevica-portrait.png','Mobile portrait matches the current form');
  await page.screenshot({path:'output/playwright/jevica-ui-mobile-expanded.png'});
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,errors};
}
