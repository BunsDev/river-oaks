async page=>{
  const checks=[],errors=[];
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  const pose=()=>page.evaluate(()=>({position:JSON.parse(document.querySelector('#walking-hud').dataset.position),altitude:Number(document.querySelector('#walking-hud').dataset.altitude),flying:document.querySelector('#walking-hud').dataset.flying}));
  const read=id=>page.evaluate(id=>window.__riverPeople('spine_03').find(person=>person.id===id),id);
  const clickPerson=async id=>{
    const person=await read(id);
    check(person.visible&&person.reachable,'The elevated recipient is rendered and within talking reach');
    check(await page.evaluate(([x,y])=>Boolean(document.elementFromPoint(x,y)?.closest('#canvas-host')),person.screen),'The recipient projects outside UI overlays');
    await page.mouse.click(...person.screen);await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
    check(await page.locator('#community-local').inputValue()===id,'The actual flying mesh selects its own identity');
  };
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.charactersReady==='24'&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';},null,{timeout:90000});
  await page.getByRole('button',{name:'Meet someone nearby',exact:true}).click();
  await page.locator('#wish-choice').selectOption('flight');await page.locator('#wish-grant').click();
  const id=await page.locator('#community-local').inputValue();
  await page.waitForFunction(id=>window.__riverWishes().find(person=>person.id===id)?.height>=2.99,id);
  await page.locator('#community-close').click();
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.locator('#player-flight').click();
  await page.waitForFunction(()=>Number(document.querySelector('#walking-hud').dataset.altitude)>=3.5,null,{timeout:20000});
  const before=await pose();
  await clickPerson(id);await page.waitForTimeout(250);
  const after=await pose();
  check(after.flying==='true'&&Math.abs(after.altitude-before.altitude)<.02,'Pointer conversation preserves Jevica’s flight altitude');
  check(Math.hypot(...after.position.map((value,index)=>value-before.position[index]))<.02,'Pointer conversation does not move Jevica');
  await page.screenshot({path:'output/playwright/airborne-conversation.png'});
  await page.locator('#community-close').click();await page.locator('#canvas-host').focus();await page.keyboard.press('KeyE');
  await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
  check(await page.locator('#community-local').inputValue()===id,'Keyboard E addresses the same airborne recipient');
  check((await pose()).flying==='true','Keyboard conversation preserves flight');
  await page.locator('#community-close').click();await page.locator('#canvas-host').focus();await page.keyboard.down('Space');
  try {await page.waitForFunction(()=>Number(document.querySelector('#walking-hud').dataset.altitude)>9,null,{timeout:15000});}
  finally {await page.keyboard.up('Space');}
  check(!(await read(id)).reachable,'A distant vertical separation is outside talking range');
  await page.keyboard.press('KeyE');
  check(!await page.locator('#community-dialogue').isVisible(),'Keyboard E cannot open a distant airborne conversation');
  await page.locator('#player-flight').click();
  await page.waitForFunction(()=>document.querySelector('#walking-hud').dataset.flying==='false',null,{timeout:20000});
  await clickPerson(id);
  check((await pose()).altitude===0,'Talking to the recipient from below leaves Jevica grounded');
  await page.locator('#wish-undo').click();
  await page.waitForFunction(id=>!window.__riverWishes().find(person=>person.id===id)?.wish,id);
  check((await read(id)).reachable,'Undo restores ordinary grounded talking reach');
  check(!errors.length,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,id,before,after,errors,scope:'Real wish, flight, pointer and keyboard controls; no actor state injection.'};
}
