async page => {
  const checks=[],errors=[],views=[];
  const check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  const origin='http://127.0.0.1:5173';
  await page.setViewportSize({width:800,height:1000});
  for(const remote of [false,true]){
    await page.goto(`${origin}/e2e/fixtures/jevica.html?appearance=woman-casual${remote?'&remote=1':''}`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    const structure=await page.evaluate(()=>{
      const f=window.jevicaFixture,model=f.avatar.rig.model;
      return {face:model.getObjectByName('fox face')?.parent.name,tail:model.getObjectByName('fox tail')?.parent.name,hair:model.getObjectByName('Sable ash blonde waves')?.isMesh,humanHair:model.getObjectByName('Jevicalong01')?.visible};
    });
    check(structure.face==='head'&&structure.tail==='pelvis'&&structure.hair&&!structure.humanHair,`${remote?'Remote':'Local'} avatar loads Sable's owned face, hair and pelvis tail`);
    for(const view of ['full','portrait','back','profile']){
      const result=await page.evaluate(view=>{
        const f=window.jevicaFixture,result=f.render(view,0),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
        // setFromObject includes hidden source parts and the supply kit. Measure
        // only rendered meshes, refreshing each animated skinned bound first.
        f.avatar.object.traverseVisible(mesh=>{
          if(!mesh.isMesh)return;
          if(mesh.isSkinnedMesh){mesh.skeleton.update();mesh.computeBoundingBox();}else mesh.geometry.computeBoundingBox();
          const box=(mesh.boundingBox??mesh.geometry.boundingBox).clone().applyMatrix4(mesh.matrixWorld);
          box.min.toArray().forEach((v,i)=>min[i]=Math.min(min[i],v));box.max.toArray().forEach((v,i)=>max[i]=Math.max(max[i],v));
        });
        return {...result,bounds:max.map((v,i)=>v-min[i])};
      },view);
      check(result.bounds.every(Number.isFinite)&&result.bounds[1]>1.6&&result.bounds[1]<2,`${remote?'Remote':'Local'} ${view} has finite adult-scale bounds`);
      views.push({remote,view,...result});
      if(!remote)await page.screenshot({path:`output/playwright/sable-${view}.png`});
    }
    const motion=await page.evaluate(()=>{
      const f=window.jevicaFixture,tail=f.avatar.rig.model.getObjectByName('fox tail');
      const start=tail.matrixWorld.toArray();let maxBlink=0;
      for(let i=1;i<=240;i++){
        f.render('full',i*1000/60,1.1);
        maxBlink=Math.max(maxBlink,1-f.avatar.rig.model.getObjectByName('Sable eyelid opening').scale.y);
      }
      return {changed:tail.matrixWorld.toArray().some((v,i)=>Math.abs(v-start[i])>.001),maxBlink,feet:f.avatar.feet.map(leg=>leg.error)};
    });
    check(motion.changed,'Tail attachment moves with the walking skeleton');
    // Independent blink timing is seeded per player; run longer than its first interval.
    const blink=await page.evaluate(()=>{const f=window.jevicaFixture;let closed=false;for(let i=241;i<=600;i++){f.render('portrait',i*1000/60);closed ||= f.avatar.rig.model.getObjectByName('Sable eyelid opening').scale.y<.2;}return closed;});
    check(motion.maxBlink>.8||blink,'The visible fox eyes blink with the animated rig');
    if(!remote){await page.evaluate(()=>window.jevicaFixture.render('full',10100,1.1));await page.screenshot({path:'output/playwright/sable-walking.png'});}
  }
  await page.goto(origin);
  await page.locator('#loading').waitFor({state:'hidden'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  await page.locator('input[name=player-character][value=sable]').check();
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true'&&document.querySelector('#canvas-host').dataset.playerAppearance==='sable-human');
  await page.locator('input[name=player-form][value=beast]').check();
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true'&&document.querySelector('#canvas-host').dataset.playerAppearance==='woman-casual');
  check(await page.locator('input[name=player-character][value=sable]').isChecked()&&await page.locator('#player-name').textContent()==='Jevica','Sable selection retains the authenticated account name');
  check(await page.locator('.player-portrait img').evaluate(img=>new URL(img.src).pathname)==='/assets/characters/sable-portrait.png','Character card shows the actual rendered model');
  check(!await page.locator('.player-portrait img').evaluate(img=>img.classList.contains('turnaround')),'Rendered portrait uses its own aspect ratio');
  check(await page.locator('#player-reference').getAttribute('href')==='/assets/characters/references/sable-fox-turnaround.png','Original full reference stays available');
  await page.locator('#canvas-host').focus();
  const position=await page.locator('#walking-hud').getAttribute('data-position');
  await page.keyboard.down('KeyW');
  try{await page.waitForFunction(before=>document.querySelector('#walking-hud').dataset.position!==before,position);}finally{await page.keyboard.up('KeyW');}
  check(true,'Sable walks through the real district controls');
  await page.screenshot({path:'output/playwright/sable-district.png'});
  await page.reload();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  check(await page.locator('input[name=player-character][value=sable]').isChecked()&&await page.locator('input[name=player-form][value=beast]').isChecked()&&await page.locator('#canvas-host').getAttribute('data-player-appearance')==='woman-casual','Sable selection persists across reload');
  await page.setViewportSize({width:390,height:844});await page.reload();await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerReady==='true');
  if(await page.locator('.visit-tools').evaluate(node=>node.open))await page.locator('.visit-tools-toggle').click();
  await page.locator('.visit-tools-toggle').focus();await page.keyboard.press('Enter');
  check(await page.locator('.character-picker').isVisible(),'Keyboard exposes the mobile character selector');
  check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Character card fits the mobile viewport');
  await page.screenshot({path:'output/playwright/sable-mobile.png'});
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(`${origin}/e2e/fixtures/jevica.html?appearance=woman-casual`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
  check(await page.evaluate(()=>{const f=window.jevicaFixture;for(let i=0;i<120;i++)f.render('portrait',i*50);return f.avatar.rig.model.getObjectByName('Sable eyelid opening').scale.y===1;}),'Reduced motion keeps Sable eyes open');
  check(!errors.length,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,views,errors,scope:'Real local and remote avatar loader, Chromium WebGL views, walking, blink, selector, persistence, keyboard/mobile and reduced motion. Visual reference equivalence requires art review.'};
}
