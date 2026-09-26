async page => {
  const origin='http://127.0.0.1:5173',runs=[],errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.setViewportSize({width:1600,height:900});
  for(const terrain of ['wave','ramp'])for(const hz of [30,60,120]) {
    const slope=0;
    await page.goto(`${origin}/e2e/fixtures/motion.html?slope=${slope}&hz=${hz}&terrain=${terrain}`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    runs.push(await page.evaluate(async({slope,hz,terrain})=>{
      const {createShoeProbe}=await import('/e2e/fixtures/shoe-clearance.js');
      const f=window.motionFixture,probes=f.avatars.map(createShoeProbe),samples=[];
      for(let frame=0;frame<=5*hz;frame++) {
        f.advance(frame);
        for(const [index,probe] of probes.entries())samples.push({frame,profile:f.avatars[index].profile,feet:probe(f.ground)});
      }
      return {slope,hz,terrain,samples};
    },{slope,hz,terrain}));
    await page.screenshot({path:`output/playwright/shoe-uneven-${terrain}-${hz}hz.png`});
  }
  let min=Infinity,maxPlanted=-Infinity,planted=0;
  for(const run of runs)for(const sample of run.samples)for(const foot of sample.feet) {
    if(foot.vertices<100||!Number.isFinite(foot.minHeight))throw new Error('Missing finite shoe samples');
    min=Math.min(min,foot.minHeight);
    if(foot.contact){planted++;maxPlanted=Math.max(maxPlanted,foot.minHeight);}
  }
  const summary={minHeight:min,maxPlantedHeight:maxPlanted,planted,errors,runs:runs.map(r=>({terrain:r.terrain,slope:r.slope,hz:r.hz,frames:r.samples.length/6}))};
  if(errors.length||min<-.003||maxPlanted>.003)throw new Error(JSON.stringify({summary,worstByRig:runs.map(r=>({terrain:r.terrain,slope:r.slope,hz:r.hz,rigs:[...new Set(r.samples.map(s=>s.profile))].map(profile=>{
    const feet=r.samples.filter(s=>s.profile===profile).flatMap(s=>s.feet);
    return {profile,min:Math.min(...feet.map(f=>f.minHeight)),maxPlanted:Math.max(...feet.filter(f=>f.contact).map(f=>f.minHeight))};
  })}))}));
  return summary;
}
