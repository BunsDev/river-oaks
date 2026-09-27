async page=>{
  const errors=[],runs=[],seated=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:900,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  for(const hz of [30,60,120]) {
    await page.goto('http://127.0.0.1:5181/e2e/fixtures/jevica.html');
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    const measurements=await page.evaluate(async hz=>{
      const {measureJevicaWaistClearance}=await import('/e2e/fixtures/jevica-clearance.js');
      const f=window.jevicaFixture,measurements=[];let time=0,distance=0,x=100,z=-80;
      for(const stage of ['rest','walk','turn','force','stop','bubble','land']) {
        for(let frame=0;frame<hz;frame++) {
          time+=1000/hz;const speed=['walk','turn','force','land'].includes(stage)?1.65:0;
          const yaw=stage==='turn'?frame/hz*Math.PI:0;distance+=speed/hz;x+=Math.sin(yaw)*speed/hz;z+=Math.cos(yaw)*speed/hz;
          f.render('full',time,speed,{distance,yaw,position:[x,stage==='bubble'?3.5:0,z],action:stage==='force'?'force':'continue',flying:stage==='bubble'});
          if(frame===0||frame===Math.floor(hz/2)||frame===hz-1)measurements.push({stage,frame,...measureJevicaWaistClearance(f)});
        }
      }
      return measurements;
    },hz);
    await page.screenshot({path:`output/playwright/jevica-waist-${hz}hz.png`});runs.push({hz,measurements});
  }
  for(const reduced of [false,true]) {
    await page.emulateMedia({reducedMotion:reduced?'reduce':'no-preference'});
    await page.goto('http://127.0.0.1:5181/e2e/fixtures/carriage.html');
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    seated.push(...await page.evaluate(async reduced=>{
      const {measureJevicaWaistClearance}=await import('/e2e/fixtures/jevica-clearance.js');
      const f=window.carriageFixture;
      return ['riding','riding-slope','reference','riding','reference'].map(view=>{
        f.render(view);return {view,reduced,...measureJevicaWaistClearance(f)};
      });
    },reduced));
    await page.evaluate(()=>window.carriageFixture.render('riding'));
    await page.screenshot({path:`output/playwright/jevica-waist-seated-${reduced}.png`});
  }
  const poses=[...runs.flatMap(r=>r.measurements),...seated],worst=Math.max(...poses.map(m=>m.worst));
  if(errors.length||poses.some(m=>m.checked<100||m.uncovered)||worst>.001)throw new Error(JSON.stringify({worst,runs,errors}));
  return {worst,poses:poses.length,runs,seated,errors};
}
