async page=>{
  await page.goto('about:blank');
  const context=await page.context().browser().newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,reducedMotion:'no-preference'});
  // Since #98 every play mode passes the access gate: give this context the approved fixture account (as experience-runner.js does).
  await context.route('**/auth/session',route=>route.fulfill({json:{authenticated:true,user:{id:'user_01M40Y914S1H4EJCEHH91DKTAY',name:'Jevica'},csrfToken:'solo-fixture'}}));await context.route('**/api/waitlist/status',route=>route.fulfill({json:{status:'approved',admin:false}}));
  const phone=await context.newPage(),checks=[],errors=[];
  let phase='load';
  phone.on('pageerror',error=>errors.push(error.message));
  const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
  try {
    await phone.goto('http://127.0.0.1:5181/?motion-debug=1');
    await phone.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.charactersReady==='24'&&d.playerReady==='true';},null,{timeout:90000});
    if(await phone.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await phone.locator('#panel-toggle').tap();
    await phone.locator('.visit-tools-toggle').tap();
    await phone.locator('.force-controls summary').tap();await phone.locator('#force-toggle').tap();
    phase='choose target';
    await phone.waitForFunction(()=>[...document.querySelector('#force-target').options].some(option=>option.value));
    const id=await phone.locator('#force-target').inputValue();
    const before=await phone.evaluate(id=>window.__riverForce().targets.find(t=>t.id===id).position,id);
    for(const id of ['force-lift','force-push','force-lower'])check(await phone.locator(`#${id}`).evaluate(e=>e.getBoundingClientRect().height>=44),`${id} has a 44px touch target`);
    await phone.locator('#force-lift').tap();
    phase='lift';
    await phone.waitForFunction(y=>window.__riverForce().active?.position[1]>y+1,before[1]);
    check(true,'Touch controls lift a real nearby person');
    const fx=await phone.evaluate(()=>window.__riverLiftSparkles());
    check(fx.wand>0&&fx.target>0,'Both sparkle emitters render on touch devices');
    if(await phone.locator('#walking-controls-toggle').getAttribute('aria-expanded')==='false')await phone.locator('#walking-controls-toggle').tap();
    const start=await phone.evaluate(()=>window.__riverCarriage().pose.position);
    phase='touch carry';
    const pad=await phone.locator('[data-walk-key=KeyS]').boundingBox(),client=await context.newCDPSession(phone);
    await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:pad.x+pad.width/2,y:pad.y+pad.height/2}]});
    try {await phone.waitForFunction(start=>{const p=window.__riverCarriage().pose.position;return Math.hypot(p[0]-start[0],p[2]-start[2])>.2;},start,{timeout:8000});}
    finally {await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await client.detach();}
    check(await phone.evaluate(()=>window.__riverForce().active?.mode==='lift'),'Holding the real touch pad walks while preserving the lift');
    const layout=await phone.evaluate(()=>({tools:document.querySelector('.visit-tools').getBoundingClientRect().bottom,pad:document.querySelector('.walking-console').getBoundingClientRect().top}));
    check(layout.tools<=layout.pad,'Spell tools do not overlap the open movement pad');
    await phone.screenshot({path:'output/playwright/force-mobile.png'});
    await phone.locator('#force-lower').tap();await phone.waitForFunction(()=>!window.__riverForce().active,null,{timeout:12000});
    check(true,'Touch controls land and release the target');
    check(!await phone.evaluate(()=>document.documentElement.scrollWidth>innerWidth),'Force controls fit the phone viewport');
    phase='reduced load';await phone.emulateMedia({reducedMotion:'reduce'});await phone.reload();
    await phone.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.charactersReady==='24'&&d.playerReady==='true';},null,{timeout:90000});
    await phone.locator('.visit-tools-toggle').tap();
    await phone.locator('.force-controls summary').tap();await phone.locator('#force-toggle').tap();
    phase='reduced target';
    check(await phone.locator('#force-lift').isDisabled(),'A reduced-motion spawn with no nearby target cannot cast accidentally');
    check((await phone.locator('#force-target').textContent()).includes('No target in reach'),'The empty target list explains why lifting is unavailable');
    // Reduced motion leaves residents at their initial positions. Approach via
    // the normal directory instead of waiting for a walker to enter the range.
    await phone.locator('#panel-toggle').tap();await phone.locator('#rail-tab-0').tap();
    await phone.locator('#community-local').selectOption('local-00');await phone.locator('#community-meet').tap();
    await phone.locator('#community-dialogue').waitFor({state:'visible'});await phone.locator('#community-close').tap();await phone.locator('#panel-toggle').tap();
    await phone.waitForFunction(()=>document.querySelector('#force-target').options.length>0&&!document.querySelector('#force-lift').disabled);
    await phone.locator('#force-target').selectOption('local-00');
    await phone.locator('#force-lift').tap();
    phase='reduced glimmers';
    await phone.waitForFunction(()=>window.__riverLiftSparkles().count===10);
    check(await phone.evaluate(()=>window.__riverLiftSparkles().reducedMotion),'Reduced motion uses a small stationary glimmer field');
    await phone.screenshot({path:'output/playwright/force-mobile-reduced.png'});
    await phone.locator('#force-lower').tap();await phone.waitForFunction(()=>!window.__riverForce().active&&window.__riverLiftSparkles().count===0,null,{timeout:12000});
    check(true,'Reduced-motion effects clear after release');
    check(!errors.length,'No uncaught phone errors');return {checks,id,errors};
  }catch(error){
    const state=await phone.evaluate(()=>({active:window.__riverForce?.().active,fx:window.__riverLiftSparkles?.(),status:document.querySelector('#force-status')?.textContent,checks:[...document.querySelector('#force-target').options].map(o=>o.value)}));
    throw new Error(`${phase}: ${error.message}; ${JSON.stringify({checks,state})}`);
  }finally{await context.close();}
}
