async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1400,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/workers.html');await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const count=await page.evaluate(()=>window.workerFixture.count),kinds=new Set(),failures=[];
  let touchSamples=0,maxTouchGap=0,maxError=0,contacts=0,docked=0,skinSamples=0,maxSkinHeight=-Infinity,minSkinHeight=Infinity,maxWristBend=0,maxSidewaysBend=0,bodySamples=0,bodyVertices=0;
  for(let index=0;index<count;index++) {
    const result=await page.evaluate(index=>window.workerFixture.inspect(index,421,{skin:true,body:true}),index);
    for(const sample of result.samples)for(const contact of sample.contacts) {
      contacts++;maxError=Math.max(maxError,contact.error);
      if(contact.error>0.002)failures.push({id:result.id,frame:sample.frame,error:contact.error});
    }
    for(const sample of result.samples)for(const skin of sample.skin??[]) {
      skinSamples++;maxSidewaysBend=Math.max(maxSidewaysBend,skin.sidewaysBend);maxWristBend=Math.max(maxWristBend,skin.wristBend);if(skin.kind==='touch'){touchSamples++;maxTouchGap=Math.max(maxTouchGap,Math.abs(skin.bottom-skin.targetHeight));}
      else{maxSkinHeight=Math.max(maxSkinHeight,skin.top);minSkinHeight=Math.min(minSkinHeight,skin.top);}
      const invalidContact=skin.kind==='touch'?skin.bottom<0.0215||Math.abs(skin.bottom-skin.targetHeight)>0.002||skin.elbowHeight>=0:skin.top>0.0001||skin.top< -0.002;
      if(skin.under<100||invalidContact||skin.collisions||skin.wristBend>=Math.PI/2||skin.sidewaysBend>Math.PI/9)failures.push({id:result.id,frame:sample.frame,skin});
    }
    for(const sample of result.samples)if(sample.body){
      bodySamples++;bodyVertices+=sample.body.vertices;
      if(sample.body.collisions)failures.push({id:result.id,frame:sample.frame,body:sample.body});
    }
    if(result.kind==='tray'&&result.samples.some(s=>Math.abs(s.orientation[0])+Math.abs(s.orientation[2])>1e-6))throw new Error('Loaded serving tray tilts');
    if(result.samples[220].workTime!==result.samples[190].workTime)throw new Error(`${result.id} did not pause for conversation`);
    if(result.samples[260].workTime<=result.samples[225].workTime)throw new Error(`${result.id} did not resume work`);
    if(result.docked)docked++;
    if(!kinds.has(result.kind)){
      kinds.add(result.kind);await page.screenshot({path:`output/playwright/worker-${result.kind}.png`});
      await page.evaluate(index=>window.workerFixture.inspect(index,0,{close:true}),index);
      await page.screenshot({path:`output/playwright/worker-hand-${result.kind}.png`});
    }
  }
  if(count!==62||kinds.size!==6||docked<15)throw new Error(`Incomplete staff coverage: ${count} workers, ${kinds.size} tasks, ${docked} counter contacts`);
  if(errors.length||failures.length)throw new Error(JSON.stringify({errors,failures:failures.slice(0,10),maxError}));
  return {touchSamples,maxTouchGap,maxSidewaysBend,bodySamples,bodyVertices,maxWristBend,skinSamples,maxSkinHeight,minSkinHeight,workers:count,kinds:[...kinds],docked,contacts,maxError,errors};
}
