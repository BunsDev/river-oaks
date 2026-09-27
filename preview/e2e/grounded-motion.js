async page => {
  const check=(condition,message)=>{if(!condition) throw new Error(message);};
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1600,height:900});
  await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/motion.html');
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const samples=[];
  for(const frame of [0,60,110,170,230,300]) {
    const result=await page.evaluate(frame=>window.motionFixture.advance(frame),frame);samples.push(...result.samples);
    await page.screenshot({path:`output/playwright/grounded-motion-${frame}.png`});
  }
  const previous=new Map();let planted=0,maxError=0;
  for(const sample of samples) {
    check(sample.feet.some(foot=>foot.contact),`${sample.profile} has no supporting foot at ${sample.frame}`);
    for(const foot of sample.feet) {
      const key=`${sample.profile}-${foot.side}`,before=previous.get(key);
      const error=Math.hypot(...foot.actual.map((value,index)=>value-foot.target[index]));
      maxError=Math.max(maxError,error);
      check(error<0.005,`${key} misses its target by ${error} m at frame ${sample.frame}`);
      if(before?.contact && foot.contact) {
        if(foot.pivot===before.pivot)check(Math.hypot(foot.supportActual[0]-before.supportActual[0],foot.supportActual[2]-before.supportActual[2])<0.005,`${key} slides at its support pivot`);
        check(Math.hypot(...foot.plantOrientation.map((value,index)=>value-before.plantOrientation[index]))<1e-6,`${key} twists its planted heading`);
        planted++;
      }
      previous.set(key,foot);
    }
  }
  check(planted>1000,'Need sustained stance coverage across all six rigs');
  check(samples.filter(sample=>sample.frame===300).every(sample=>sample.feet.every(foot=>foot.contact)),'Both feet must settle after stopping');
  check(!errors.length,errors.join('; '));
  return {rigs:6,frames:301,plantedSamples:planted,maxFootErrorMeters:maxError,errors,scope:'Actual shipped skinned rigs and renderer on an inclined fixture; district paths checked separately'};
}
