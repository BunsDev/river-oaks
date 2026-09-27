async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1400,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  const origin=await page.evaluate(()=>location.origin);
  await page.goto(`${origin.startsWith('http')?origin:'http://127.0.0.1:5173'}/e2e/fixtures/workers.html`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const results=await page.evaluate(()=>{
    const fixture=window.workerFixture,{people,camera,state}=fixture;
    const THREE={Vector3:camera.position.constructor,Quaternion:camera.quaternion.constructor};
    const workers=people.userData.figures.filter(figure=>figure.task?.kind==='blotter'),results=[];
    let now=1000;
    for(const hz of [30,60,120])for(const figure of workers) {
      const visitor=fixture.focus(figure);figure.workTime=0;figure.motionTime=0;figure.attention=0;figure.suspended=true;state.selectedId=null;
      let prior=null,maxWristSpeed=0,maxTipSpeed=0,maxAngularSpeed=0,pauseStart=null,pauseEnd=null,resumeStart=null,minHeight=Infinity,maxHeight=-Infinity,pausePosition=null,pausePositionDrift=0;
      for(let frame=0;frame<=17*hz;frame++) {
        const time=frame/hz;state.selectedId=time>=6&&time<8?figure.id:null;
        now+=1000/hz;people.userData.update(camera,now,state,visitor);
        const strip=figure.task.strip,hand=figure.avatar.model.getObjectByName('hand_r');
        const position=strip.getWorldPosition(new THREE.Vector3());minHeight=Math.min(minHeight,position.y);maxHeight=Math.max(maxHeight,position.y);
        const wrist=hand.getWorldPosition(new THREE.Vector3()),tip=strip.localToWorld(new THREE.Vector3(0,0,0.117)),rotation=strip.getWorldQuaternion(new THREE.Quaternion());
        if(prior&&frame>hz) {
          maxWristSpeed=Math.max(maxWristSpeed,wrist.distanceTo(prior.wrist)*hz);
          maxTipSpeed=Math.max(maxTipSpeed,tip.distanceTo(prior.tip)*hz);
          maxAngularSpeed=Math.max(maxAngularSpeed,rotation.angleTo(prior.rotation)*hz);
        }
        prior={wrist,tip,rotation};
        if(frame===6*hz){pauseStart=figure.workTime;pausePosition=position.clone();}
        if(time>=6&&time<8)pausePositionDrift=Math.max(pausePositionDrift,position.distanceTo(pausePosition));
        if(frame===8*hz-1)pauseEnd=figure.workTime;
        if(frame===8*hz)resumeStart=figure.workTime;
      }
      results.push({id:figure.id,hz,maxWristSpeed,maxTipSpeed,maxAngularSpeed,lift:maxHeight-minHeight,pausePositionDrift,pauseDrift:pauseEnd-pauseStart,resumedWork:figure.workTime-resumeStart});
    }
    fixture.renderer.render(fixture.scene,camera);
    return results;
  });
  for(const result of results) {
    if(result.pauseDrift!==0||result.pausePositionDrift>0.000001||result.lift<0.15||result.resumedWork<8.9||result.maxWristSpeed>1.5||result.maxTipSpeed>1.5||result.maxAngularSpeed>6)throw new Error(JSON.stringify(result));
  }
  if(results.length!==6||errors.length)throw new Error(JSON.stringify({cases:results.length,errors}));
  return {results,errors};
}
