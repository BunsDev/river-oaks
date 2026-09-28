async page=>{
 const checks=[],errors=[],outdoor=[],stations=[],interruptions=[];
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 page.on('pageerror',e=>errors.push(e.message));
 await page.emulateMedia({reducedMotion:'no-preference'});
 const origin=await page.evaluate(()=>location.origin);
 await page.goto(`${origin}/e2e/fixtures/workers.html`);
 await page.waitForFunction(()=>window.workerFixture,null,{timeout:90000});
 outdoor.push(...await page.evaluate(async()=>{
  const f=window.workerFixture,T=f.THREE,{AVATAR_PROFILES,loadResidentAvatar}=await import('/src/avatars.js'),results=[];
  for(const [index,profile] of [...AVATAR_PROFILES,'jevica'].entries()){
   const avatar=await loadResidentAvatar(index,`conversation-${index}`,profile);
   const head=avatar.rig.model.getObjectByName('head');let now=0,previous=null,maxStep=0,maxFootDrift=0,peak=0,quiet=0;
   for(let i=0;i<90;i++){now+=1000/60;avatar.update(now,'continue',false,{speed:0,distance:0},()=>0);}
   const feet=avatar.feet.map(l=>l.foot),planted=feet.map(b=>b.getWorldPosition(new T.Vector3()));
   const hands=['hand_l','hand_r'].map(n=>avatar.rig.model.getObjectByName(n)),rest=hands.map(b=>b.getWorldPosition(new T.Vector3()));
   let handTravel=0,quietHands=0;
   for(let i=0;i<720;i++){
    // Ask puts a resident in the greeting action for the conversation.
    now+=1000/60;avatar.update(now,'greet',true,{speed:0,distance:0},()=>0,[0,1.7,3]);avatar.object.updateWorldMatrix(true,true);
    const q=head.getWorldQuaternion(new T.Quaternion());if(previous)maxStep=Math.max(maxStep,previous.angleTo(q));previous=q;
    feet.forEach((b,j)=>maxFootDrift=Math.max(maxFootDrift,b.getWorldPosition(new T.Vector3()).distanceTo(planted[j])));
    const nod=avatar.conversationPose;peak=Math.max(peak,nod.pitch);if(nod.pitch<.002)quiet++;
    hands.forEach((b,j)=>handTravel=Math.max(handTravel,b.getWorldPosition(new T.Vector3()).distanceTo(rest[j])));
    if(nod.left<.02&&nod.right<.02)quietHands++;
   }
   results.push({profile,maxStep,maxFootDrift,peak,handTravel,quietHandFraction:quietHands/720,quietFraction:quiet/720});avatar.dispose();
  }
  return results;
 }));
 for(const r of outdoor){check(r.peak>.025&&r.quietFraction>.25,`${r.profile}: speech has nods and quiet intervals`);check(r.handTravel>.15&&r.handTravel<.5&&r.quietHandFraction>.2,`${r.profile}: hands gesture then rest (${r.handTravel})`);check(r.maxStep<.008&&r.maxFootDrift<.002,`${r.profile}: continuous head motion with planted feet`);}
 interruptions.push(...await page.evaluate(async()=>{
  const {loadResidentAvatar}=await import('/src/avatars.js'),results=[];
  for(const hz of [30,60,120]) {
   const avatar=await loadResidentAvatar(0,'conversation-interrupt','woman-casual');let now=0,distance=0;
   const step=(speaking,action='continue',motion={speed:0})=>{now+=1000/hz;distance+=(motion.speed??0)/hz;avatar.update(now,action,speaking,{...motion,distance},()=>0);};
   for(const stage of [
    {name:'close',speaking:false},{name:'walking',motion:{speed:1.2}},{name:'carrying',motion:{speed:0,carrying:true}},
    {name:'force',action:'force'},{name:'startled',action:'startled'},{name:'flying',motion:{speed:0,flying:true}},
    {name:'riding',motion:{speed:0,riding:true}},
   ]) {
    for(let i=0;i<hz*4;i++)step(true);
    avatar.suspend();const before=avatar.conversationPose;now+=5000;
    avatar.update(now,'continue',true,{speed:0,distance},()=>0);
    const resumed=avatar.conversationPose;
    for(let i=0;i<hz*3;i++)step(stage.speaking??true,stage.action,stage.motion);
    const pose=avatar.conversationPose,keys=['left','right','leftBeat','rightBeat','lean','turn','tilt'];
    results.push({hz,stage:stage.name,remaining:Math.max(...keys.map(key=>Math.abs(pose[key]))),resumeDelta:Math.max(...Object.keys(before).map(key=>Math.abs(before[key]-resumed[key])))});
   }
   avatar.dispose();
  }
  return results;
 }));
 for(const r of interruptions)check(r.remaining<1e-8&&r.resumeDelta===0,`${r.hz} Hz/${r.stage}: gestures yield and culling does not catch up`);
 stations.push(...await page.evaluate(()=>{
  const f=window.workerFixture,T=f.THREE,seen=new Set(),figures=[];
  for(const p of f.people.userData.figures.filter(p=>p.id)) {
   const key=p.task?.kind??(p.seatedFeet?'seated':null);
   if(key&&!seen.has(key)){seen.add(key);figures.push(p);}
  }
  const results=[];let now=1000;
  for(const figure of figures){
   const visitor=f.focus(figure);f.state.selectedId=figure.id;
   for(let i=0;i<120;i++){now+=1000/60;f.people.userData.update(f.camera,now,f.state,visitor);}
   const head=figure.avatar.model.getObjectByName('head'),feet=['foot_l','foot_r'].map(n=>figure.avatar.model.getObjectByName(n));
   const planted=feet.map(b=>b.getWorldPosition(new T.Vector3())),workTime=figure.workTime;
   let maxFootDrift=0,maxStep=0,maxContactError=0,peak=0,quiet=0,previous=null;
   for(let i=0;i<240;i++){
    now+=1000/30;f.people.userData.update(f.camera,now,f.state,visitor,figure.id);figure.holder.updateWorldMatrix(true,true);
    const q=head.getWorldQuaternion(new T.Quaternion());if(previous)maxStep=Math.max(maxStep,previous.angleTo(q));previous=q;
    feet.forEach((b,j)=>maxFootDrift=Math.max(maxFootDrift,b.getWorldPosition(new T.Vector3()).distanceTo(planted[j])));
    for(const c of figure.task?.contacts??[])maxContactError=Math.max(maxContactError,c.error);
    peak=Math.max(peak,figure.conversationPose.pitch);if(figure.conversationPose.pitch<.002)quiet++;
   }
   results.push({id:figure.id,kind:figure.task?.kind??'seated',maxFootDrift,maxStep,maxContactError,peak,quietFraction:quiet/240,workClockDrift:figure.workTime-workTime});
  }
  f.renderer.render(f.scene,f.camera);return results;
 }));
 for(const r of stations){check(r.peak>.025&&r.quietFraction>.2,`${r.kind}: staff receive speaking motion`);check(r.maxStep<.015&&r.maxFootDrift<.002&&r.maxContactError<.001&&r.workClockDrift===0,`${r.kind}: speech preserves support and paused work`);}
 await page.screenshot({path:'output/playwright/conversation-motion-station.png'});
 await page.emulateMedia({reducedMotion:'reduce'});
 const reduced=await page.evaluate(async()=>{
  const {loadResidentAvatar}=await import('/src/avatars.js'),avatar=await loadResidentAvatar(0,'reduced-speaker','woman-casual');
  for(let i=0;i<360;i++)avatar.update(i*1000/60,'continue',true,{speed:0,distance:0},()=>0,[0,1.7,3]);
  const pose=avatar.conversationPose;avatar.dispose();return pose;
 });
 check(Object.values(reduced).every(value=>value===0),'Reduced motion suppresses conversation head and body gestures');
 check(!errors.length,'No uncaught conversation motion errors');
 return {checks,outdoor,stations,interruptions,reduced,errors,scope:'Actual production rigs and station tasks, including seated people. Procedural conversation phrases, planted feet, steady gaze and preserved hand contacts; not speech- or phoneme-aligned.'};
}
