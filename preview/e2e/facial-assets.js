async page=>{
 // Start Playwright CLI from the repository root; fixture paths are cwd-relative.
 const checks=[],results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 const profiles=['woman-casual','man-casual','woman-tailored','man-tailored','woman-daywear','man-workwear','jevica'];
 const root='.';
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1260,height:640});
 const load=async index=>{
  await page.goto(`http://127.0.0.1:5181/e2e/fixtures/jevica.html${index===6?'':`?resident=facial-check-${index}&rig=${index}`}`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
 };
 for(const [index,profile] of profiles.entries()){
  const pattern=`**/assets/characters/${profile}.glb`;
  await page.route(pattern,route=>route.fulfill({path:`${root}/data/raw/characters/face-original/${profile}.glb`,contentType:'model/gltf-binary'}));
  await load(index);
  const baseline=await page.evaluate(()=>{
   const f=window.jevicaFixture;f.renderer.setSize(420,600);f.camera.aspect=.7;f.camera.updateProjectionMatrix();f.render('portrait',0);
   const gl=f.renderer.getContext(),pixels=new Uint8Array(420*600*4);gl.readPixels(0,0,420,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   let binary='';for(let i=0;i<pixels.length;i+=4096)binary+=String.fromCharCode(...pixels.subarray(i,i+4096));return btoa(binary);
  });
  await page.unroute(pattern);
  await page.route(pattern,route=>route.fulfill({path:`${root}/data/raw/characters/face-merged/${profile}.glb`,contentType:'model/gltf-binary'}));
  try{
   await load(index);
   const result=await page.evaluate(async baseline=>{
    const f=window.jevicaFixture,source=await(await fetch('/src/avatars.js')).text();
    const url=source.match(/from\s+["']([^"']*deps\/three\.js[^"']*)["']/)[1],T=await import(url);
    f.renderer.setSize(420,600);f.camera.aspect=.7;f.camera.updateProjectionMatrix();f.render('portrait',0);
    const gl=f.renderer.getContext(),pixels=new Uint8Array(420*600*4);gl.readPixels(0,0,420,600,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    const original=atob(baseline);let changed=0,maxDifference=0;
    for(let i=0;i<pixels.length;i+=4){let differs=false;for(let c=0;c<3;c++){const d=Math.abs(pixels[i+c]-original.charCodeAt(i+c));if(d)differs=true;maxDifference=Math.max(maxDifference,d);}if(differs)changed++;}
    const skin=[],eyes=[],morphs=[];f.avatar.object.traverse(m=>{if(m.isMesh){if(/^(young|middleage|old)_/.test(m.material?.name))skin.push(m);if(/^brown(?:\.\d+)?$/.test(m.material?.name))eyes.push(m);if(m.morphTargetDictionary?.eyeBlinkLeft!==undefined)morphs.push(m);}});
    if(!eyes.length)throw new Error('The eye geometry was not identified');
    const centers=[new T.Box3(),new T.Box3()],point=new T.Vector3();
    for(const mesh of eyes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);centers[mesh.geometry.attributes.position.getX(i)<0?0:1].expandByPoint(point);}
    const probe=()=>centers.map(box=>{const origin=box.getCenter(new T.Vector3());origin.z+=.2;const hits=new T.Raycaster(origin,new T.Vector3(0,0,-1),0,.4).intersectObjects([...skin,...eyes],false);return hits[0]?.object.material.name??null;});
    const canvas=document.createElement('canvas');canvas.width=1260;canvas.height=640;canvas.id='facial-strip';const ctx=canvas.getContext('2d');ctx.fillStyle='#eeeae5';ctx.fillRect(0,0,1260,640);ctx.font='18px sans-serif';ctx.textAlign='center';
    const states=[];
    for(const [column,weight] of [0,.5,1].entries()){
     for(const m of morphs)for(const key of ['eyeBlinkLeft','eyeBlinkRight'])m.morphTargetInfluences[m.morphTargetDictionary[key]]=weight;
     f.render('portrait',0);ctx.drawImage(f.renderer.domElement,column*420,0);ctx.fillStyle='#302c28';ctx.fillText(['Open','Closing','Closed'][column],column*420+210,625);states.push({weight,hits:probe()});
    }
    f.renderer.domElement.style.display='none';document.body.append(canvas);
    return {changedPixels:changed,pixels:420*600,maxDifference,states,morphMeshes:morphs.map(m=>m.material.name)};
   },baseline);
   await page.locator('#facial-strip').screenshot({path:`output/playwright/facial-assets-${profile}.png`});results.push({profile,...result});
   check(result.changedPixels/result.pixels<.001,`${profile}: neutral render is at least 99.9% unchanged`);
   check(result.states[0].hits.every(name=>/^brown(?:\.\d+)?$/.test(name)),`${profile}: open eyelids expose both eyes`);
   check(result.states[2].hits.every(name=>/^(young|middleage|old)_/.test(name)),`${profile}: closed eyelids cover both eyes`);
   if(profile==='jevica')check(result.morphMeshes.includes('eyelashes01'),'Jevica eyelashes follow the eyelids');
  }finally{await page.unroute(pattern);}
 }
 check(!errors.length,'No uncaught facial asset errors');await page.goto('about:blank');return {checks,results,errors,scope:'Preserved neutral-original and candidate overrides. Neutral pixel comparison and geometry ray probes through both eye centers.'};
}
