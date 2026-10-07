async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(m.text()))errors.push(m.text());});
 const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:5181/?motion-debug=1');
 await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.carriageDriverReady==='true'&&window.__riverCarriage().princeVisible);
 const person=await page.evaluate(()=>(()=>{const c=window.__riverCarriage();return {id:'carriage-driver',visible:c.princeVisible,position:[c.princePosition[0],-c.princePosition[2]],reachable:Math.hypot(c.princePosition[0]-c.pose.position[0],c.princePosition[2]-c.pose.position[2])<3.5};})());
 check(person.visible,'The shared-town coachman is rendered');
 await page.screenshot({path:'output/playwright/carriage-driver-visible.png'});
 // Companion mode: he steps down, walks with Jevica, then returns to the bench.
 let reason='provider_401';
 await page.route('**/v1/companion',route=>{
  const packet=route.request().postDataJSON();
  return route.fulfill({json:{schema_version:1,tick:packet.tick,generation:packet.generation,source:'unavailable',reason,candidate_id:null,confidence:0}});
 });
 await page.locator('#player-companion').click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#canvas-host').dataset.companion??'{}').mode==='walking',null,{timeout:20000});
 for(const failure of ['provider_401','provider_429','provider_503','transport_error']) {
  reason=failure;
  await page.waitForFunction(value=>window.__riverCarriage().companion.reason===value,failure);
  check((await page.locator('#player-companion-status').textContent()).includes('Smart guidance unavailable'),`${failure}: local companion fallback explains the unavailable guidance`);
 }
 reason='context_changed';
 await page.waitForFunction(()=>window.__riverCarriage().companion.reason==='context_changed');
 check(!(await page.locator('#player-companion-status').textContent()).includes('Smart guidance unavailable'),'Healthy local companion changes do not claim a service outage');
 await page.unroute('**/v1/companion');
 await page.locator('#canvas-host').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(2500);await page.keyboard.up('KeyW');await page.waitForTimeout(1500);
 const companion=await page.evaluate(()=>({state:JSON.parse(document.querySelector('#canvas-host').dataset.companion),prince:(()=>{const c=window.__riverCarriage();return {id:'carriage-driver',visible:c.princeVisible,position:[c.princePosition[0],-c.princePosition[2]],reachable:Math.hypot(c.princePosition[0]-c.pose.position[0],c.princePosition[2]-c.pose.position[2])<3.5};})().position,rider:window.__riverCarriage().rider}));
 check(Math.hypot(companion.prince[0]-companion.rider[0],-companion.prince[1]-companion.rider[2])<3.5,'Prince Jev walks with Jevica in companion mode');
 check((await page.locator('#player-companion-status').textContent()).length>0&&['jev','local'].includes(companion.state.source),'Companion activity is visible and its actual decision source remains inspectable');
 await page.screenshot({path:'output/playwright/prince-companion.png'});
 await page.locator('#player-companion').click();
 await page.waitForFunction(()=>JSON.parse(document.querySelector('#canvas-host').dataset.companion).mode==='seat',null,{timeout:30000});
 if(!await page.locator('.player-settings').evaluate(e=>e.open))await page.locator('.player-settings > summary').click();
  await page.locator('#player-ride').click();await page.waitForFunction(()=>window.__riverCarriage().riding);
 const start=await page.evaluate(()=>(()=>{const c=window.__riverCarriage();return {id:'carriage-driver',visible:c.princeVisible,position:[c.princePosition[0],-c.princePosition[2]],reachable:Math.hypot(c.princePosition[0]-c.pose.position[0],c.princePosition[2]-c.pose.position[2])<3.5};})());
 await page.locator('#canvas-host').focus();await page.keyboard.down('KeyW');
 try{await page.waitForFunction(()=>window.__riverCarriage().placement.distance>3,null,{timeout:12000});}finally{await page.keyboard.up('KeyW');}
 await page.waitForTimeout(1000);
 const end=await page.evaluate(()=>(()=>{const c=window.__riverCarriage();return {id:'carriage-driver',visible:c.princeVisible,position:[c.princePosition[0],-c.princePosition[2]],reachable:Math.hypot(c.princePosition[0]-c.pose.position[0],c.princePosition[2]-c.pose.position[2])<3.5};})());
 check(Math.hypot(end.position[0]-start.position[0],end.position[1]-start.position[1])>2,'The same coachman identity travels with the moving carriage');
 check(!errors.length,'No uncaught browser errors');
 return {checks,person,companion,start,end,errors};
}
