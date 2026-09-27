async page=>{
  const checks=[],errors=[];
  const check=(condition,message)=>{if(!condition)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(message.text()))errors.push(message.text());});
  await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:5181/?motion-debug=1');
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.carriageDriverReady==='true'&&window.__riverCarriage?.().placement);
  const panel=page.locator('#panel-toggle');if(await panel.getAttribute('aria-expanded')==='false')await panel.click();
  await page.locator('[data-section=explore-section]').click();await page.locator('#destination').selectOption({label:'Dior'});
  await page.locator('#visit-destination').click();await page.locator('#player-carriage').click();
  await page.locator('[data-section=community-section]').click();
  if(!await page.locator('#community-more').evaluate(element=>element.open))await page.locator('#community-more > summary').click();
  await page.locator('#community-local').selectOption('carriage-driver');await page.locator('#community-meet').click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});await page.locator('#community-close').click();
  check(await page.locator('#player-companion').getAttribute('aria-pressed')==='false','Companionship is opt-in');
  await page.locator('#player-companion').click();
  await page.waitForFunction(()=>window.__riverCarriage().companion.mode==='walking');
  await page.waitForFunction(()=>{const c=window.__riverCarriage();return Math.hypot(c.companion.position[0]-c.pose.position[0],c.companion.position[1]-c.pose.position[2])<2;},null,{timeout:30000});
  check(await page.locator('#player-ride').isDisabled()&&await page.locator('#player-carriage').isDisabled(),'The coach cannot depart or relocate while Jev is away');
  check(await page.locator('#player-companion-status').getAttribute('role')==='status','The companion state has an accessible announcement');
  check((await page.evaluate(()=>window.__riverPeople().filter(p=>p.id==='carriage-driver').length))===1,'Jev remains one stable rendered identity');
  const outside=await page.evaluate(()=>({companion:window.__riverCarriage().companion,person:window.__riverPeople().find(p=>p.id==='carriage-driver')}));
  check(outside.companion.carrying&&outside.person.visible,'The blonde adult prince carries the bag while accompanying Jevica');
  await page.screenshot({path:'output/playwright/jev-companion-outside.png'});
  await page.locator('[data-section=explore-section]').click();await page.locator('#visit-destination').click();
  await page.waitForFunction(()=>{const c=window.__riverCarriage();return Math.hypot(c.companion.position[0]-c.pose.position[0],c.companion.position[1]-c.pose.position[2])<2;},null,{timeout:60000});
  // The existing store UI places Jevica inside. Jev must navigate through
  // the real doorway and fixtures without sharing that visitor relocation.
  const before=await page.evaluate(()=>window.__riverCarriage().companion.position);
  await page.locator('#enter-destination').click();
  const immediately=await page.evaluate(()=>window.__riverCarriage().companion.position);
  check(Math.hypot(...before.map((v,i)=>v-immediately[i]))<1,'Entering a shop never teleports Jev');
  await page.waitForFunction(()=>window.__riverCarriage().pose.roomId&&window.__riverPeople().find(p=>p.id==='carriage-driver')?.reachable,null,{timeout:60000});
  const inside=await page.evaluate(()=>({pose:window.__riverCarriage().pose,companion:window.__riverCarriage().companion,person:window.__riverPeople().find(p=>p.id==='carriage-driver')}));
  check(inside.person.reachable&&inside.companion.carrying,'Jev follows into the boutique and remains conversational at his rendered position');
  await page.locator('[data-section=community-section]').click();await page.locator('#community-local').selectOption('carriage-driver');await page.locator('#community-meet').click();
  await page.locator('#community-dialogue').waitFor({state:'visible'});
  check((await page.locator('#community-name').textContent()).includes('Jev'),'His existing dialogue is available inside the shop');
  await page.screenshot({path:'output/playwright/jev-companion-shop.png'});await page.locator('#community-close').click();
  await page.locator('#player-companion').click();
  await page.waitForFunction(()=>window.__riverCarriage().companion.mode==='seat',null,{timeout:90000});
  check(!(await page.evaluate(()=>window.__riverCarriage().companion.carrying)),'Dismissal returns him to the coach and puts the bag away');
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyF');
  await page.waitForFunction(()=>!window.__riverCarriage().pose.roomId);
  check(await page.locator('#player-companion').getAttribute('aria-pressed')==='false','The invitation control resets after his return');
  check(!errors.length,'No browser or shader errors');
  return {checks,outside,inside,errors};
}
