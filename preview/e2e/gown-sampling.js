async page=>{
  const origin='http://127.0.0.1:5181',errors=[],checks=[],runs=[];
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:900,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  let baseline=false;
  const pattern='**/src/jevica-drape.js*';
  await page.route(pattern,async route=>{
    const response=await route.fetch();let body=await response.text();
    if(baseline) {
      // Reference the renderer's own skinning at the same contact samples.
      if(!body.includes('sampler.update();')||!body.includes('sampler.getVertexPosition(index,point)'))throw new Error('Missing contact sampling seam');
      body=body.replace('sampler.update();','').replace('sampler.getVertexPosition(index,point)','body.getVertexPosition(index,point)');
    }
    await route.fulfill({response,body});
  });
  try {
    for(const mode of ['reference','cached','cached','reference']) {
      baseline=mode==='reference';
      await page.goto(`${origin}/e2e/fixtures/jevica.html`);
      await page.waitForFunction(()=>document.body.dataset.ready==='true');
      const result=await page.evaluate(()=>{
        const f=window.jevicaFixture,timings=[],poses=[];let distance=0,x=100,z=-80;
        for(let frame=0;frame<240;frame++) {
          const speed=frame<180?1.65:0,yaw=frame<90?0:Math.min(1,(frame-90)/90)*Math.PI;
          distance+=speed/60;x+=Math.sin(yaw)*speed/60;z+=Math.cos(yaw)*speed/60;
          const info=f.render('full',frame*1000/60,speed,{distance,yaw,position:[x,0,z],action:frame>=120&&frame<180?'force':'continue'});
          if(frame>=30)timings.push(info.costumeUpdateMs);
          if(frame%30===29) {
            const skirt=f.avatar.object.getObjectByName('Jevica draped silk gown');
            const gl=f.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
            gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            let hash=2166136261;for(const pixel of pixels)hash=Math.imul(hash^pixel,16777619)>>>0;
            poses.push({frame,vertices:Array.from(skirt.geometry.attributes.position.array),pixelHash:hash});
          }
        }
        timings.sort((a,b)=>a-b);
        return {poses,costumeUpdateMs:{median:timings[Math.floor(timings.length*.5)],p95:timings[Math.floor(timings.length*.95)]}};
      });
      await page.screenshot({path:`output/playwright/gown-sampling-${mode}.png`});
      runs.push({mode,...result});
    }
    const reference=runs[0].poses;
    for(const [index,run]of runs.entries()) {
      check(run.poses.every((pose,i)=>pose.vertices.every((v,j)=>v===reference[i].vertices[j])),`Run ${index+1}: all sampled gown vertices exactly match Three skinning`);
      check(run.poses.every((pose,i)=>pose.pixelHash===reference[i].pixelHash),`Run ${index+1}: eight rendered poses match the reference pixel hashes`);
    }
    check(!errors.length,'No uncaught browser errors');
    return {checks,runs:runs.map(({mode,costumeUpdateMs,poses})=>({mode,costumeUpdateMs,frames:poses.map(({frame,pixelHash})=>({frame,pixelHash}))})),errors,scope:'Paired ABBA costume CPU timings and exact sampled geometry/pixel hashes; not district frame-rate acceptance'};
  } finally {await page.unroute(pattern);}
}
