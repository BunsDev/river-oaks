async page => {
  // Single player: sitting and watering happen in the browser, without a town
  // server, and the townspeople leave the player's seat alone.
  const origin='http://127.0.0.1:5173',checks=[],errors=[];
  const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1280,height:800});
  await page.goto(`${origin}/?motion-debug=1`,{waitUntil:'commit'});
  await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.playerReady==='true'&&window.__riverSeatAndWater?.()?.seats.length>0,null,{timeout:90000});
  check(!(await page.evaluate(()=>window.__riverMultiplayer().connected)),'Playing single player');
  const press=async key=>{await page.locator('#canvas-host').focus();await page.keyboard.press(key);};
  const hook=()=>page.evaluate(()=>{const s=window.__riverSeatAndWater();return {seats:s.seats,planters:s.planters,interaction:s.interaction,offered:s.offered};});

  const {seats,planters}=await hook();
  const bench=seats.find(seat=>seat.kind==='bench');
  const arrived=await page.evaluate(id=>window.__riverSeatAndWater().goNear(id),bench.id);
  check(arrived.ok,'Arrived beside a storefront bench');
  await page.waitForFunction(()=>window.__riverSeatAndWater().interaction==='sit',null,{timeout:15000});
  await press('KeyZ');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerSeat,null,{timeout:10000});
  const seatId=await page.evaluate(()=>document.querySelector('#canvas-host').dataset.playerSeat);
  check(seatId.startsWith('bench:'),'Z sits down without a town server');
  await page.waitForFunction(()=>document.querySelector('#walking-hud .walking-title strong')?.textContent==='Sitting',null,{timeout:5000});
  check(true,'The HUD says the player is sitting');
  await page.waitForTimeout(600);
  await page.screenshot({path:'output/playwright/solo-sit.png'});

  // Townspeople never take the player's place while they sit.
  for(let i=0;i<20;i++){
    const held=await page.evaluate(id=>window.__riverSeatAndWater().residents().some(resident=>resident.seat.id===id),seatId);
    check(!held,'No resident takes the seat the player holds');
    await page.waitForTimeout(250);
  }

  // Moving stands up.
  await page.locator('#canvas-host').focus();await page.keyboard.down('KeyS');await page.waitForTimeout(400);await page.keyboard.up('KeyS');
  await page.waitForFunction(()=>!document.querySelector('#canvas-host').dataset.playerSeat,null,{timeout:10000});
  check(true,'Walking off stands up');
  // And Z stands up too.
  await page.waitForFunction(()=>window.__riverSeatAndWater().interaction==='sit',null,{timeout:15000});
  await press('KeyZ');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerSeat,null,{timeout:10000});
  await press('KeyZ');
  await page.waitForFunction(()=>!document.querySelector('#canvas-host').dataset.playerSeat,null,{timeout:10000});
  check(true,'Z stands up again');

  // Watering: the animation plays and ends by itself.
  const planter=planters.find(item=>item.kind==='boxwood')??planters[0];
  check((await page.evaluate(id=>window.__riverSeatAndWater().goNear(id),planter.id)).ok,'Arrived beside a planter');
  await page.waitForFunction(()=>window.__riverSeatAndWater().interaction==='water',null,{timeout:15000});
  await press('KeyZ');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerWatering==='true',null,{timeout:5000});
  check(true,'Z waters the planter');
  await press('KeyH');await page.waitForTimeout(900);
  await page.screenshot({path:'output/playwright/solo-water.png'});
  await press('KeyH');
  await page.waitForFunction(()=>document.querySelector('#canvas-host').dataset.playerWatering==='false',null,{timeout:8000});
  check(true,'The watering animation ends by itself');
  check(errors.length===0,`No page errors: ${errors.join(' | ')}`);
  return {checks};
}
