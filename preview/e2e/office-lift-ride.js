async page => {
  // The street lift carries the visitor 24.3 m up. Every frame of the ride the drawn body must
  // stand on the car floor: its shoes keep the height above the floor they had as the doors closed.
  const checks=[],check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);console.log(label);};
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/?motion-debug=1',{waitUntil:'commit'});
  await page.waitForFunction(()=>window.__riverMultiplayer?.().connected&&document.querySelector('#canvas-host')?.dataset.playerReady==='true',null,{timeout:90000});
  await page.locator('#office-lobby').evaluate(b=>b.click());
  await page.waitForFunction(()=>document.querySelector('#office-enter')?.disabled===false,null,{timeout:60000});
  await page.evaluate(()=>{
    window.liftSamples=[];
    const sample=()=>{
      const o=window.__riverOffice?.();
      if(o?.presentation==='shared-world')window.liftSamples.push({phase:o.phase,elevation:o.elevation,floor:o.avatar[1],shoes:o.shoes});
      if(o?.phase!=='office')requestAnimationFrame(sample);
    };
    requestAnimationFrame(sample);
  });
  await page.locator('#canvas-host').focus();await page.keyboard.press('KeyF');
  await page.locator('#office-visit[open]').waitFor();
  for(const [name,elevation] of [['closing',null],['ascent-25',6],['ascent-75',18]]){
    await page.waitForFunction(([name,elevation])=>window.liftSamples.some(s=>elevation===null?s.phase===name:s.phase==='ascending'&&s.elevation>elevation),[name,elevation],{timeout:120000});
    await page.screenshot({path:`output/playwright/office-lift-ride-${name}.png`});
  }
  await page.waitForFunction(()=>document.querySelector('#office-visit').dataset.phase==='office',null,{timeout:120000});
  const samples=await page.evaluate(()=>window.liftSamples);
  const closed=samples.filter(s=>s.phase==='closing').at(-1);
  check(closed?.shoes?.every(Number.isFinite),'The visitor stands in the car as the doors close');
  const rest=closed.shoes.map(y=>y-closed.floor),riding=samples.filter(s=>['ascending','opening'].includes(s.phase));
  check(riding.length>=30&&Math.max(...riding.map(s=>s.elevation))>24.2,`The car is sampled through the whole climb (${riding.length} frames)`);
  const drift=Math.max(...riding.map(s=>Math.max(...s.shoes.map((y,i)=>Math.abs(y-s.floor-rest[i])))));
  const worst=riding.find(s=>s.shoes.some((y,i)=>Math.abs(y-s.floor-rest[i])===drift));
  check(drift<.03,`Both shoes ride on the car floor: worst ${drift.toFixed(3)} m at ${worst.phase} ${worst.elevation.toFixed(1)} m`);
  return {checks,frames:riding.length,drift};
}
