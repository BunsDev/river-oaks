async page=>{
 const root='/Users/buns/Documents/GitHub/BunsDev/.worktrees/river-oaks/people-motion-delivery',profiles=['woman-casual','man-casual','woman-tailored','man-tailored','woman-daywear','man-workwear','jevica'];
 const checks=[],runs=[],errors=[];const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(m.text()))errors.push(m.text());});
 await page.setViewportSize({width:1120,height:370});await page.emulateMedia({reducedMotion:'reduce'});
 await page.route('**/v1/voice',route=>route.fulfill({contentType:'audio/wav',path:`${root}/data/raw/speech-voice-checks/integrated.wav`}));
 try{
  for(const [i,profile]of profiles.entries()){
   const id=i===6?'player':`speech-check-${i}`;
   await page.goto(`http://127.0.0.1:5181/e2e/fixtures/jevica.html${i===6?'':`?resident=${id}&rig=${i}`}`);await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});await page.mouse.click(5,5);
   const result=await page.evaluate(async id=>{
    const avatarModule=await(await fetch('/src/avatars.js')).text(),speechUrl=avatarModule.match(/from\s+['"]([^'"]*speech-avatar\.js[^'"]*)['"]/)[1];
    const {createLocalSpeech}=await import('/src/speech.js'),{prepareSpeechAvatar}=await import(speechUrl),f=window.jevicaFixture;
    f.renderer.setSize(280,340);f.camera.aspect=280/340;f.camera.updateProjectionMatrix();
    const canvas=document.createElement('canvas');canvas.width=1120;canvas.height=370;const ctx=canvas.getContext('2d');ctx.fillStyle='#eee9e3';ctx.fillRect(0,0,1120,370);ctx.font='16px sans-serif';ctx.fillStyle='#24211e';ctx.textAlign='center';
    const status=[],speech=createLocalSpeech(s=>status.push(s),{prepare:prepareSpeechAvatar}),before=[];f.avatar.rig.model.traverse(m=>{if(m.isMesh)before.push([m,m.geometry]);});
    const peaks={},samples=[];let done=false,success=false,last=performance.now(),started=null,slot=0;
    speech.setMode('kokoro');const pending=speech.speak({id},'Welcome back, Jevica. Your carriage is waiting by the fountain.').then(result=>{success=result;done=true;});
    const deadline=performance.now()+20000;
    while(performance.now()<deadline){
     const now=await new Promise(r=>requestAnimationFrame(r)),dt=Math.min(.08,Math.max(0,(now-last)/1000));last=now;speech.update(dt);f.render('portrait',now);
     const pose=f.avatar.rig.speechPose;
     if(pose){if(started===null)started=now;for(const [name,v]of Object.entries(pose))peaks[name]=Math.max(peaks[name]??0,v);samples.push({time:(now-started)/1000,pose});}
     if(started!==null&&slot<4&&(now-started)/1000>=[.3,.8,1.3,2.2][slot]){ctx.drawImage(f.renderer.domElement,slot*280,0);ctx.fillText(`${((now-started)/1000).toFixed(2)} s`,slot*280+140,360);slot++;}
     if(done&&!pose)break;
    }
    if(!done){speech.cancel();throw new Error(`Speech did not finish: ${status}`);}await pending;
    const restored=before.every(([mesh,geometry])=>mesh.geometry===geometry),oral=[];f.avatar.rig.model.traverse(m=>{if(['teeth','tongue01'].includes(m.material?.name))oral.push(m);});
    document.body.replaceChildren(canvas);return {success,status,peaks,frames:samples.length,restored,remainingOral:oral.length,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
   },id);
   check(result.success&&result.frames>30,`${profile}: timed WAV plays and animates the face${result.success&&result.frames>30?'':` (${JSON.stringify(result)})`}`);
   check(result.peaks.viseme_aa>.3&&result.peaks.viseme_PP>.3&&result.peaks.viseme_FF>.3,`${profile}: vowels, lip closures and labiodentals have distinct shapes`);
   check(result.restored&&result.remainingOral===0,`${profile}: completion restores original geometry and removes oral draw calls`);
   await page.screenshot({path:`output/playwright/speech-playback-${profile}.png`});runs.push({profile,...result});
  }
  check(!errors.length,'No playback application or shader errors');return {checks,runs,errors,scope:'Actual HTMLAudio playback of a locally synthesized WAV with its real phoneme timings; all seven rigs and reduced motion. Fixed recorded line isolates graphics from synthesis latency.'};
 }finally{await page.unrouteAll({behavior:'wait'});await page.goto('about:blank');}
}
