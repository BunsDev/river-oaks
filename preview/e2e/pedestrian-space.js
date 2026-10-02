async page=>{
  const checks=[],errors=[];
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  const packet=async()=>{
    const request=await page.waitForRequest(request=>request.method()==='POST'&&request.url().endsWith('/v1/decisions'),{timeout:20000});
    return request.postDataJSON();
  };
  const visitors=body=>body.agents.flatMap(agent=>agent.nearby.filter(person=>person.id==='visitor').map(()=>agent.id));
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.charactersReady==='24'&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';},null,{timeout:90000});
  // Meet a resident, not the nearest someone: since the carriage arrived that
  // is Prince Jev, Jevica's companion, who has no decision agent of his own.
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=community-section]').click();
  const resident=await page.locator('#community-local option').evaluateAll(options=>options.map(option=>option.value).find(value=>value.startsWith('local-')));
  check(Boolean(resident),'A district resident can be met from the People panel');
  await page.locator('#community-local').selectOption(resident);
  await page.getByRole('button',{name:'Meet a local',exact:true}).click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});
  await page.locator('#community-close').click();
  await page.locator('#panel-toggle').click();
  const ground=await packet();
  check(visitors(ground).length>0,'Ground-level Jevica remains a nearby pedestrian');
  // Residents often stand under trees or the arcade, where take-off is refused
  // with a reason. Do what a player would: step into the open and try again.
  const refusals=[];
  for(let attempt=0;;attempt++) {
    await page.locator('#player-flight').click();
    const outcome=await Promise.race([
      page.waitForFunction(()=>document.querySelector('#walking-hud').dataset.flying==='true',null,{timeout:4000}).then(()=>'flying'),
      page.waitForFunction(()=>!document.querySelector('#walking-notice').hidden,null,{timeout:4000}).then(()=>'refused'),
    ]).catch(()=>'nothing');
    if(outcome==='flying')break;
    check(outcome==='refused','A refused take-off explains itself');
    refusals.push(await page.locator('#walking-notice').textContent());
    if(attempt>=6)throw new Error(`No open sky after ${attempt+1} tries: ${refusals.join(' | ')}`);
    await page.locator('#canvas-host').focus();await page.keyboard.down('ArrowLeft');await page.waitForTimeout(500);await page.keyboard.up('ArrowLeft');
    await page.keyboard.down('KeyW');await page.waitForTimeout(1400);await page.keyboard.up('KeyW');
  }
  await page.waitForFunction(()=>Number(document.querySelector('#walking-hud').dataset.altitude)>=3.4,null,{timeout:20000});
  const flight=await packet();
  check(visitors(flight).length===0,'Jevica overhead is excluded from ground avoidance context');
  check(await page.locator('#canvas-host').getAttribute('data-flight-vehicle')==='jevica','Flight uses Jevica’s bubble');
  await page.screenshot({path:'output/playwright/pedestrian-space-flight.png'});
  await page.locator('#player-flight').click();
  await page.waitForFunction(()=>document.querySelector('#walking-hud').dataset.flying==='false',null,{timeout:20000});
  const landed=await packet();
  check(visitors(landed).length>0,'Landing restores Jevica to pedestrian avoidance context');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('#destination').selectOption('osm-node-8172494967');
  await page.locator('#enter-destination').click();
  await page.waitForFunction(()=>document.querySelector('#walking-hud').dataset.inside==='osm-node-8172494967');
  const indoor=await packet();
  check(visitors(indoor).length===0,'Jevica inside a shop is excluded from street avoidance context');
  await page.getByRole('button',{name:'Meet someone nearby',exact:true}).click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});
  check((await page.locator('#community-local').inputValue()).startsWith('store-osm-node-8172494967-'),'Indoor conversations still select a person in this room');
  check(!errors.length,`No uncaught browser errors: ${errors.join('; ')}`);
  return {refusals,checks,counts:{ground:visitors(ground).length,flight:visitors(flight).length,landed:visitors(landed).length,indoor:visitors(indoor).length},errors,scope:'Actual controls and outgoing resident packets. Simulation state and network replies are not replaced.'};
}
