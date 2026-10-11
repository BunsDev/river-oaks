async page => {
  const { openHudSpace } = await import('./hud-navigation.js');
  const checks=[],errors=[],metrics={},visits=[],origin='http://127.0.0.1:5173';
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  for(const viewport of [{width:1024,height:900},{width:390,height:844}]) {
    const context=await page.context().browser().newContext({viewport,hasTouch:true,isMobile:true,reducedMotion:'no-preference'});
    await context.addCookies(await page.context().cookies());
    const touch=await context.newPage();
    touch.on('pageerror',error=>errors.push(error.message));
    try {
      await touch.goto(`${origin}/?motion-debug=1`);
      // Cold character assets and shader compilation can exceed the default
      // 30-second startup limit. Input assertions keep their original deadlines.
      await touch.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.storePeopleTotal&&d.storePeopleReady===d.storePeopleTotal&&d.playerReady==='true';},null,{timeout:90000});
      if(await touch.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await touch.locator('#panel-toggle').click();
      await touch.waitForTimeout(500);
      check(await touch.locator('#walking-controls-toggle').getAttribute('aria-expanded')==='true',`${viewport.width}: touch movement pad starts available`);
      // Keep the viewport clear for tapping actual people; the pad is tested below.
      await touch.locator('#walking-controls-toggle').click();
      if(viewport.width===1024) {
        const client=await context.newCDPSession(touch),x=500,y=300;
        const send=(type,points)=>client.send('Input.dispatchTouchEvent',{type,touchPoints:points.map(([id,x,y])=>({id,x,y,radiusX:1,radiusY:1,force:1}))});
        const yaw=async()=>{await touch.waitForTimeout(650);return Number(await touch.locator('#walking-hud').getAttribute('data-yaw'));};
        const noDialogue=async message=>check(!await touch.locator('#community-dialogue').isVisible(),message);
        await touch.evaluate(()=>{window.pointerLog=[];for(const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture'])document.querySelector('#canvas-host').addEventListener(type,e=>window.pointerLog.push({type:e.type,id:e.pointerId,primary:e.isPrimary,trusted:e.isTrusted}));});
        let before=await yaw();
        await send('touchStart',[[1,x,y]]);await send('touchMove',[[1,x+4,y]]);
        metrics.jitterYawChange=(await yaw())-before;
        check(metrics.jitterYawChange===0,'Four-pixel touch jitter leaves the camera still');
        await send('touchCancel',[]);
        await send('touchStart',[[1,x,y]]);await send('touchMove',[[1,x+30,y]]);
        before=await yaw();
        await send('touchStart',[[1,x+30,y],[2,x+130,y]]);
        await send('touchMove',[[1,x+30,y],[2,x+170,y]]);
        metrics.secondaryYawChange=(await yaw())-before;
        check(metrics.secondaryYawChange===0,'A second finger cannot steer the primary drag');
        // CDP touchEnd lists the contacts being removed.
        await send('touchEnd',[[2,x+170,y]]);before=await yaw();
        await send('touchMove',[[1,x+60,y]]);
        metrics.primaryAfterSecondaryEnd=(await yaw())-before;
        check(Math.abs(metrics.primaryAfterSecondaryEnd+0.09)<0.002,'Primary drag continues after the second finger lifts');
        await send('touchCancel',[]);before=await yaw();
        await touch.mouse.move(x+80,y);
        check((await yaw())===before,'Cancelled touch leaves no camera drag behind');
        await noDialogue('Cancelled touch does not select a person');

        await touch.mouse.move(x,y);before=await yaw();await touch.mouse.down();await touch.mouse.move(x+20,y);
        check(Math.abs((await yaw())-before)>.03,'A fresh primary gesture works after touch cancellation');
        before=await yaw();
        await touch.evaluate(()=>{const host=document.querySelector('#canvas-host'),event=window.pointerLog.filter(e=>e.type==='pointerdown').at(-1);host.releasePointerCapture(event.id);});
        await touch.mouse.move(x+50,y);
        metrics.lostCaptureYawChange=(await yaw())-before;
        check(metrics.lostCaptureYawChange===0,'Losing pointer capture stops camera movement');
        await touch.mouse.up();await noDialogue('A released capture cannot complete a selection');
        metrics.pointerEvents=await touch.evaluate(()=>window.pointerLog);
        check(metrics.pointerEvents.filter(e=>e.type!=='pointermove').every(e=>e.trusted),'Touch and capture lifecycle events came from the browser');
        check(metrics.pointerEvents.some(e=>e.type==='pointerdown'&&!e.primary),'The browser delivered a real secondary contact');
        await client.detach();
      }

      // Enter through the normal storefront controls before direct mesh taps.
      await touch.locator('#panel-toggle').click();
      await openHudSpace(touch, 'explore-section');
      await touch.locator('#destination').selectOption('osm-node-8172494967');
      await touch.locator('#enter-destination').click();
      await touch.waitForFunction(()=>document.querySelector('#walking-hud').dataset.inside==='osm-node-8172494967');
      await touch.locator('#panel-toggle').click();await touch.waitForTimeout(500);
      for(const suffix of [6,9]) {
        const id=`store-osm-node-8172494967-person-${suffix}`;
        if(viewport.width<700 || suffix===9) {
          // On a narrow phone the entry camera cannot frame both sides of the room.
          // Use the existing approach action, then close it and test direct touch.
          await touch.locator('#panel-toggle').click();await openHudSpace(touch, 'community-section');
          if(!await touch.locator('#community-more').evaluate(e=>e.open))await touch.locator('#community-more > summary').click();
          await touch.locator('#community-local').selectOption(id);await touch.locator('#community-meet').click();
          await touch.locator('#community-dialogue').waitFor({state:'visible'});await touch.locator('#community-close').click();
          await touch.locator('#panel-toggle').click();await touch.waitForTimeout(500);
        }
        // A normal camera drag keeps the target clear of character cards.
        for(let attempt=0;attempt<6;attempt++) {
          const target=await touch.evaluate(id=>window.__riverPeople().find(p=>p.id===id),id);
          const unobstructed=await touch.evaluate(([x,y])=>Boolean(document.elementFromPoint(x,y)?.closest('#canvas-host')),target.screen);
          if(unobstructed&&target.screen[0]>30&&target.screen[0]<viewport.width-30)break;
          const start={x:viewport.width*.5,y:viewport.height*.45};
          await touch.mouse.move(start.x,start.y);await touch.mouse.down();
          await touch.mouse.move(start.x+(target.screen[0]-viewport.width*.5)*.40,start.y,{steps:6});await touch.mouse.up();await touch.waitForTimeout(200);
        }
        const person=await touch.evaluate(id=>window.__riverPeople().find(p=>p.id===id),id);
        check(person.visible&&person.reachable,`${viewport.width}: ${id} is rendered and in talking reach`);
        const hit=await touch.evaluate(([x,y])=>{const element=document.elementFromPoint(x,y);return {canvas:Boolean(element?.closest('#canvas-host')),tag:element?.tagName,class:element?.className};},person.screen);
        if(!hit.canvas)await touch.screenshot({path:`output/playwright/touch-obstructed-${viewport.width}.png`});
        check(hit.canvas,`${viewport.width}: person's mesh point is outside UI overlays: ${JSON.stringify({id,screen:person.screen,hit})}`);
        if(viewport.width===1024&&suffix===6) {
          const [x,y]=person.screen;
          const client=await context.newCDPSession(touch);
          await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:7,x,y}]});
          await client.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
          check(!await touch.locator('#community-dialogue').isVisible(),'Cancelling an unmoved touch on a real person does not select them');
          await client.detach();
          for(const cause of ['capture','focus']) {
            await touch.mouse.move(x,y);await touch.mouse.down();
            if(cause==='capture')await touch.evaluate(()=>{const h=document.querySelector('#canvas-host'),e=window.pointerLog.filter(e=>e.type==='pointerdown').at(-1);if(!h.hasPointerCapture(e.id))throw new Error('No active capture');h.releasePointerCapture(e.id);});
            else await touch.locator('#walking-controls-toggle').focus();
            await touch.mouse.move(x+1,y);await touch.mouse.up();
            check(!await touch.locator('#community-dialogue').isVisible(),`An unmoved person tap cancelled by ${cause} does not open dialogue`);
          }
          check(await touch.evaluate(()=>window.pointerLog.some(e=>e.type==='lostpointercapture')),'The browser delivered lost pointer capture');
        }
        const position=await touch.locator('#walking-hud').getAttribute('data-position');
        await touch.touchscreen.tap(...person.screen);
        await touch.locator('#community-dialogue').waitFor({state:'visible',timeout:5000});
        check(await touch.locator('#community-local').inputValue()===id,`${viewport.width}: touch selects the exact seated guest or worker`);
        check(await touch.locator('#walking-hud').getAttribute('data-position')===position,`${viewport.width}: touch conversation does not teleport the visitor`);
        visits.push({viewport,id,role:await touch.locator('.community-role').textContent(),seated:person.seated});
        await touch.screenshot({path:`output/playwright/touch-person-${viewport.width}-${suffix}.png`});
        await touch.locator('#community-close').click();await touch.waitForTimeout(350);
      }
      await touch.locator('#walking-controls-toggle').click();
      const turn=touch.locator('[data-walk-key=ArrowRight]'),box=await turn.boundingBox();
      const before=Number(await touch.locator('#walking-hud').getAttribute('data-yaw'));
      const client=await context.newCDPSession(touch);
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:10,x:box.x+box.width/2,y:box.y+box.height/2}]});
      await touch.waitForTimeout(650);await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await touch.waitForTimeout(350);
      const after=Number(await touch.locator('#walking-hud').getAttribute('data-yaw'));
      check(Math.abs(after-before)>0.1,`${viewport.width}: held touch movement control turns the camera`);
      await touch.waitForTimeout(350);
      check(Number(await touch.locator('#walking-hud').getAttribute('data-yaw'))===after,`${viewport.width}: releasing touch movement control stops turning`);
      await client.detach();
    } finally {await context.close();}
  }
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,metrics,visits,errors};
}
