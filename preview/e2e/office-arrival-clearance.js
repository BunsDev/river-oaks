async page => {
  const errors=[],results=[],captures=[],stage=process.env.RIVER_OAKS_ARRIVAL_STAGE??'final';
  if(!/^[a-z-]+$/.test(stage))throw new Error('Invalid capture stage');
  page.on('pageerror',error=>errors.push(error.stack??error.message));
  await page.setViewportSize({width:1024,height:900});
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/office-elevator.html');
  await page.waitForFunction(()=>window.officeFixture?.frames.at(-1)?.ready,null,{timeout:90000});
  const looks=await page.evaluate(()=>window.officeFixture.appearances.flatMap(a=>['upright'].map(movement=>({appearance:a.id,movement}))));
  for(const look of looks){
    await page.evaluate(({appearance,movement})=>window.officeFixture.reset(appearance,movement),look);
    await page.waitForFunction(()=>window.officeFixture.frames.at(-1)?.ready,null,{timeout:90000});
    const result=await page.evaluate(()=>{
      const f=window.officeFixture,a=f.scene.inspect().dimensions,failures=[],frames=[];
      const envelope={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
      let rearCrossings=0,frontCrossings=0,closedSamples=0;
      // Render the actual walking/prowling rig at 30 Hz. Measure visible skinned
      // meshes every other frame through both doors, including tails/costume.
      for(let i=0;i<=Math.ceil(a.duration*30);i++){
        const time=i/30,frame=f.draw(time);if(i%2)continue;
        const inspected=f.scene.inspect({bounds:true}),box=inspected.bounds.find(b=>b.id===f.self.id);
        if(!box)continue;
        if(![...box.min,...box.max].every(Number.isFinite)){failures.push({time,error:'nonfinite bounds'});continue;}
        const actor=inspected.actors.find(actor=>actor.id===f.self.id);
        if(actor.appearance!==f.self.appearance||actor.movement!==f.self.movement)failures.push({time,error:'wrong loaded appearance or movement',actor});
        box.min.forEach((v,j)=>envelope.min[j]=Math.min(envelope.min[j],v-actor.position[j]));
        box.max.forEach((v,j)=>envelope.max[j]=Math.max(envelope.max[j],v-actor.position[j]));
        for(const [name,z] of [['rear',4],['front',a.frontPortalZ]])if(box.min[2]<=z+.12&&box.max[2]>=z-.12){
          if(name==='rear')rearCrossings++;else frontCrossings++;
          if(box.min[0]<-a.doorWidth/2||box.max[0]>a.doorWidth/2||box.max[1]>a.doorHeight||frame.doors!==1)failures.push({time,portal:name,phase:frame.phase,doors:frame.doors,box});
        }
        if(frame.phase==='ascending'){
          closedSamples++;
          if(box.min[2]<a.frontPortalZ+.12||box.max[2]>3.88||box.min[0]<-a.carWidth/2+.1||box.max[0]>a.carWidth/2-.1)failures.push({time,error:'body outside closed cabin',box});
        }
        if(i%15===0)frames.push({time,phase:frame.phase,box,position:actor.position});
      }
      return {envelope,rearCrossings,frontCrossings,closedSamples,failures,frames};
    });
    results.push({...look,...result});
    // Repeat the authored path for representative in-motion views, rather than
    // seeking backward through interpolation and inventing a pose.
    await page.evaluate(({appearance,movement})=>window.officeFixture.reset(appearance,movement),look);
    await page.waitForFunction(()=>window.officeFixture.frames.at(-1)?.ready,null,{timeout:90000});
    for(const [label,time]of [['boarding',2.55],['cabin',6.4],['arrival',9.2]]){
      await page.evaluate(time=>{const f=window.officeFixture;for(let t=f.time;t<time;t+=1/30)f.draw(t);f.draw(time);},time);
      const path=`output/playwright/office-clearance-${stage}-${look.appearance}-${look.movement}-${label}.png`;await page.screenshot({path});captures.push(path);
    }
    console.log(`${look.appearance}/${look.movement}: ${result.failures.length} clearance failures; ${result.rearCrossings}/${result.frontCrossings} portal samples`);
  }
  const failed=results.filter(r=>r.failures.length||!r.rearCrossings||!r.frontCrossings||!r.closedSamples);
  // Keep the whole diagnostic even when the final assertion fails.
  const fs=await import('node:fs/promises');
  await fs.writeFile(`data/reports/office-arrival-clearance-${stage}-details.json`,JSON.stringify({results,captures,errors,scope:'Actual rendered skins and visible attachments at 30 Hz; measured conservative world bounds at 15 Hz. Presentation fixture, not server traversal proof.'},null,2)+'\n');
  if(errors.length||failed.length)throw new Error(JSON.stringify({errors,failures:failed.map(r=>({appearance:r.appearance,movement:r.movement,failures:r.failures.slice(0,3),rear:r.rearCrossings,front:r.frontCrossings}))}));
  return {looks:results.length,captures,results,errors};
}
