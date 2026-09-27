async page => {
  const check=(condition,message)=>{if(!condition)throw new Error(message);},errors=[];
  const current=await page.evaluate(()=>location.origin),origin=current.startsWith('http')?current:'http://127.0.0.1:5173';
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1600,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  const results=[];
  for(const scenario of ['passing','turns']) {
  await page.goto(`${origin}/e2e/fixtures/crowd.html?scenario=${scenario}`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const samples=[];let arrived=0,picks=0;
  for(const frame of [0,180,270,330,450,600,960,1440]) {
    const result=await page.evaluate(frame=>window.crowdFixture.advance(frame),frame);samples.push(...result.samples);arrived=result.arrived;
    await page.evaluate(()=>window.crowdFixture.wide());await page.screenshot({path:`output/playwright/crowd-${scenario}-${frame}.png`});
    if(scenario==='passing' && (frame===270 || frame===450))for(const index of [0,3]) {
      const person=await page.evaluate(index=>window.crowdFixture.focus(index),index);
      check(person.speed>0.1,'Pointer acceptance must sample a walking pose');
      await page.mouse.click(...person.screen);check(await page.locator('#picked').getAttribute('data-id')===person.id,`Walking mesh click missed ${person.id} at ${frame}`);picks++;
      await page.evaluate(index=>window.crowdFixture.focus(index,true),index);
      await page.mouse.click(...person.screen);check(await page.locator('#picked').getAttribute('data-id')==='','Opaque foreground must block selection');
      await page.evaluate(()=>window.crowdFixture.wide());
    }
  }
  let maxError=0,planted=0;const previous=new Map();
  for(const sample of samples) {
    check(sample.feet.some(foot=>foot.contact),`${sample.id} lost both supports at ${sample.frame}`);
    for(const foot of sample.feet) {
      const error=Math.hypot(...foot.actual.map((v,i)=>v-foot.target[i]));maxError=Math.max(maxError,error);
      check(error<0.005,`${sample.id} ${foot.side} misses by ${error} m at ${sample.frame}`);
      const key=`${sample.id}-${foot.side}`,before=previous.get(key);
      if(before?.contact && foot.contact) {
        check(foot.support&&Math.abs(foot.support[1])<.003,`${key} has no ground support during stance`);
        if(foot.pivot===before.pivot)check(Math.hypot(foot.support[0]-before.support[0],foot.support[2]-before.support[2])<0.005,`${key} slides at its ground support`);
        check(Math.hypot(...foot.plantOrientation.map((v,i)=>v-before.plantOrientation[i]))<1e-6,`${key} twists during stance`);planted++;
      }
      previous.set(key,foot);
    }
  }
  check(arrived===6,'All six opposing walkers must finish');check(!errors.length,errors.join('; '));
  results.push({scenario,rigs:6,frames:1441,plantedSamples:planted,maxFootErrorMeters:maxError,walkingMeshClicks:picks,opaqueForegroundRejections:picks,arrived});
  }
  return {results,errors,scope:'Actual resident simulation, avatar animation and pointer picker on fixtures; deterministic walking frames'};
}
