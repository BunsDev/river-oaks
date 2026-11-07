async page=>{
  // The drape updates only the field rows the peplum reads, and skips contact samples that
  // cannot reach them (jevica-drape.js). Prove that changes nothing drawn: serve the module
  // with the full row range as the reference, and compare walking, seated and standing-up
  // poses vertex for vertex, normal for normal and pixel for pixel. Timings are paired ABBA.
  const origin='http://127.0.0.1:5181',errors=[],checks=[],runs=[];
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:900,height:1000});
  await page.emulateMedia({reducedMotion:'no-preference'});
  let reference=false;
  const pattern='**/src/jevica-drape.js*',seam='riding?seatedRead:standingRead';
  await page.route(pattern,async route=>{
    const response=await route.fetch();let body=await response.text();
    if(reference) {
      if(!body.includes(seam))throw new Error('Missing read-row seam');
      body=body.replace(seam,'{low:0,high:rows-1}');
    }
    await route.fulfill({response,body});
  });
  try {
    for(const mode of ['reference','reach','reach','reference']) {
      reference=mode==='reference';
      await page.goto(`${origin}/e2e/fixtures/jevica.html`);
      await page.waitForFunction(()=>document.body.dataset.ready==='true');
      const result=await page.evaluate(()=>{
        const f=window.jevicaFixture,timings={walking:[],seated:[]},poses=[];let distance=0,x=100,z=-80;
        for(let frame=0;frame<420;frame++) {
          // Walk and turn (with a strike), sit for two seconds, then stand and walk off.
          const seated=frame>=240&&frame<360,speed=seated?0:frame<180?1.65:frame>=360?1.2:0;
          const yaw=frame<90?0:Math.min(1,(frame-90)/90)*Math.PI+(seated?Math.sin((frame-240)/20)*.2:0);
          distance+=speed/60;x+=Math.sin(yaw)*speed/60;z+=Math.cos(yaw)*speed/60;
          const info=f.render('full',frame*1000/60,speed,{distance,yaw,position:[x,0,z],riding:seated,seatToFloor:.45,
            action:frame>=120&&frame<180?'force':'continue'});
          if(frame>=30&&frame<240||frame>=360)timings.walking.push(info.costumeUpdateMs);
          else if(frame>=250&&frame<360)timings.seated.push(info.costumeUpdateMs);
          if(frame%30===29) {
            const skirt=f.avatar.object.getObjectByName('Jevica satin peplum'),{position,normal}=skirt.geometry.attributes;
            const gl=f.renderer.getContext(),pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
            gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
            let hash=2166136261;for(const pixel of pixels)hash=Math.imul(hash^pixel,16777619)>>>0;
            poses.push({frame,seated,vertices:Array.from(position.array),normals:Array.from(normal.array),pixelHash:hash});
          }
        }
        const stats=values=>{const sorted=[...values].sort((a,b)=>a-b);return {median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],samples:sorted.length};};
        return {poses,costumeUpdateMs:{walking:stats(timings.walking),seated:stats(timings.seated)}};
      });
      runs.push({mode,...result});
    }
    const baseline=runs[0].poses;
    check(baseline.some(pose=>pose.seated)&&baseline.some(pose=>!pose.seated),'Poses cover walking, seated and standing up');
    check(baseline.some((pose,i)=>i&&pose.vertices.some((v,j)=>v!==baseline[0].vertices[j])),'The peplum deforms between poses');
    for(const [index,run]of runs.entries()) {
      check(run.poses.every((pose,i)=>pose.vertices.every((v,j)=>v===baseline[i].vertices[j])),`Run ${index+1} (${run.mode}): every sampled peplum vertex matches the full row range exactly`);
      check(run.poses.every((pose,i)=>pose.normals.every((v,j)=>v===baseline[i].normals[j])),`Run ${index+1} (${run.mode}): every peplum normal matches exactly`);
      check(run.poses.every((pose,i)=>pose.pixelHash===baseline[i].pixelHash),`Run ${index+1} (${run.mode}): ${baseline.length} rendered poses match the reference pixel hashes`);
    }
    check(!errors.length,'No uncaught browser errors');
    return {checks,runs:runs.map(({mode,costumeUpdateMs,poses})=>({mode,costumeUpdateMs,frames:poses.map(({frame,seated,pixelHash})=>({frame,seated,pixelHash}))})),errors,
      scope:'Paired ABBA full-range versus read-row drape: exact peplum vertices, normals and pixel hashes over walking, seated and standing poses, and costume update CPU; not district frame-rate acceptance'};
  } finally {await page.unroute(pattern);}
}
