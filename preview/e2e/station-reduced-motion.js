async page=>{
  const origin=await page.evaluate(()=>location.origin),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`${origin}/e2e/fixtures/workers.html?reduced=1`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const results=await page.evaluate(()=>{
    const f=window.workerFixture,results=[];let now=1000;
    for(const figure of f.people.userData.figures.filter(p=>p.id)) {
      const visitor=f.focus(figure),before=figure.avatar.bones.map(b=>b.quaternion.clone().normalize()),workTime=figure.workTime;
      let taskCalls=0;const update=figure.task?.update;
      if(update)figure.task.update=(...args)=>{taskCalls++;return update(...args);};
      for(let frame=0;frame<60;frame++){now+=1000/60;f.people.userData.update(f.camera,now,f.state,visitor);}
      const idleTaskUpdates=taskCalls;
      const idleAngle=Math.max(...figure.avatar.bones.map((b,i)=>b.quaternion.clone().normalize().angleTo(before[i])));
      f.state.selectedId=figure.id;
      for(let frame=0;frame<60;frame++){now+=1000/60;f.people.userData.update(f.camera,now,f.state,visitor);}
      results.push({id:figure.id,idleAngle,idleTaskUpdates,workDrift:figure.workTime-workTime,attention:figure.attention});
      f.state.selectedId=null;if(update)figure.task.update=update;
    }
    return results;
  });
  const failures=results.filter(r=>r.idleAngle>.001||r.idleTaskUpdates!==0||r.workDrift!==0||r.attention<.9);
  if(results.length!==169||failures.length||errors.length)throw new Error(JSON.stringify({errors,failures,count:results.length}));
  return {results,errors};
}
