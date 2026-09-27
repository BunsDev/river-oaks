async page=>{
  await page.setViewportSize({width:1600,height:900});
  const current=await page.evaluate(()=>location.origin),origin=current.startsWith('http')?current:'http://127.0.0.1:5173';
  const runs=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  for(const terrain of ['plane','wave','ramp'])for(const hz of [30,60,120]) {
    await page.goto(`${origin}/e2e/fixtures/motion.html?slope=0&terrain=${terrain}&hz=${hz}`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    const result=await page.evaluate(async hz=>{
      const {createCuffProbe}=await import('/e2e/fixtures/cuff-clearance.js');
      const f=window.motionFixture,probe=createCuffProbe(f.avatars[0].rig.model),samples=[];
      for(let frame=0;frame<=5*hz;frame+=Math.round(hz/12)){f.advance(frame);samples.push({frame,...probe()});}
      return samples;
    },hz);
    runs.push({terrain,hz,samples:result});
  }
  const samples=runs.flatMap(r=>r.samples),worst=Math.max(...samples.map(s=>s.worst));
  if(errors.length||worst>0||samples.some(s=>s.checked<100||s.uncovered))throw new Error(JSON.stringify({worst,runs,errors}));
  return {worst,runs,errors};
}
