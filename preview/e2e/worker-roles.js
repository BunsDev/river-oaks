async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const errors=[],workers=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>{
    const d=document.querySelector('#canvas-host').dataset;
    return (document.querySelector('#canvas-host')?.dataset.multiplayer==='joined')&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';
  },null,{timeout:90000});
  const catalog=await page.evaluate(async()=>{
    const {storeRoomsFor}=await import('/src/store-rooms.js');
    const {createStoreEncounters,storePersonId}=await import('/src/store-encounters.js');
    const {workPropKind}=await import('/src/work-props.js');
    const rooms=storeRoomsFor(await (await fetch('/data/district.json')).json());
    const locals=createStoreEncounters(rooms);
    return {staff:rooms.flatMap(room=>room.people.flatMap((spot,index)=>{
      if(spot.role!=='staff')return [];
      const local=locals.find(person=>person.id===storePersonId(room,index));
      return [{id:local.id,role:local.role,venue:room.name,theme:room.theme,station:spot.pose,task:workPropKind(room.theme,spot.pose),fixtures:room.summary.highlights}];
    })),guest:locals.find(local=>local.role==='Dining guest').id};
  });
  if(catalog.staff.length!==62)throw new Error(`Expected 62 workers, got ${catalog.staff.length}`);
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await openHudSpace(page, 'community-section');
  if(!await page.locator('#community-more').evaluate(element=>element.open))await page.locator('#community-more > summary').click();
  const visit=async id=>{
    await page.locator('#community-local').selectOption(id);await page.locator('#community-meet').click();
    await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
    await page.waitForFunction(id=>window.__riverPeople().find(person=>person.id===id)?.reachable,id,{timeout:5000});
  };
  for(const worker of catalog.staff) {
    await visit(worker.id);
    await page.getByRole('button',{name:'About your work',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.community-topics').getAttribute('aria-busy')==='false');
    const about=await page.locator('#community-speech').textContent();
    if(!about.includes(worker.role.toLowerCase())||!about.includes(worker.venue))throw new Error(`Missing workplace introduction: ${worker.id}`);
    await page.getByRole('button',{name:'A detail from your work',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('.community-topics').getAttribute('aria-busy')==='false');
    const story=await page.locator('#community-speech').textContent();
    if(!story||story===about||story.includes('What I love about a familiar place'))throw new Error(`Generic work story: ${worker.id}`);
    const pose=await page.evaluate(id=>window.__riverPeople().find(person=>person.id===id),worker.id);
    if(!pose.visible||pose.task?.kind!==worker.task)throw new Error(`Missing rendered worker task: ${worker.id}`);
    await page.waitForTimeout(120);
    const held=await page.evaluate(id=>window.__riverPeople().find(person=>person.id===id).workTime,worker.id);
    if(held!==pose.workTime)throw new Error(`Work continues during conversation: ${worker.id}`);
    await page.locator('#community-close').click();
    await page.waitForFunction(({id,time})=>window.__riverPeople().find(person=>person.id===id).workTime>time,{id:worker.id,time:held},{timeout:7000});
    await visit(worker.id);
    const returning=await page.locator('#community-speech').textContent();
    if(!returning.includes('Welcome back')||!returning.includes(worker.role.toLowerCase()))throw new Error(`Return greeting lost occupation: ${worker.id}`);
    workers.push({...worker,about,story,returning,workPaused:true,workResumed:true});
    await page.locator('#community-close').click();
  }
  const stories=new Map(workers.map(worker=>[worker.role,worker.story]));
  if(new Set(stories.values()).size!==stories.size)throw new Error('Occupations share a generic work story');
  await visit(catalog.guest);
  if(await page.getByRole('button',{name:'About your work',exact:true}).count())throw new Error('Guest mislabeled as a worker');
  await page.getByRole('button',{name:'What brings you here?',exact:true}).waitFor({state:'visible'});
  await page.screenshot({path:'output/playwright/worker-role-guest.png'});
  await page.locator('#community-close').click();
  const perfumer=workers.find(worker=>worker.role==='Perfumer');
  await visit(perfumer.id);await page.getByRole('button',{name:'A detail from your work',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.community-topics').getAttribute('aria-busy')==='false');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  await page.screenshot({path:'output/playwright/worker-role-perfumer.png'});
  if(errors.length)throw new Error(errors.join('; '));
  return {workers,roles:stories.size,guest:catalog.guest,errors,scope:'All rendered workers: real topic controls, authored role dialogue, return memory and task pause/resume. No mocked reactions or actor state.'};
}
