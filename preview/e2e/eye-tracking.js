async page=>{
 const checks=[],portraits=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 const profiles=['woman-casual','man-casual','woman-tailored','man-tailored','woman-daywear','man-workwear','jevica'];
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1260,height:640});
 const load=async index=>{await page.goto(`http://127.0.0.1:5181/e2e/fixtures/jevica.html${index===6?'':`?resident=eye-check-${index}&rig=${index}`}`);await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});};
 const pixels=()=>{const f=window.jevicaFixture;f.renderer.setSize(420,600);f.camera.aspect=.7;f.camera.updateProjectionMatrix();f.render('portrait',0);const gl=f.renderer.getContext(),bytes=new Uint8Array(420*600*4);gl.readPixels(0,0,420,600,gl.RGBA,gl.UNSIGNED_BYTE,bytes);let result='';for(let i=0;i<bytes.length;i+=4096)result+=String.fromCharCode(...bytes.subarray(i,i+4096));return btoa(result);};
 try{
  for(const [index,profile]of profiles.entries()){
   await page.route('**/src/eye-tracking.js*',route=>route.fulfill({contentType:'application/javascript',body:'export function createEyeTracking(){return {pose:[],update(){},dispose(){}}}'}));
   await load(index);const before=await page.evaluate(pixels);await page.unroute('**/src/eye-tracking.js*');await load(index);const after=await page.evaluate(pixels);
   const changed=await page.evaluate(({before,after})=>{const a=atob(before),b=atob(after);let changed=0,max=0;for(let i=0;i<a.length;i+=4){let diff=0;for(let j=0;j<3;j++)diff=Math.max(diff,Math.abs(a.charCodeAt(i+j)-b.charCodeAt(i+j)));if(diff>1)changed++;max=Math.max(max,diff);}return {pixels:252000,changed,max};},{before,after});
   check(changed.changed/changed.pixels<.001,`${profile}: independent eye pivots preserve the neutral portrait`);
   const result=await page.evaluate(async()=>{
    const f=window.jevicaFixture,source=await(await fetch('/src/avatars.js')).text(),T=await import(source.match(/from\s+["']([^"']*deps\/three\.js[^"']*)["']/)[1]);
    const bones=f.avatar.rig.eyes.pose.map(p=>f.avatar.rig.model.getObjectByName(p.name));
    const center=bones.reduce((v,b)=>v.add(b.getWorldPosition(new T.Vector3())),new T.Vector3()).multiplyScalar(.5);
    f.camera.position.set(center.x,center.y+.01,center.z+.65);f.camera.lookAt(center.x,center.y-.025,center.z);f.camera.updateProjectionMatrix();
    const canvas=document.createElement('canvas');canvas.width=1260;canvas.height=640;const ctx=canvas.getContext('2d');ctx.fillStyle='#eee9e3';ctx.fillRect(0,0,1260,640);ctx.fillStyle='#292621';ctx.font='20px sans-serif';ctx.textAlign='center';
    const samples=[];let slot=0;
    for(const [label,side,height]of [['Left',-.45,.08],['Forward',0,0],['Right',.45,-.08]]){
     const target=center.clone().add(new T.Vector3(side,height,2));
     for(let i=0;i<100;i++)f.avatar.rig.eyes.update(target.toArray(),1/60);
     f.renderer.render(f.scene,f.camera);ctx.drawImage(f.renderer.domElement,slot*420,0);ctx.fillText(label,slot*420+210,625);
     const errors=bones.map(b=>new T.Vector3(0,0,1).applyQuaternion(b.getWorldQuaternion(new T.Quaternion())).angleTo(target.clone().sub(b.getWorldPosition(new T.Vector3())).normalize()));
     if(errors.some(e=>e>.01))throw new Error(`Eyes miss portrait target: ${errors}`);samples.push({label,errors,pose:f.avatar.rig.eyes.pose});slot++;
    }
    document.body.replaceChildren(canvas);return samples;
   });
   check(result.every(s=>s.errors.every(e=>e<.01)),`${profile}: both eyes track lateral and vertical targets`);portraits.push({profile,neutral:changed,samples:result});
   await page.screenshot({path:`output/playwright/eye-tracking-${profile}.png`});
  }
  check(!errors.length,'No eye animation application errors');return {checks,portraits,errors};
 }finally{await page.unroute('**/src/eye-tracking.js*');await page.goto('about:blank');}
}
