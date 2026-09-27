async page=>{
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto('http://127.0.0.1:5181/e2e/fixtures/workers.html?reduced');
 await page.waitForFunction(()=>window.workerFixture,null,{timeout:90000});
 const stations=await page.evaluate(()=>{
  const f=window.workerFixture,T=f.THREE,sources=new Set(),figures=[];
  for(const figure of f.people.userData.figures.filter(p=>p.id))if(!sources.has(figure.avatar.source)){sources.add(figure.avatar.source);figures.push(figure);}
  const tasks=new Set();
  for(const figure of f.people.userData.figures.filter(p=>p.task))if(!tasks.has(figure.task.kind)){tasks.add(figure.task.kind);if(!figures.includes(figure))figures.push(figure);}
  for(const figure of f.people.userData.figures.filter(p=>p.seatedFeet).slice(0,2))if(!figures.includes(figure))figures.push(figure);
  const results=[];let now=1000;
  for(const figure of figures){
   f.focus(figure);f.state.selectedId=figure.id;
   const head=figure.avatar.model.getObjectByName('head'),base=head.getWorldPosition(new T.Vector3());
   const front=new T.Vector3(0,0,2).applyQuaternion(figure.holder.quaternion).add(base);
   const feet=['foot_l','foot_r'].map(name=>figure.avatar.model.getObjectByName(name));
   let maxStep=0,maxFootDrift=0,maxContactError=0;const samples=[];
   const planted=feet.map(foot=>foot.getWorldPosition(new T.Vector3()));let previous=null;
   for(const height of [-.65,1]) {
    const visitor=[front.x,-front.z,base.y+height];
    for(let i=0;i<180;i++){
     now+=1000/60;f.people.userData.update(f.camera,now,f.state,visitor);figure.holder.updateWorldMatrix(true,true);
     const orientation=head.getWorldQuaternion(new T.Quaternion());
     if(previous)maxStep=Math.max(maxStep,orientation.angleTo(previous));previous=orientation;
     feet.forEach((foot,index)=>{maxFootDrift=Math.max(maxFootDrift,foot.getWorldPosition(new T.Vector3()).distanceTo(planted[index]));});
     for(const contact of figure.task?.contacts??[])maxContactError=Math.max(maxContactError,contact.error);
    }
    const forward=figure.avatar.axes.get(head).z.clone().applyQuaternion(head.getWorldQuaternion(new T.Quaternion()));
    samples.push(Math.asin(forward.y));
   }
   if(samples[0]>-.18||samples[1]<.3)throw new Error(`Station gaze fails to follow height: ${figure.id} ${samples}`);
   if(maxStep>.055||maxFootDrift>.002||maxContactError>.001)throw new Error(`Station support/continuity: ${JSON.stringify({id:figure.id,maxStep,maxFootDrift,maxContactError})}`);
   results.push({id:figure.id,task:figure.task?.kind??null,seated:Boolean(figure.seatedFeet),samples,maxStep,maxFootDrift,maxContactError});
  }
  f.renderer.render(f.scene,f.camera);return results;
 });
 await page.screenshot({path:'output/playwright/conversation-gaze-seated.png'});
 const outdoor=await page.evaluate(async()=>{
  const f=window.workerFixture,T=f.THREE,{AVATAR_PROFILES,loadResidentAvatar}=await import('/src/avatars.js');
  const scene=new T.Scene();scene.background=new T.Color('#e7e5df');scene.add(new T.HemisphereLight('#eff5ff','#817565',2.5));
  const sun=new T.DirectionalLight('#fff1dc',3);sun.position.set(3,7,5);scene.add(sun);
  const results=[];let now=0;
  for(const [index,profile] of AVATAR_PROFILES.entries()){
   const avatar=await loadResidentAvatar(index,`gaze-${index}`,profile);avatar.object.position.x=(index-2.5)*1.25;scene.add(avatar.object);
   for(let i=0;i<120;i++){now+=1000/60;avatar.update(now,'continue',false,{speed:0,distance:0},()=>0);}
   const head=avatar.rig.model.getObjectByName('head'),origin=head.getWorldPosition(new T.Vector3());
   const feet=avatar.feet.map(leg=>leg.foot),planted=feet.map(foot=>foot.getWorldPosition(new T.Vector3()));
   let maxStep=0,maxFootDrift=0,previous=null;const samples=[];
   for(const height of [-.65,1]){
    const target=[origin.x,origin.y+height,origin.z+2];
    for(let i=0;i<180;i++){
     now+=1000/60;avatar.update(now,'continue',false,{speed:0,distance:0},()=>0,target);avatar.object.updateWorldMatrix(true,true);
     const orientation=head.getWorldQuaternion(new T.Quaternion());if(previous)maxStep=Math.max(maxStep,orientation.angleTo(previous));previous=orientation;
     feet.forEach((foot,index)=>{maxFootDrift=Math.max(maxFootDrift,foot.getWorldPosition(new T.Vector3()).distanceTo(planted[index]));});
    }
    const forward=avatar.rig.axes.get(head).z.clone().applyQuaternion(head.getWorldQuaternion(new T.Quaternion()));samples.push(Math.asin(forward.y));
   }
   if(samples[0]>-.18||samples[1]<.3||maxStep>.055||maxFootDrift>.002)throw new Error(`Outdoor gaze/support: ${JSON.stringify({profile,samples,maxStep,maxFootDrift})}`);
   results.push({profile,samples,maxStep,maxFootDrift});
  }
  f.camera.position.set(0,2.1,10);f.camera.lookAt(0,1,0);f.renderer.render(scene,f.camera);return results;
 });
 await page.screenshot({path:'output/playwright/conversation-gaze-outdoor.png'});
 if(errors.length)throw new Error(errors.join('; '));
 return {stations,outdoor,errors,scope:'Rendered production rigs with measured head orientation, per-frame continuity and support stability; controlled fixture targets.'};
}
