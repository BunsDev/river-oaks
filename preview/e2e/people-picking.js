async page => {
  const errors=[],checks=[];
  page.on('pageerror',error=>errors.push(error.message));
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  await page.setViewportSize({width:1440,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1');
  await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.storePeopleTotal&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';});
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
  await page.locator('[data-section=explore-section]').click();
  await page.locator('#destination').selectOption('osm-node-8172494967');
  await page.locator('#enter-destination').click();
  await page.waitForFunction(()=>document.querySelector('#walking-hud').dataset.inside==='osm-node-8172494967');
  await page.locator('#panel-toggle').click();
  await page.waitForTimeout(500); // Finish the rail's camera-viewport resize transition.
  check(await page.locator('#canvas-host').getAttribute('data-player-visible')==='true','Third-person body remains visible indoors');
  const start=await page.locator('#walking-hud').getAttribute('data-position');
  for(const suffix of [6,9]) {
    const id=`store-osm-node-8172494967-person-${suffix}`;
    const person=await page.evaluate(id=>window.__riverPeople().find(person=>person.id===id),id);
    check(person.visible&&person.reachable,`${id}: in reach and rendered`);
    await page.mouse.click(...person.screen);
    await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
    check(await page.locator('#community-local').inputValue()===id,`${id}: actual mesh click selects its identity`);
    check(await page.locator('#walking-hud').getAttribute('data-position')===start,`${id}: conversation does not teleport the visitor`);
    await page.locator('#community-close').click();
    await page.waitForTimeout(350);
  }
  const staff='store-osm-node-8172494967-person-9';
  await page.waitForTimeout(6500); // Recognition expires before work/attention sampling.
  const before=await page.evaluate(id=>window.__riverPeople().find(p=>p.id===id),staff);
  await page.waitForTimeout(800);
  const working=await page.evaluate(id=>window.__riverPeople().find(p=>p.id===id),staff);
  check(working.workTime>before.workTime,'Worker resumes their task after recognition and conversation');
  await page.mouse.click(...working.screen);
  await page.locator('#community-dialogue').waitFor({state:'visible'});
  const held=await page.evaluate(id=>window.__riverPeople().find(p=>p.id===id).workTime,staff);
  await page.waitForTimeout(700);
  const listening=await page.evaluate(id=>window.__riverPeople().find(p=>p.id===id),staff);
  check(listening.attention>0.9&&Math.abs(listening.workTime-held)<0.05,'Worker holds the task and attends during conversation');
  const feet=await page.evaluate(()=>window.__riverPeople().flatMap(p=>p.feet??[]));
  const error=Math.max(...feet.map(foot=>Math.hypot(...foot.actual.map((value,index)=>value-foot.target[index]))));
  check(feet.length>30&&error<0.001,'Actual seated rigs keep feet within 1 mm of planted targets');
  const contacts=await page.evaluate(()=>window.__riverPeople().flatMap(p=>p.task?.contacts??[]));
  const maxPalmError=Math.max(...contacts.map(contact=>contact.error));
  check(contacts.length>100&&maxPalmError<0.001,'Loaded workers support their props within 1 mm of each palm');
  await page.screenshot({path:'output/playwright/people-picking.png'});
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,seatedFeet:feet.length,maxFootError:error,palmContacts:contacts.length,maxPalmError,errors};
}
