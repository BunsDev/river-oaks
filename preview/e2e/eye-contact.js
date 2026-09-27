async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 await page.emulateMedia({reducedMotion:'no-preference'});
 try{
  await page.goto('http://127.0.0.1:5181/e2e/fixtures/workers.html');await page.waitForFunction(()=>window.workerFixture,null,{timeout:90000});
  const result=await page.evaluate(async()=>{
   const f=window.workerFixture,T=f.THREE,{AVATAR_PROFILES,loadResidentAvatar}=await import('/src/avatars.js'),results=[];
   const measure=(rig,target)=>{
    rig.model.updateWorldMatrix(true,true);
    return rig.eyes.pose.map(p=>{const b=rig.model.getObjectByName(p.name),direction=target.clone().sub(b.getWorldPosition(new T.Vector3())).normalize(),q=b.getWorldQuaternion(new T.Quaternion());return {error:new T.Vector3(0,0,1).applyQuaternion(q).angleTo(direction),q,local:b.quaternion.clone(),head:b.parent.getWorldQuaternion(new T.Quaternion())};});
   };
   let now=0;
   const audit=(id,rig,root,update,target,task)=>{
    const feet=['foot_l','foot_r'].map(n=>rig.model.getObjectByName(n)),planted=feet.map(b=>b.getWorldPosition(new T.Vector3()));
    let maxStep=0,maxLocalStep=0,maxHeadStep=0,maxError=0,maxFootDrift=0,maxContactError=0,previous;
    for(let i=0;i<240;i++){
     now+=1000/60;update(now,target);const eyes=measure(rig,target);
     if(previous)eyes.forEach((e,j)=>{maxStep=Math.max(maxStep,e.q.angleTo(previous[j].q));maxLocalStep=Math.max(maxLocalStep,e.local.angleTo(previous[j].local));maxHeadStep=Math.max(maxHeadStep,e.head.angleTo(previous[j].head));});previous=eyes;
     if(i>120)for(const e of eyes)maxError=Math.max(maxError,e.error);
     feet.forEach((b,j)=>maxFootDrift=Math.max(maxFootDrift,b.getWorldPosition(new T.Vector3()).distanceTo(planted[j])));
     for(const c of task?.contacts??[])maxContactError=Math.max(maxContactError,c.error);
    }
    if(maxError>.025||maxLocalStep>.07||maxHeadStep>.055||maxStep>.125||maxFootDrift>.002||maxContactError>.001)throw new Error(JSON.stringify({id,maxError,maxStep,maxLocalStep,maxHeadStep,maxFootDrift,maxContactError}));
    return {id,maxError,maxStep,maxLocalStep,maxHeadStep,maxFootDrift,maxContactError};
   };
   for(const [index,profile]of [...AVATAR_PROFILES,'jevica'].entries()){
    const avatar=await loadResidentAvatar(index,`eyes-${index}`,profile),root=avatar.object;root.rotation.y=.65;f.scene.add(root);
    for(let i=0;i<90;i++){now+=1000/60;avatar.update(now,'continue',false,{speed:0,distance:0},()=>0);}
    const origin=avatar.rig.model.getObjectByName('gaze_eye_l').getWorldPosition(new T.Vector3());
    const target=new T.Vector3(.45,.08,2).applyQuaternion(root.quaternion).add(origin);
    results.push({...audit(profile,avatar.rig,root,(time,t)=>avatar.update(time,'continue',true,{speed:0,distance:0},()=>0,t.toArray()),target),kind:'outdoor'});
    root.removeFromParent();avatar.dispose();
   }
   const figures=[],sources=new Set(),tasks=new Set();
   for(const p of f.people.userData.figures.filter(p=>p.id))if(!sources.has(p.avatar.source)){sources.add(p.avatar.source);figures.push(p);}
   for(const p of f.people.userData.figures.filter(p=>p.task))if(!tasks.has(p.task.kind)){tasks.add(p.task.kind);if(!figures.includes(p))figures.push(p);}
   for(const p of f.people.userData.figures.filter(p=>p.seatedFeet).slice(0,2))if(!figures.includes(p))figures.push(p);
   for(const p of figures){
    f.focus(p);f.state.selectedId=p.id;const origin=p.avatar.model.getObjectByName('gaze_eye_l').getWorldPosition(new T.Vector3()),target=new T.Vector3(-.4,.1,2).applyQuaternion(p.holder.quaternion).add(origin);
    results.push({...audit(p.id,p.avatar,p.holder,(time,t)=>f.people.userData.update(f.camera,time,f.state,[t.x,-t.z,t.y],p.id),target,p.task),kind:p.task?.kind??'guest',seated:Boolean(p.seatedFeet)});
   }
   const p=figures.find(p=>p.task);f.focus(p);f.state.selectedId=p.id;
   const head=p.avatar.model.getObjectByName('head'),forward=p.avatar.axes.get(head).z.clone().applyQuaternion(head.getWorldQuaternion(new T.Quaternion()));
   let target=p.avatar.model.getObjectByName('gaze_eye_l').getWorldPosition(new T.Vector3()).addScaledVector(forward,2);
   f.state.selectedId=null;
   const local=f.state.locals.find(l=>l.id===p.id);local.force={height:.15};const before=p.workTime;
   target.y+=.15;
   for(let i=0;i<180;i++){now+=1000/60;f.people.userData.update(f.camera,now,f.state,[target.x,-target.z,target.y]);}
   const held={error:Math.max(...measure(p.avatar,target).map(e=>e.error)),workClockDrift:p.workTime-before};
   if(held.error>.025||held.workClockDrift!==0)throw new Error(`Held worker eyes: ${JSON.stringify(held)}`);
   delete local.force;f.renderer.render(f.scene,f.camera);return {results,held};
  });
  for(const item of result.results)check(item.maxError<.025,`${item.id}: eye contact follows the animated head with stable support`);
  check(result.held.error<.025&&result.held.workClockDrift===0,'Held workers retain eye contact without advancing their work');
  check(!errors.length,'No uncaught eye-contact errors');return {checks,...result,errors};
 }finally{await page.goto('about:blank');}
}
