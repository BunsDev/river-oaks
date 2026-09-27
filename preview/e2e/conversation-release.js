async page => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1400,height:1000});
  await page.goto('http://127.0.0.1:5181/e2e/fixtures/carriage.html');
  await page.waitForFunction(()=>window.carriageFixture);
  const samples=await page.evaluate(async()=>{
    const {createCommunity}=await import('/src/community.js');
    const {createResidentLife,stepResidentLife}=await import('/src/resident-life.js');
    const {buildLocals}=await import('/src/locals.js');
    const f=window.carriageFixture;f.carriage.object.visible=false;f.avatar.object.visible=false;
    const host=document.createElement('div');host.id='canvas-host';document.body.append(host);
    const world={scene:'district',bounds_m:[-25,-25,25,25],collisionPolygons:[],communityLocations:Array.from({length:6},(_,i)=>({id:`start-${i}`,name:`Start ${i}`,position:[0,i*3,0]}))};
    const state=createCommunity(world),life=createResidentLife(world,state),group=buildLocals(world,state.locals);f.scene.add(group);await group.userData.ready;
    for(const local of state.locals)Object.assign(local.life,{route:[],waitUntil:Infinity});
    let frame=0;const samples=[];
    for(const [index,local] of state.locals.entries()) {
      const model=group.userData.models[index],origin=[...local.position],visitor=[origin[0],origin[1]+2,1.6];
      Object.assign(local.life,{heading:Math.PI/2,route:[[origin[0]+8,origin[1]]],destination:{id:'end',name:'East'}});
      group.userData.update(state,f.camera,frame++*1000/60,null,visitor);
      let previous=model.rotation.y,maxStep=0,maxHeadingError=0;
      const step=paused=>{
        stepResidentLife(life,1/60,{visitor,paused});
        group.userData.update(state,f.camera,frame++*1000/60,null,visitor);
        const yaw=model.rotation.y;
        maxStep=Math.max(maxStep,Math.abs(Math.atan2(Math.sin(yaw-previous),Math.cos(yaw-previous))));previous=yaw;
        maxHeadingError=Math.max(maxHeadingError,Math.abs(yaw-local.life.heading));
      };
      state.selectedId=local.id;
      for(let i=0;i<180;i++)step(true);
      const conversation={renderHeading:model.rotation.y,simulationHeading:local.life.heading,position:[...local.position],maxStep};
      maxStep=0;state.selectedId=null;
      for(let i=0;i<120;i++)step(false);
      samples.push({id:local.id,profile:model.userData.avatar.profile??index,conversation,maxReleaseStep:maxStep,maxHeadingError,travel:Math.hypot(local.position[0]-origin[0],local.position[1]-origin[1]),finalPosition:[...local.position]});
      local.life.route=[];local.life.waitUntil=Infinity;
    }
    f.camera.position.set(8,7,10);f.camera.lookAt(1,1,-6);f.renderer.render(f.scene,f.camera);
    return samples;
  });
  for(const sample of samples) {
    if(sample.maxHeadingError>1e-8)throw new Error(`${sample.id}: visible and simulated heading disagree`);
    if(sample.maxReleaseStep>3.2/60+1e-8 || sample.conversation.maxStep>3.2/60+1e-8)throw new Error(`${sample.id}: abrupt body turn`);
    if(Math.abs(sample.conversation.renderHeading-Math.PI)>.01)throw new Error(`${sample.id}: conversation did not face visitor`);
    if(sample.travel<.5)throw new Error(`${sample.id}: route failed to resume`);
  }
  if(errors.length)throw new Error(errors.join('; '));
  await page.screenshot({path:'output/playwright/conversation-release.png'});
  return {samples,errors,scope:'Six rendered production rigs, controlled conversation and route release; 180 paused conversation frames followed by 120 walking frames at 60 Hz per rig.'};
}
