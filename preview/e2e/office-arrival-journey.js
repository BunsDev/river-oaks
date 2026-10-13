async page => {
  const checks=[],captures=[],route=[],errors=[],stage=process.env.RIVER_OAKS_ARRIVAL_STAGE??'refined';
  if(!/^[a-z-]+$/.test(stage))throw new Error('Invalid capture stage');
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
  const shot=async name=>{const path=`output/playwright/office-arrival-journey-${stage}-${name}.png`;await page.screenshot({path});captures.push(path);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  const site=await page.evaluate(async()=>{
    const {officesFor}=await import('/src/office-contract.js'),world=await(await fetch('/data/district.json')).json(),o=officesFor(world)[0],n=o.outward,u=[-n[1],n[0]],at=(along,out)=>o.facade.map((v,i)=>v+u[i]*along+n[i]*out);
    // Fixture setup uses the existing authoritative travel path to open street.
    // All scoped approach and return legs below use normal pointer/key controls.
    const start=at(6,7.5),result=await window.__riverSeatAndWater().goTo(...start);
    return {office:o,start,approach:at(0,7.5),travel:result};
  });
  if(!site.travel?.ok)throw new Error(`Authoritative approach setup failed: ${JSON.stringify(site.travel)}`);
  check(true,'Authoritative setup lands on the approach street');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
  if(await page.locator('.visit-tools').evaluate(n=>n.open))await page.locator('.visit-tools-toggle').click();
  async function walk(target,name){
    const start=Date.now(),samples=[];
    try{
      while(true){
        const pose=await page.evaluate(()=>window.__riverCarriage().pose),dx=target[0]-pose.position[0],dz=-target[1]-pose.position[2];
        samples.push({ms:Date.now()-start,position:pose.position});
        if(Math.hypot(dx,dz)<.2)break;
        if(Date.now()-start>60000)throw new Error(`${name} stalled: ${JSON.stringify({target,pose})}`);
        const desired=Math.atan2(-dx,-dz),difference=Math.atan2(Math.sin(desired-pose.yaw),Math.cos(desired-pose.yaw));
        if(Math.abs(difference)>.04){
          await page.keyboard.up('KeyW');const rect=await page.locator('#canvas-host').boundingBox(),x=rect.x+rect.width/2,y=rect.y+rect.height*.4,drag=Math.max(-rect.width*.35,Math.min(rect.width*.35,-difference/.003));
          await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+drag,y,{steps:3});await page.mouse.up();
        }else{await page.locator('#canvas-host').focus();await page.keyboard.down('KeyW');await page.waitForTimeout(50);if(Math.hypot(dx,dz)<1)await page.keyboard.up('KeyW');}
      }
    }finally{await page.keyboard.up('KeyW');}
    route.push({name,target,samples});check(true,`${name} completes using normal walking controls`);
  }
  await walk(site.approach,'street-approach');await shot('approach');
  await walk(site.office.entrance,'entrance');await shot('entrance');
  // Presentation settings use the actual atmosphere controls in the district,
  // including its sky, exposure and reflections, not a sun-only fixture proxy.
  const lighting=await page.evaluate(()=>({hour:document.querySelector('#sun-hour').value,weather:document.querySelector('#weather').value}));
  await page.locator('#weather').evaluate(n=>{n.value='clear';n.dispatchEvent(new Event('change',{bubbles:true}));});
  for(const [name,hour]of [['day',15],['dusk',18.5],['night',21]]){
    await page.locator('#sun-hour').evaluate((n,hour)=>{n.value=String(hour);n.dispatchEvent(new Event('input',{bubbles:true}));},hour);
    await page.waitForTimeout(1000);await shot(`entrance-${name}`);
  }
  await page.evaluate(({hour,weather})=>{const h=document.querySelector('#sun-hour'),w=document.querySelector('#weather');h.value=hour;w.value=weather;h.dispatchEvent(new Event('input',{bubbles:true}));},lighting);
  await page.waitForFunction(()=>!document.querySelector('#office-enter').disabled);
  await page.waitForFunction(target=>{const m=window.__riverMultiplayer(),p=m.snapshot.players.find(p=>p.id===m.selfId);return Math.hypot(p.position[0]-target[0],p.position[1]-target[1])<.5;},site.office.entrance);
  check(true,'Server position agrees with the walked entrance');
  const layouts=[],presentations=[];
  await page.evaluate(()=>{
    window.officeObservedPhases=[];
    new MutationObserver(()=>{const phase=document.querySelector('#office-visit').dataset.phase;if(window.officeObservedPhases.at(-1)?.phase!==phase)window.officeObservedPhases.push({phase,time:performance.now(),view:window.__riverOffice()});}).observe(document.querySelector('#office-visit'),{attributes:true,attributeFilter:['data-phase']});
  });
  for(const [width,height]of [[1440,1000],[768,1024],[390,844],[320,700]]){
    await page.setViewportSize({width,height});await page.locator('#canvas-host').focus();await page.keyboard.press('KeyF');
    await page.waitForFunction(()=>['lobby','office'].includes(document.querySelector('#office-visit')?.dataset.phase),null,{timeout:60000});
    const phase=await page.locator('#office-visit').getAttribute('data-phase');
    if(phase!=='lobby')throw new Error(`${width}px skipped lobby: ${JSON.stringify(await page.evaluate(()=>window.officeObservedPhases))}`);
    check(true,`${width}px starts with a visible lobby lead-in`);await shot(`${width}-lobby`);
    await page.waitForFunction(()=>document.querySelector('#office-visit')?.dataset.phase==='boarding',null,{timeout:60000});await shot(`${width}-boarding`);
    await page.waitForFunction(()=>document.querySelector('#office-visit')?.dataset.phase==='ascending');await shot(`${width}-cabin`);
    const cabin=await page.evaluate(()=>window.__riverOffice());
    check(cabin?.presentation==='shared-world'&&cabin.elevation>=0,`${width}px elevator uses the street scene and camera`);presentations.push({width,cabin});
    await page.waitForFunction(()=>document.querySelector('#office-visit')?.dataset.phase==='arriving');await shot(`${width}-reveal`);
    await page.waitForFunction(()=>document.querySelector('#office-visit')?.dataset.phase==='office');await shot(`${width}-office`);
    const arrival=await page.evaluate(()=>window.__riverOffice());check(Math.abs(arrival.elevation-24.3)<.001,`${width}px elevator reaches level 6`);
    const layout=await page.locator('#office-visit').evaluate(dialog=>{
      const rect=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height};};
      const controls=[...dialog.querySelectorAll('button')].filter(n=>n.getClientRects().length&&!n.closest('[hidden]')).map(n=>({id:n.id,text:n.textContent,...rect(n)}));
      return {width:innerWidth,height:innerHeight,header:rect(dialog.querySelector('header')),controls,overflow:dialog.scrollWidth>dialog.clientWidth};
    });
    layouts.push(layout);check(!layout.overflow&&layout.controls.every(b=>b.x>=0&&b.right<=width+.5&&b.y>=0&&b.bottom<=height+.5&&b.height>=43),`${width}px office controls fit and retain touch target height`);
    await page.locator('#office-access').click();await shot(`${width}-access`);
    const management=await page.locator('#office-management').evaluate(n=>{const r=n.getBoundingClientRect(),h=document.querySelector('#office-visit > header').getBoundingClientRect();return {top:r.top,headerBottom:h.bottom,bottom:r.bottom,height:innerHeight};});
    check(management.top>=management.headerBottom+4&&management.bottom<=height,`${width}px access panel clears the header`);
    await page.locator('#office-access').click();
    if(width<=390){
      await page.locator('#office-visit').focus();await page.keyboard.down('KeyA');
      try{await page.waitForFunction(()=>JSON.parse(document.querySelector('#office-visit').dataset.position)[0]<-1.45);}finally{await page.keyboard.up('KeyA');}
      await page.locator('#office-desk-nearby').waitFor({state:'visible'});await shot(`${width}-desk-prompt`);
      const clearance=await page.locator('#office-desk-nearby').evaluate(n=>{const a=n.getBoundingClientRect(),b=document.querySelector('.office-pad').getBoundingClientRect();return a.bottom<=b.top||a.right<=b.left||a.left>=b.right;});
      check(clearance,`${width}px nearby desk action clears the movement controls`);
    }
    await page.locator('#office-exit').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>!document.querySelector('#office-visit').open);
    check(await page.locator('#canvas-host').evaluate(n=>n===document.activeElement),`${width}px return restores street focus`);
    await page.waitForFunction(target=>{const m=window.__riverMultiplayer(),p=m.snapshot.players.find(p=>p.id===m.selfId);return p&&!p.office&&Math.hypot(p.position[0]-target[0],p.position[1]-target[1])<.5;},site.office.entrance);
    await shot(`${width}-return`);
  }
  await page.setViewportSize({width:1440,height:1000});await walk(site.approach,'return-to-street');await walk(site.start,'continue-along-street');await shot('departure');
  check(errors.length===0,`No browser errors: ${errors.join('; ')}`);
  return {checks,site,route,layouts,presentations,captures,errors,scope:'Normal local controls and authenticated fixture server; viewport emulation, not physical touch devices or live account acceptance.'};
}
