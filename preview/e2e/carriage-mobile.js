async page => {
 const context=await page.context().browser().newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
 await context.addCookies(await page.context().cookies());
 const phone=await context.newPage(),errors=[],checks=[];phone.on('pageerror',e=>errors.push(e.message));
 const check=(value,label)=>{if(!value)throw new Error(label);checks.push(label);};
 try {
  await phone.goto('http://127.0.0.1:5173/?motion-debug=1');
  await phone.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&document.querySelector('#canvas-host')?.dataset.carriageReady==='true');
  if(await phone.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await phone.locator('#panel-toggle').click();
  await phone.locator('.visit-tools-toggle').tap();
  if(!await phone.locator('.player-settings').evaluate(e=>e.open))await phone.locator('.player-settings summary').click();
  check(await phone.locator('#player-ride').evaluate(e=>e.getBoundingClientRect().height>=44),'Boarding has a 44px phone touch target');
  await phone.locator('#player-ride').tap();await phone.waitForFunction(()=>window.__riverCarriage().riding);
  await phone.locator('.player-settings summary').tap();
  if(await phone.locator('#walking-controls-toggle').getAttribute('aria-expanded')==='false')await phone.locator('#walking-controls-toggle').tap();
  const button=phone.locator('[data-walk-key=KeyW]'),box=await button.boundingBox(),client=await context.newCDPSession(phone);
  await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:box.x+box.width/2,y:box.y+box.height/2}]});
  try {await phone.waitForFunction(()=>window.__riverCarriage().placement.distance>.8,{},{timeout:10000});}
  finally {await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  check(true,'Holding the touch movement pad drives the mounted carriage');
  await phone.waitForFunction(()=>Math.abs(window.__riverCarriage().placement.speed)<.03);
  check(true,'Releasing the touch pad brakes the carriage');
  await phone.screenshot({path:'output/playwright/carriage-mobile.png'});
  await phone.locator('#walking-controls-toggle').tap();await phone.locator('.player-settings summary').tap();
  await phone.locator('#player-ride').tap();await phone.waitForFunction(()=>!window.__riverCarriage().riding);
  check(await phone.evaluate(()=>window.__riverCarriage().pose.showBody),'Phone dismount retains a visible third-person body');
  check(!await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Carriage controls do not overflow the phone viewport');
  check(errors.length===0,'No uncaught phone browser errors');await client.detach();
  return {checks,errors};
 } finally {await context.close();}
}
