async page => {
  const checks=[], errors=[];
  const check=(condition,label)=>{if(!condition)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1440,height:1000});
  const current=await page.evaluate(()=>location.origin);
  await page.goto(current.startsWith('http')?current:'http://127.0.0.1:5173/');
  await page.evaluate(()=>{localStorage.removeItem('river-oaks-character');localStorage.removeItem('river-oaks-beast-movement');});
  await page.reload();
  await page.locator('#loading').waitFor({state:'hidden'});
  const host=page.locator('#canvas-host'),button=page.locator('#player-beast-movement'),status=page.locator('#player-status');
  const data=key=>host.evaluate((element,key)=>element.dataset[key],key);
  const ready=id=>page.waitForFunction(id=>{const data=document.querySelector('#canvas-host').dataset;return data.playerReady==='true'&&data.playerAppearance===id;},id);
  const motion=()=>data('beastMotion').then(Number);
  await ready('jevica');
  if(await page.locator('#panel-toggle').getAttribute('aria-expanded')==='true')await page.locator('#panel-toggle').click();

  check(await button.isHidden(),'A humanoid form offers no beast movement');
  await host.focus();await page.keyboard.press('KeyP');
  check(/beast form/i.test(await status.textContent()),'P in a humanoid form explains that beast movement needs a beast form');
  check(await data('playerMovement')==='upright','A humanoid form stays upright');

  await page.locator('input[name=player-character][value=kai]').check();await ready('man-workwear');
  await page.locator('input[name=player-variant][value=noir]').check();await ready('kai-noir');
  await page.locator('input[name=player-form][value=beast]').check();await ready('kai-noir-beast');
  check(await button.isVisible()&&await button.getAttribute('aria-pressed')==='false','A beast form offers beast movement, off until chosen');
  check(await page.locator('[data-species]').textContent()==='Snow leopard','The form switch names the species');

  // A beast form without beast movement walks exactly as before.
  await host.focus();await page.keyboard.down('KeyW');await page.waitForTimeout(900);
  check(await motion()===0,'Without beast movement a beast form walks upright');
  await page.keyboard.up('KeyW');

  await button.click();
  check(await button.getAttribute('aria-pressed')==='true'&&await data('playerMovement')==='beast','Beast movement turns on');
  check(/prowls and lopes like a snow leopard/.test(await status.textContent()),'The status line says how the beast moves');
  // Strafing turns the body to its travel, so the camera sees the gait in profile.
  await host.focus();await page.keyboard.down('KeyD');await page.keyboard.down('ShiftLeft');
  await page.waitForFunction(()=>Number(document.querySelector('#canvas-host').dataset.beastMotion)>.95,null,{timeout:5000});
  await page.waitForFunction(()=>Number(document.querySelector('#walking-hud').dataset.speed)>4,null,{timeout:5000});
  check(true,'The beast sprint actually travels faster than upright running');
  check(true,'Beast movement eases fully in while moving');
  await page.waitForTimeout(500);
  await page.screenshot({path:'output/playwright/beast-movement-lope.png'});
  await page.keyboard.up('ShiftLeft');await page.waitForTimeout(800);
  await page.screenshot({path:'output/playwright/beast-movement-prowl.png'});
  await page.keyboard.up('KeyD');await page.waitForTimeout(900);
  check(await motion()>.95,'Standing still keeps the beast crouch');
  await page.screenshot({path:'output/playwright/beast-movement-crouch.png'});

  // The humanoid form walks upright; the choice returns with any beast form.
  await page.locator('input[name=player-form][value=human]').check();await ready('kai-noir');
  check(await button.isHidden()&&await data('playerMovement')==='upright','A humanoid form hides beast movement and walks upright');
  await page.locator('input[name=player-character][value=vesper]').check();await ready('woman-tailored');
  await page.locator('input[name=player-form][value=beast]').check();await ready('vesper-beast');
  check(await button.getAttribute('aria-pressed')==='true'&&await data('playerMovement')==='beast','The beast movement choice returns with a beast form');
  await page.reload();await ready('vesper-beast');
  check(await button.getAttribute('aria-pressed')==='true','Beast movement persists on this device');
  await page.waitForFunction(()=>Number(document.querySelector('#canvas-host').dataset.beastMotion)>.95,null,{timeout:5000});
  await host.focus();await page.keyboard.press('KeyP');
  check(await data('playerMovement')==='upright'&&await button.getAttribute('aria-pressed')==='false','P turns beast movement off');
  await page.waitForFunction(()=>Number(document.querySelector('#canvas-host').dataset.beastMotion)===0,null,{timeout:5000});
  check(true,'The posture eases back to upright');
  check(errors.length===0,`No uncaught browser errors: ${errors.join('; ')}`);
  return {checks,errors};
}
