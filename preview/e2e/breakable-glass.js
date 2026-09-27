async page=>{
  const checks=[],errors=[];
  const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(message.text()))errors.push(message.text());});
  // Reproducible starting positions only. Production district panes, controls,
  // collision, body integration, rendering and restoration remain unchanged.
  const bin=[-2772.617551528393,18.394597173695665,1381.7103832523833];
  const player=[-2772.5986027238223,18.386286948246763,1379.7104730186963];
  const worldRoute=async route=>{const response=await route.fetch(),world=await response.json();world.walkSpawn=[player[0],-player[2],player[1]];world.walkLookAt=[bin[0],-bin[2]];await route.fulfill({response,json:world});};
  const binRoute=async route=>{const response=await route.fetch(),source=await response.text();const before='bin.position.set(x,y,z);',after=`bin.position.set(x,y,z);if(index===0)bin.position.fromArray(${JSON.stringify(bin)});`;
    check(source.includes(before),'The fixture changes only the first bin starting position');await route.fulfill({response,body:source.replace(before,after)});};
  await page.route('**/data/district.json',worldRoute);await page.route('**/src/street-furniture.js*',binRoute);
  try {
    await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
    await page.goto('http://127.0.0.1:5181/?motion-debug=1');
    await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.charactersReady==='24'&&d.playerReady==='true'&&d.storePeopleReady===d.storePeopleTotal;},null,{timeout:90000});
    if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();
    const before=await page.evaluate(()=>window.__riverGlass());check(before.registered>1000,'Actual district facade and door panes are registered');
    await page.locator('#canvas-host').focus();await page.keyboard.press('KeyT');
    await page.waitForFunction(()=>[...document.querySelector('#force-target').options].some(o=>o.value==='street-bin-0'));
    await page.locator('#force-target').selectOption('street-bin-0');await page.locator('#force-lift').click();
    await page.waitForFunction(y=>window.__riverForce().active?.position[1]>y+1.1,bin[1]);
    await page.screenshot({path:'output/playwright/glass-before-throw.png'});
    await page.locator('#canvas-host').focus();await page.keyboard.press('KeyR');
    await page.waitForFunction(()=>window.__riverGlass().broken>0,null,{timeout:12000});
    const impact=await page.evaluate(()=>({glass:window.__riverGlass(true),force:window.__riverForce().active}));
    check(impact.glass.broken===1,'The normal R throw breaks exactly one pane');
    check(impact.glass.shards>0&&impact.glass.shards<=192,'Rendered debris stays within 192 triangles');
    check(impact.glass.panes.find(p=>p.broken)?.id===30,'The bin hits the actual pane on its trajectory');
    check(impact.force&&impact.force.position[2]<1382.75&&Math.hypot(impact.force.velocity[0],impact.force.velocity[2])<.001,'The impact stops the bin outside the display backing');
    await page.screenshot({path:'output/playwright/glass-after-throw.png'});
    await page.waitForFunction(()=>window.__riverGlass().shards===0,null,{timeout:10000});
    check(await page.evaluate(()=>window.__riverGlass().broken===1),'Fragments clear while the window remains broken');
    await page.waitForFunction(()=>window.__riverGlass().broken===0,null,{timeout:35000});
    const restored=await page.evaluate(()=>({glass:window.__riverGlass(),force:window.__riverForce().active}));
    check(restored.glass.totalBreaks===1,'The same pane restores automatically without repeated hits');
    check(!restored.force,'The thrown bin settles and releases');
    await page.screenshot({path:'output/playwright/glass-restored.png'});
    check(!errors.length,'No runtime or WebGL shader errors');
    return {checks,before,impact:{glass:{...impact.glass,panes:impact.glass.panes.filter(p=>p.broken)},force:impact.force},restored,errors};
  } finally {
    await page.unroute('**/data/district.json',worldRoute);await page.unroute('**/src/street-furniture.js*',binRoute);await page.goto('about:blank');
  }
}
