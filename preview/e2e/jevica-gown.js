async page => {
  const current=await page.evaluate(()=>location.origin),origin=current.startsWith('http')?current:'http://127.0.0.1:5173';
  const runs=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:900,height:1000});
  for(const hz of [30,60,120]) {
    await page.goto(`${origin}/e2e/fixtures/jevica.html`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    const run=await page.evaluate(async hz=>{
      const {measureJevicaClearance,measureJevicaArmClearance}=await import('/e2e/fixtures/jevica-clearance.js');
      const f=window.jevicaFixture,measurements=[],timings=[];
      let time=0,distance=0,x=100,z=-80;
      const stages=[
        {name:'walk',speed:1.65},
        {name:'turn',speed:1.65,turn:true},
        {name:'fast-walk',speed:3.2},
        {name:'stop',speed:0},
        {name:'bubble-pose',speed:0,flying:true},
        {name:'landing-resume',speed:1.65},
      ];
      for(const stage of stages)for(let frame=1;frame<=hz;frame++) {
        time+=1000/hz;distance+=stage.speed/hz;
        const yaw=stage.turn?frame/hz*Math.PI:0;x+=Math.sin(yaw)*stage.speed/hz;z+=Math.cos(yaw)*stage.speed/hz;
        const info=f.render('full',time,stage.speed,{distance,flying:stage.flying,yaw,position:[x,stage.flying?3.5:0,z]});
        timings.push(info.costumeUpdateMs);
        if(frame===1||frame===Math.round(hz/2)||frame===hz)measurements.push({stage:stage.name,frame,...measureJevicaClearance(f),arms:measureJevicaArmClearance(f)});
      }
      timings.sort((a,b)=>a-b);
      return {hz,measurements,costumeUpdateMs:{median:timings[Math.floor(timings.length*.5)],p95:timings[Math.floor(timings.length*.95)]}};
    },hz);
    await page.screenshot({path:`output/playwright/jevica-gown-${hz}hz.png`});
    runs.push(run);
  }
  const measurements=runs.flatMap(r=>r.measurements),worst=Math.max(...measurements.map(m=>m.worst));
  if(errors.length||measurements.some(m=>m.checked<100||m.uncovered||m.clothRadius>1.2||m.arms.checked<100||m.arms.worst>0.001)||worst>0.001)throw new Error(JSON.stringify({worst,runs,errors}));
  return {worst,runs,errors};
}
