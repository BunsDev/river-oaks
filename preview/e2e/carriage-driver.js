async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(m.text()))errors.push(m.text());});
 const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
 await page.setViewportSize({width:1440,height:1000});await page.goto('http://127.0.0.1:5181/?motion-debug=1');
 await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.carriageDriverReady==='true'&&window.__riverPeople().some(p=>p.id==='carriage-driver'&&p.visible));
 if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='false')await page.locator('#panel-toggle').click();
 await page.locator('[data-section=community-section]').click();
 if(!await page.locator('#community-more').evaluate(e=>e.open))await page.locator('#community-more > summary').click();
 await page.locator('#community-local').selectOption('carriage-driver');await page.locator('#community-meet').click();
 await page.locator('#community-dialogue').waitFor({state:'visible',timeout:10000});
 check((await page.locator('#community-name').textContent()).includes('Jules'),'The directory opens a real conversation with Jules');
 const person=await page.evaluate(()=>window.__riverPeople().find(p=>p.id==='carriage-driver'));
 check(person.visible&&person.reachable,'The rendered coachman is within speaking reach');
 await page.screenshot({path:'output/playwright/carriage-driver-conversation.png'});
 await page.locator('#community-close').click();await page.locator('#panel-toggle').click();
 await page.waitForTimeout(350);await page.screenshot({path:'output/playwright/carriage-driver-visible.png'});
 const point=await page.evaluate(()=>window.__riverPeople('spine_03').find(p=>p.id==='carriage-driver').screen);
 await page.mouse.click(...point);await page.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
 check((await page.locator('#community-name').textContent()).includes('Jules'),'A real pointer click on the coachman opens his conversation');
 await page.locator('#community-close').click();
 await page.locator('#player-ride').click();await page.waitForFunction(()=>window.__riverCarriage().riding);
 const start=await page.evaluate(()=>window.__riverPeople().find(p=>p.id==='carriage-driver'));
 await page.locator('#canvas-host').focus();await page.keyboard.down('KeyW');
 try{await page.waitForFunction(()=>window.__riverCarriage().placement.distance>3,null,{timeout:12000});}finally{await page.keyboard.up('KeyW');}
 await page.waitForTimeout(1000);
 const end=await page.evaluate(()=>window.__riverPeople().find(p=>p.id==='carriage-driver'));
 check(Math.hypot(end.position[0]-start.position[0],end.position[1]-start.position[1])>2,'The same coachman identity travels with the moving carriage');
 check(!errors.length,'No uncaught browser errors');
 return {checks,person,start,end,errors};
}
