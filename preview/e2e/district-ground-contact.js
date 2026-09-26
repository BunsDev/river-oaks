async page=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:1440,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 await page.goto('http://127.0.0.1:5181/?motion-debug=1');
 await page.waitForFunction(()=>document.querySelector('#canvas-host')?.dataset.charactersReady==='24');
 const result=await page.evaluate(()=>new Promise((resolve,reject)=>{
  let frames=0,maxError=0,maxContactDistance=0,samples=0,contacts=0,worst=null;const ids=new Set();
  const timeout=setTimeout(()=>reject(new Error(`Ground-contact sampling stalled after ${frames} frames`)),30000);
  const sample=()=>{
   try {
   for(const person of window.__riverMotion())for(const foot of person.feet){
    ids.add(person.id);samples++;maxError=Math.max(maxError,Math.hypot(...foot.actual.map((v,i)=>v-foot.target[i])));
    // Compare 3D distance to the valid surface contact point. A tiny skinning
    // offset across a vertical curb edge can change a downward height query by
    // the entire curb height while the shoe remains within a fraction of a mm.
    if(foot.contact&&foot.support&&foot.surface){contacts++;const gap=Math.hypot(...foot.support.map((v,i)=>v-foot.surface[i]));if(gap>maxContactDistance){maxContactDistance=gap;worst={id:person.id,status:person.status,foot};}}
   }
   if(++frames<180)requestAnimationFrame(sample);else {clearTimeout(timeout);resolve({frames,maxError,maxContactDistance,samples,contacts,worst,ids:[...ids]});}
   } catch(error) {clearTimeout(timeout);reject(error);}
  };requestAnimationFrame(sample);
 }));
 if(result.maxError>.005||result.maxContactDistance>.003||result.contacts<1000||result.ids.length<6||errors.length)throw new Error(JSON.stringify({result,errors}));
 return {...result,errors,scope:'Live grounded outdoor residents at the district spawn; actual skinned sole support vertices versus registered rendered surfaces. No route or pose injection.'};
}
