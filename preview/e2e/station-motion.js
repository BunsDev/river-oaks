async page=>{
  const origin=await page.evaluate(()=>location.origin),errors=[],runs=[];
  page.on('pageerror',error=>errors.push(error.message));
  for(const hz of [30,60,120]) {
    await page.goto(`${origin}/e2e/fixtures/workers.html`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    runs.push(await page.evaluate(hz=>{
      const f=window.workerFixture,results=[],mannequins=[];let now=1000;
      for(const figure of f.people.userData.figures.filter(x=>x.role==='mannequin')) {
        const visitor=f.focus(figure),before=figure.avatar.bones.map(b=>b.quaternion.clone().normalize());
        for(let frame=0;frame<hz;frame++){now+=1000/hz;f.people.userData.update(f.camera,now,f.state,visitor);}
        mannequins.push({store:figure.holder.userData.storeId,angle:Math.max(...figure.avatar.bones.map((b,i)=>b.quaternion.clone().normalize().angleTo(before[i]))),attention:figure.attention});
      }
      for(const figure of f.people.userData.figures.filter(x=>x.role!=='mannequin')) {
        const visitor=f.focus(figure),near=f.camera.position.clone(),offset=near.clone().sub(figure.holder.position).normalize();
        let previous=null,previousStage=null,maxSpeed=0,maxWristSpeed=0,maxResumeAngle=0,maxResumeDistance=0,maxPausedClockDrift=0,resumedWork=0,peakAttention=0;
        const stages=[['work',2],['far',.1],['return',2],['hidden',2],['resume',2],['conversation',1],['work-again',1]];
        for(const [stage,seconds] of stages)for(let frame=0;frame<Math.round(seconds*hz);frame++) {
          f.camera.position.copy(near);
          if(stage==='far'||stage==='hidden')f.camera.position.copy(figure.holder.position).addScaledVector(offset,stage==='far'?18:70);
          f.state.selectedId=stage==='conversation'?figure.id:null;
          now+=1000/hz;f.people.userData.update(f.camera,now,f.state,visitor);figure.holder.updateWorldMatrix(true,true);
          const pose={joints:figure.avatar.bones.map(b=>b.quaternion.clone().normalize()),wrists:['l','r'].map(side=>{const b=figure.avatar.model.getObjectByName(`hand_${side}`);return b.getWorldPosition(b.position.clone());}),workTime:figure.workTime};
          if(previous) {
            const angle=Math.max(...pose.joints.map((q,i)=>q.angleTo(previous.joints[i])));
            const distance=Math.max(...pose.wrists.map((p,i)=>p.distanceTo(previous.wrists[i])));
            maxSpeed=Math.max(maxSpeed,angle*hz);maxWristSpeed=Math.max(maxWristSpeed,distance*hz);
            if(frame===0&&['return','resume'].includes(stage)) {
              maxResumeAngle=Math.max(maxResumeAngle,angle);maxResumeDistance=Math.max(maxResumeDistance,distance);
            }
            if(['far','hidden','conversation'].includes(stage)&&stage===previousStage)maxPausedClockDrift=Math.max(maxPausedClockDrift,Math.abs(pose.workTime-previous.workTime));
          }
          if(stage==='work-again'&&previousStage===stage)resumedWork+=pose.workTime-previous.workTime;
          peakAttention=Math.max(peakAttention,figure.attention);
          previous=pose;previousStage=stage;
        }
        results.push({id:figure.id,kind:figure.task?.kind??(figure.seatedFeet?'seated':'standing'),maxSpeed,maxWristSpeed,maxResumeAngle,maxResumeDistance,maxPausedClockDrift,resumedWork,peakAttention});
      }
      return {hz,results,mannequins};
    },hz));
  }
  const failures=runs.flatMap(run=>run.results.filter(r=>r.resumedWork<.9||r.peakAttention<.9||r.maxResumeAngle>.001||r.maxResumeDistance>1e-5||r.maxPausedClockDrift>1e-8||r.maxSpeed>9||r.maxWristSpeed>2).map(r=>({hz:run.hz,...r})));
  if(errors.length||failures.length||runs.some(run=>run.results.length!==169||run.mannequins.length!==25||run.mannequins.some(m=>m.angle>.001||m.attention!==0)))throw new Error(JSON.stringify({errors,failures,runs}));
  return {runs,errors};
}
