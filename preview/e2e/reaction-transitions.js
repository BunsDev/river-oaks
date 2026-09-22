async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1600,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('http://127.0.0.1:5173/e2e/fixtures/reactions.html');await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const result=await page.evaluate(()=>{
    const actions=[['idle',60],['amazed',90],['idle',90],['startled',90],['enchanted',90],['greet',90],['idle',90],['startled',8],['greet',8],['amazed',8],['idle',90]];
    let previous=null,rest=null,maxJointStep=0,maxWristStep=0,frames=0,settledChecks=0;const failures=[];
    for(const [action,count] of actions)for(let frame=0;frame<count;frame++){
      const samples=window.reactionFixture.step(action,action==='startled'&&count===8&&frame===0?2:1/60);frames++;
      rest??=structuredClone(samples);
      if(frame===count-1&&count>=90)samples.forEach((sample,i)=>{
        const q=sample.joints.lowerarm_r,reference=rest[i].joints.lowerarm_r;
        const angle=2*Math.acos(Math.min(1,Math.abs(q.reduce((sum,v,k)=>sum+v*reference[k],0))));
        const [minimum,maximum]=action==='idle'?[0,0.002]:action==='greet'?[0.2,0.4]:[1.3,1.4];
        if(angle<minimum||angle>maximum)failures.push(`${sample.profile} does not reach ${action}: ${angle} rad from rest`);
        settledChecks++;
      });
      if(previous)samples.forEach((sample,i)=>{
        for(const [name,q] of Object.entries(sample.joints)){
          const dot=Math.abs(q.reduce((sum,value,k)=>sum+value*previous[i].joints[name][k],0));
          const angle=2*Math.acos(Math.min(1,dot));maxJointStep=Math.max(maxJointStep,angle);
          if(angle>0.15)failures.push(`${sample.profile} ${name} jumps ${angle.toFixed(3)} rad entering ${action} at frame ${frame}`);
        }
        sample.wrists.forEach((point,k)=>{const distance=Math.hypot(...point.map((value,j)=>value-previous[i].wrists[k][j]));maxWristStep=Math.max(maxWristStep,distance);if(distance>0.06)failures.push(`${sample.profile} wrist jumps ${distance.toFixed(3)} m entering ${action}`);});
      });previous=samples;
    }
    return {rigs:6,frames,settledChecks,maxJointStep,maxWristStep,failures};
  });
  if(result.failures.length)throw new Error(JSON.stringify(result));
  if(errors.length)throw new Error(errors.join('; '));
  return {...result,errors};
}
