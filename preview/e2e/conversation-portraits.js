async page=>{
 const images=[];
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1260,height:600});
 for(const rig of [0,5]){
  await page.goto(`http://127.0.0.1:5181/e2e/fixtures/jevica.html?resident=conversation-${rig}&rig=${rig}`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
  const poses=await page.evaluate(()=>{
   const f=window.jevicaFixture,canvas=document.createElement('canvas');canvas.width=1260;canvas.height=600;canvas.className='conversation-filmstrip';
   const ctx=canvas.getContext('2d');ctx.fillStyle='#eeeae5';ctx.fillRect(0,0,1260,600);ctx.font='18px sans-serif';ctx.textAlign='center';
   f.renderer.setSize(420,560);f.camera.aspect=420/560;f.camera.updateProjectionMatrix();f.render('portrait',0);
   const poses=[];
   const capture=label=>{const column=poses.length;f.renderer.render(f.scene,f.camera);ctx.drawImage(f.renderer.domElement,column*420,0);ctx.fillStyle='#302c28';ctx.fillText(label,column*420+210,586);poses.push({label,...f.avatar.conversationPose});};
   capture('Rest');let nodded=false;
   for(let i=1;i<=600&&poses.length<3;i++){
    f.avatar.update(i*1000/60,'continue',true,{speed:0,distance:0},()=>0);
    const pitch=f.avatar.conversationPose.pitch;
    if(!nodded&&pitch>.035){capture('Speaking nod');nodded=true;}
    else if(nodded&&pitch<.001)capture('Pause');
   }
   if(poses.length!==3)throw new Error('Missing conversation pose');
   f.renderer.domElement.style.display='none';document.body.append(canvas);return poses;
  });
  const path=`output/playwright/conversation-portraits-${rig}.png`;await page.locator('.conversation-filmstrip').screenshot({path});images.push({rig,poses,path});
 }
 await page.goto('about:blank');return {images};
}
