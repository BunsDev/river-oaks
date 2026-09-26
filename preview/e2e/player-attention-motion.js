async page=>{
 const checks=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1260,height:700});
 try{
  await page.goto('http://127.0.0.1:5181/e2e/fixtures/jevica.html');await page.waitForFunction(()=>window.jevicaFixture,null,{timeout:90000});
  const result=await page.evaluate(async()=>{
   const f=window.jevicaFixture,{createPlayerAttention}=await import('/src/player-attention.js'),attention=createPlayerAttention();
   f.renderer.setSize(420,660);f.camera.aspect=420/660;f.camera.updateProjectionMatrix();f.render('full',0);
   const canvas=document.createElement('canvas');canvas.width=1260;canvas.height=700;const ctx=canvas.getContext('2d');ctx.fillStyle='#eee9e3';ctx.fillRect(0,0,1260,700);ctx.fillStyle='#292621';ctx.font='20px sans-serif';ctx.textAlign='center';
   const conversation={position:[3,-3,0],eyeHeight:1.6},samples=[],previous=new Map();let heading=3.1,maxError=0,slip=0,steps=0;
   f.holder.rotation.y=heading;
   for(let i=1;i<=120;i++)f.avatar.update(i*1000/60,'continue',false,{speed:0,distance:0},()=>0);
   for(let i=0;i<=360;i++){
    const focus=attention.update(i?1/60:0,{position:[0,0,0],heading,conversation,speed:0});heading=focus.facing;f.holder.rotation.y=heading;
    f.avatar.update(2000+i*1000/60,'continue',false,{speed:0,distance:0},()=>0,focus.target,{conversing:true});f.outfit.update(false,2000+i*1000/60);f.outfit.updateOptics(f.camera,660);
    for(const leg of f.avatar.feet){maxError=Math.max(maxError,leg.error??0);const old=previous.get(leg.side);if(old?.contact&&leg.contact)slip=Math.max(slip,leg.target.distanceTo(old.target));if(!leg.contact)steps++;previous.set(leg.side,{contact:leg.contact,target:leg.target.clone()});}
    const slot=[0,60,360].indexOf(i);if(slot>=0){f.renderer.render(f.scene,f.camera);ctx.drawImage(f.renderer.domElement,slot*420,0);ctx.fillText(['Attention begins','Turning','Listening'][slot],slot*420+210,685);samples.push({seconds:i/60,heading,eyes:f.avatar.rig.eyes.pose,nod:f.avatar.conversationPose});}
   }
   document.body.replaceChildren(canvas);return {maxError,slip,steps,samples};
  });
  if(result.maxError>.005||result.slip>.001||result.steps<10)throw new Error(JSON.stringify(result));
  checks.push('Jevica steps through a conversation turn without foot target slip','The real rig reaches its planted support targets');
  if(Math.abs(result.samples.at(-1).heading-Math.PI/4)>.01)throw new Error('Body failed to settle toward the speaker');checks.push('Standing body settles toward the speaker');
  await page.screenshot({path:'output/playwright/player-attention-motion.png'});if(errors.length)throw new Error(errors.join('; '));checks.push('No uncaught motion fixture errors');return {checks,...result,errors};
 }finally{await page.goto('about:blank');}
}
