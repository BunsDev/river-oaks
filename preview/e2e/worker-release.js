async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1400,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('http://127.0.0.1:5173/e2e/fixtures/workers.html');await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const result=await page.evaluate(()=>{
  const f=window.workerFixture,figures=f.people.userData.figures.filter(p=>p.task?.docked),results=[],failures=[];
  const Vector3=f.camera.position.constructor,Quaternion=f.camera.quaternion.constructor;
  let now=1000;
  for(const hz of [30,60,120])for(const figure of figures) {
    const visitor=f.focus(figure);figure.workTime=0;figure.motionTime=0;figure.attention=0;figure.suspended=true;f.state.selectedId=null;
    let prior=null,maxSpeed=0,maxAngularSpeed=0,pauseTime=null,pauseHands=null,pauseContacts=null,pausedWristDrift=0,pausedDrift=0,gripSamples=0,releaseSamples=0,skinSamples=0,bodySamples=0;
    for(let frame=0;frame<=15*hz;frame++) {
      const time=frame/hz;f.state.selectedId=time>=.9&&time<2.9?figure.id:null;
      now+=1000/hz;f.people.userData.update(f.camera,now,f.state,visitor);
      const task=figure.task,position=task.object.getWorldPosition(new Vector3());
      const hands=['l','r'].map(side=>{const hand=figure.avatar.model.getObjectByName(`hand_${side}`);return {position:hand.getWorldPosition(new Vector3()),rotation:hand.getWorldQuaternion(new Quaternion())};});
      if(prior&&frame>0)for(let i=0;i<2;i++) {
        maxSpeed=Math.max(maxSpeed,hands[i].position.distanceTo(prior[i].position)*hz);
        maxAngularSpeed=Math.max(maxAngularSpeed,hands[i].rotation.angleTo(prior[i].rotation)*hz);
      }
      prior=hands;
      if(frame===Math.ceil(.9*hz)){pauseTime=figure.workTime;pauseHands=hands;pauseContacts=task.contacts.map(c=>new Vector3(...c.actual));}
      if(time>=.9&&time<2.9){if(figure.workTime!==pauseTime)failures.push({id:figure.id,hz,frame,reason:'work advanced in conversation'});for(let i=0;i<2;i++)pausedWristDrift=Math.max(pausedWristDrift,hands[i].position.distanceTo(pauseHands[i].position));for(let i=0;i<2;i++)pausedDrift=Math.max(pausedDrift,new Vector3(...task.contacts[i].actual).distanceTo(pauseContacts[i]));}
      for(const c of task.contacts){if(c.engaged)gripSamples++;else releaseSamples++;if(c.error>.001)failures.push({id:figure.id,hz,frame,contact:c});}
      const phase=figure.workTime%12;
      // Dense rendered skin checks throughout withdrawal and re-grasp. The
      // complete body is checked at both ends and during the intermediate curl.
      if(frame%Math.max(1,Math.round(hz/12))===0&&(phase<2||phase>10)) {
        const skin=f.inspectSkin(figure);skinSamples+=skin.length;
        for(const s of skin)if(s.collisions||s.loadPenetrations||s.wristBend>=Math.PI/2||s.sidewaysBend>Math.PI/9||(s.engaged&&s.kind==='support'&&(s.top>.0001||s.top<-.002)))failures.push({id:figure.id,hz,frame,phase,skin:s});
        if(frame%Math.max(1,Math.round(hz/3))===0){const body=f.inspectBody(figure);bodySamples++;if(body.collisions)failures.push({id:figure.id,hz,frame,phase,body});}
      }
    }
    if(maxSpeed>1.2||maxAngularSpeed>7||pausedDrift>.000001||!releaseSamples||!gripSamples)failures.push({id:figure.id,hz,maxSpeed,maxAngularSpeed,pausedWristDrift,pausedDrift,gripSamples,releaseSamples});
    results.push({id:figure.id,kind:figure.task.kind,hz,maxSpeed,maxAngularSpeed,pausedWristDrift,pausedDrift,gripSamples,releaseSamples,skinSamples,bodySamples});
  }
  return {results,failures:failures.slice(0,20),failureCount:failures.length};
 });
 if(result.failureCount||result.results.length!==51||errors.length)throw new Error(JSON.stringify({...result,results:result.results.slice(0,4),errors}));
 return {...result,errors};
}
