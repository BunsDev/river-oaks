async page=>{
 // Start Playwright CLI from the repository root; fixture paths are cwd-relative.
 const checks=[],profiles=['woman-casual','man-casual','woman-tailored','man-tailored','woman-daywear','man-workwear','jevica'],runs=[],errors=[];
 const root='.';
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error'&&/Shader Error|VALIDATE_STATUS|WebGLProgram/.test(m.text()))errors.push(m.text());});
 const load=async index=>{await page.goto(`http://127.0.0.1:5181/e2e/fixtures/jevica.html${index===6?'':`?resident=speech-check-${index}&rig=${index}`}`);await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});};
 const pixels=()=>{const f=window.jevicaFixture;f.renderer.setSize(420,600);f.camera.aspect=.7;f.camera.updateProjectionMatrix();f.render('portrait',0);const gl=f.renderer.getContext(),bytes=new Uint8Array(420*600*4);gl.readPixels(0,0,420,600,gl.RGBA,gl.UNSIGNED_BYTE,bytes);let result='';for(let i=0;i<bytes.length;i+=4096)result+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(result);};
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1000,height:1080});
 try{
  for(const [index,profile]of profiles.entries()){
   await load(index);const before=await page.evaluate(pixels);
   await page.route(`**/assets/characters/${profile}.glb`,route=>route.fulfill({contentType:'model/gltf-binary',path:`${root}/data/raw/characters/speech-merged/${profile}.glb`}));
   await load(index);const after=await page.evaluate(pixels);
   const neutral=await page.evaluate(({before,after})=>{const a=atob(before),b=atob(after);let changed=0,max=0;for(let i=0;i<a.length;i+=4){let diff=0;for(let j=0;j<3;j++)diff=Math.max(diff,Math.abs(a.charCodeAt(i+j)-b.charCodeAt(i+j)));if(diff>1)changed++;max=Math.max(max,diff);}return {pixels:252000,changed,max};},{before,after});
   check(neutral.changed/neutral.pixels<.001,`${profile}: added oral anatomy affects less than 0.1% of the neutral portrait`);
   await page.evaluate(()=>window.jevicaFixture.avatar.rig.model.traverse(m=>{if(['teeth','tongue01'].includes(m.material?.name))m.visible=false;}));
   const withoutMouths=await page.evaluate(pixels);check(withoutMouths===before,`${profile}: face and existing accessories remain pixel-identical`);
   await page.evaluate(()=>window.jevicaFixture.avatar.rig.model.traverse(m=>{if(['teeth','tongue01'].includes(m.material?.name))m.visible=true;}));
   const shapes=await page.evaluate(async()=>{
    const f=window.jevicaFixture,source=await(await fetch('/src/avatars.js')).text(),T=await import(source.match(/from\s+["']([^"']*deps\/three\.js[^"']*)["']/)[1]);
    f.renderer.setSize(250,250);f.camera.aspect=1;f.camera.updateProjectionMatrix();
    const center=f.avatar.rig.model.getObjectByName('head').getWorldPosition(new T.Vector3());
    f.camera.position.set(0,center.y+.015,.6);f.camera.lookAt(0,center.y+.01,0);
    const canvas=document.createElement('canvas');canvas.width=1000;canvas.height=1080;const ctx=canvas.getContext('2d');ctx.fillStyle='#eee9e3';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#292621';ctx.font='16px sans-serif';ctx.textAlign='center';
    const names=['neutral',...'sil PP FF TH DD kk CH SS nn RR aa E I O U'.split(' ').map(n=>'viseme_'+n)],results=[];
    for(const [i,name]of names.entries()){
     const bound=[];f.avatar.rig.model.traverse(m=>{if(m.morphTargetDictionary){m.morphTargetInfluences.fill(0);if(m.morphTargetDictionary[name]!==undefined){m.morphTargetInfluences[m.morphTargetDictionary[name]]=1;bound.push(m.material.name);}}});
     f.renderer.render(f.scene,f.camera);ctx.drawImage(f.renderer.domElement,i%4*250,Math.floor(i/4)*270);ctx.fillText(name,i%4*250+125,Math.floor(i/4)*270+264);results.push({name,bound});
    }
    document.body.replaceChildren(canvas);return results;
   });
   check(shapes.slice(1).every(s=>s.bound.length>0),`${profile}: all fifteen speech shapes bind`);
   await page.screenshot({path:`output/playwright/speech-shapes-${profile}.png`});runs.push({profile,neutral,shapes});
   await page.unroute(`**/assets/characters/${profile}.glb`);
  }
  check(!errors.length,'No speech shape application or shader errors');return {checks,runs,errors};
 }finally{await page.unrouteAll({behavior:'wait'});await page.goto('about:blank');}
}
