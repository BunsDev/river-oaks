async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1400,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/workers.html');await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const count=await page.evaluate(()=>window.workerFixture.count),kinds=new Set(),failures=[];
  let maxError=0,contacts=0,docked=0;
  for(let index=0;index<count;index++) {
    const result=await page.evaluate(index=>window.workerFixture.inspect(index,421),index);
    for(const sample of result.samples)for(const contact of sample.contacts) {
      contacts++;maxError=Math.max(maxError,contact.error);
      if(contact.error>0.002)failures.push({id:result.id,frame:sample.frame,error:contact.error});
    }
    if(result.kind==='tray'&&result.samples.some(s=>Math.abs(s.orientation[0])+Math.abs(s.orientation[2])>1e-6))throw new Error('Loaded serving tray tilts');
    if(result.samples[220].workTime!==result.samples[190].workTime)throw new Error(`${result.id} did not pause for conversation`);
    if(result.samples[260].workTime<=result.samples[225].workTime)throw new Error(`${result.id} did not resume work`);
    if(result.docked)docked++;
    if(!kinds.has(result.kind)){kinds.add(result.kind);await page.screenshot({path:`output/playwright/worker-${result.kind}.png`});}
  }
  // PR #14 fits reach conservatively: one authored station supports a docked
  // load. The separate hand-fitting work expands that scope.
  if(count!==62||kinds.size!==6||docked!==1)throw new Error(`Incomplete staff coverage: ${count} workers, ${kinds.size} tasks, ${docked} counter contacts`);
  if(errors.length||failures.length)throw new Error(JSON.stringify({errors,failures:failures.slice(0,10),maxError}));
  return {workers:count,kinds:[...kinds],docked,contacts,maxError,errors};
}
