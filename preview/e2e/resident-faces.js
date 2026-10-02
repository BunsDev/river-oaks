async page=>{
 // Each resident's face (resident-face.js) is baked from the rig's face-shape
 // morphs at load. For every rig: the bake changes only the head, is visible,
 // is deterministic, keeps the blink morphs working, and leaves each eye's gaze
 // pivot on the baked eyeball. Start Playwright CLI from the repository root.
 const checks=[],results=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 const profiles=['woman-casual','man-casual','woman-tailored','man-tailored','woman-daywear','man-workwear'];
 const W=420,H=600;
 await page.emulateMedia({reducedMotion:'reduce'});await page.setViewportSize({width:1260,height:640});
 const load=async(index,face)=>{
  await page.goto(`http://127.0.0.1:5181/e2e/fixtures/jevica.html?resident=face-check-${index}&rig=${index}${face?'':'&face=none'}`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
 };
 // A portrait's pixels plus the screen row of the shoulders (the higher clavicle
 // joint), below which a face bake must change nothing: the throat under the jaw
 // may move with the chin, the chest and clothes never.
 const portrait=()=>page.evaluate(async([W,H])=>{
  const f=window.jevicaFixture,source=await(await fetch('/src/avatars.js')).text();
  const T=await import(source.match(/from\s+["']([^"']*deps\/three\.js[^"']*)["']/)[1]);
  f.renderer.setSize(W,H);f.camera.aspect=W/H;f.camera.updateProjectionMatrix();f.render('portrait',0);
  const gl=f.renderer.getContext(),pixels=new Uint8Array(W*H*4);gl.readPixels(0,0,W,H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
  let binary='';for(let i=0;i<pixels.length;i+=4096)binary+=String.fromCharCode(...pixels.subarray(i,i+4096));
  const rowOf=name=>{const p=f.avatar.rig.model.getObjectByName(name).getWorldPosition(new T.Vector3()).project(f.camera);return Math.round((p.y+1)/2*H);};
  // Each eye's gaze pivot against that eyeball's bounding centre. Eye tracking centres
  // an eye on its extreme vertices, so the gap is a fixed offset per rig; it must be
  // the same with and without the bake, which shows the pivot moved with the eye.
  const eyes=[];f.avatar.object.traverse(m=>{if(m.isMesh&&/^brown(?:\.\d+)?$/.test(m.material?.name))eyes.push(m);});
  const centres=[new T.Box3(),new T.Box3()],point=new T.Vector3();
  for(const mesh of eyes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);centres[mesh.geometry.attributes.position.getX(i)<0?0:1].expandByPoint(point);}
  const pivotGap=['gaze_eye_r','gaze_eye_l'].map((name,side)=>{const pivot=f.avatar.rig.model.getObjectByName(name)?.getWorldPosition(new T.Vector3());return pivot?pivot.distanceTo(centres[side].getCenter(new T.Vector3())):Infinity;});
  const eyeCentres=centres.map(box=>box.getCenter(new T.Vector3()).toArray());
  // readPixels rows run bottom-up: row 0 is the bottom of the image.
  return {pixels:btoa(binary),shoulderRow:Math.max(rowOf('clavicle_l'),rowOf('clavicle_r')),face:f.avatar.rig.model.userData.face??null,pivotGap,eyeCentres};
 },[W,H]);
 const compare=(a,b)=>{const A=atob(a),B=atob(b);let changed=0,above=0,below=0;const rows=new Set();
  for(let i=0;i<A.length;i+=4){let differs=false;for(let c=0;c<3;c++)if(A.charCodeAt(i+c)!==B.charCodeAt(i+c))differs=true;if(!differs)continue;changed++;rows.add(Math.floor(i/4/W));}
  return {changed,rows};};
 for(const [index,profile] of profiles.entries()){
  await load(index,false);const neutral=await portrait();
  await load(index,true);const baked=await portrait();
  const again=await portrait();
  const result=await page.evaluate(async()=>{
   const f=window.jevicaFixture,source=await(await fetch('/src/avatars.js')).text();
   const T=await import(source.match(/from\s+["']([^"']*deps\/three\.js[^"']*)["']/)[1]);
   const skin=[],eyes=[],morphs=[],faceMorphs=[];
   f.avatar.object.traverse(m=>{if(!m.isMesh)return;if(/^(young|middleage|old)_/.test(m.material?.name))skin.push(m);if(/^brown(?:\.\d+)?$/.test(m.material?.name))eyes.push(m);
    if(m.morphTargetDictionary?.eyeBlinkLeft!==undefined)morphs.push(m);for(const name of Object.keys(m.morphTargetDictionary??{}))if(/^(head|nose|mouth|chin|[lr]-cheek|[lr]-eye|eyebrows)-/.test(name))faceMorphs.push(name);});
   if(!eyes.length)throw new Error('The eye geometry was not identified');
   // Eye centres from the baked eyeballs, and the gaze pivots eye tracking placed.
   const centres=[new T.Box3(),new T.Box3()],point=new T.Vector3();
   for(const mesh of eyes)for(let i=0;i<mesh.geometry.attributes.position.count;i++){mesh.getVertexPosition(i,point).applyMatrix4(mesh.matrixWorld);centres[mesh.geometry.attributes.position.getX(i)<0?0:1].expandByPoint(point);}
   const probe=()=>centres.map(box=>{const origin=box.getCenter(new T.Vector3());origin.z+=.2;const hits=new T.Raycaster(origin,new T.Vector3(0,0,-1),0,.4).intersectObjects([...skin,...eyes],false);return hits[0]?.object.material.name??null;});
   const states=[];
   for(const weight of [0,1]){for(const m of morphs)for(const key of ['eyeBlinkLeft','eyeBlinkRight'])m.morphTargetInfluences[m.morphTargetDictionary[key]]=weight;f.render('portrait',0);states.push({weight,hits:probe()});}
   for(const m of morphs)for(const key of ['eyeBlinkLeft','eyeBlinkRight'])m.morphTargetInfluences[m.morphTargetDictionary[key]]=0;
   return {faceMorphs,blinkMeshes:morphs.map(m=>m.material.name),states};
  });
  const diff=compare(neutral.pixels,baked.pixels),repeat=compare(baked.pixels,again.pixels);
  const belowShoulders=[...diff.rows].filter(row=>row<baked.shoulderRow-4).length,lowestRow=Math.min(...diff.rows);
  // A strip for review: neutral, baked, and the changed pixels with the neck row marked.
  await page.evaluate(([W,H,neutral,baked,shoulderRow])=>{
   const canvas=document.createElement('canvas');canvas.width=W*3;canvas.height=H;canvas.id='faces-strip';const ctx=canvas.getContext('2d');
   const draw=(data,x)=>{const image=ctx.createImageData(W,H),bytes=atob(data);for(let row=0;row<H;row++)for(let col=0;col<W*4;col++)image.data[row*W*4+col]=bytes.charCodeAt((H-1-row)*W*4+col);ctx.putImageData(image,x,0);};
   draw(neutral,0);draw(baked,W);
   const image=ctx.createImageData(W,H),a=atob(neutral),b=atob(baked);
   for(let i=0;i<a.length;i+=4){const row=H-1-Math.floor(i/4/W),col=(i/4)%W,o=(row*W+col)*4;let differs=false;for(let c=0;c<3;c++)if(a.charCodeAt(i+c)!==b.charCodeAt(i+c))differs=true;image.data[o]=differs?200:240;image.data[o+1]=differs?40:236;image.data[o+2]=differs?40:228;image.data[o+3]=255;}
   ctx.putImageData(image,W*2,0);ctx.strokeStyle='#2060c0';ctx.beginPath();ctx.moveTo(W*2,H-shoulderRow);ctx.lineTo(W*3,H-shoulderRow);ctx.stroke();
   const old=document.getElementById('faces-strip');old?.remove();document.body.append(canvas);
  },[W,H,neutral.pixels,baked.pixels,baked.shoulderRow]);
  await page.locator('#faces-strip').screenshot({path:`output/playwright/resident-faces-${profile}.png`});
  const pivotDrift=baked.pivotGap.map((gap,side)=>Math.abs(gap-neutral.pivotGap[side])),eyeShift=baked.eyeCentres.map((c,side)=>Math.hypot(...c.map((v,k)=>v-neutral.eyeCentres[side][k])));
  results.push({profile,recipe:baked.face,changedPixels:diff.changed,rowsBelowShoulders:belowShoulders,shoulderRow:baked.shoulderRow,lowestChangedRow:lowestRow,repeatPixels:repeat.changed,pivotGap:baked.pivotGap,pivotDrift,eyeShift,...result});
  check(baked.face&&Object.keys(baked.face).length>=2&&neutral.face===null,`${profile}: the resident has a face recipe and face=none keeps the rig's face`);
  check(diff.changed/(W*H)>.003,`${profile}: the baked face is visible in the portrait (${(diff.changed/(W*H)*100).toFixed(2)}% of pixels)`);
  check(belowShoulders===0,`${profile}: nothing below the shoulders changes (lowest change ${lowestRow-baked.shoulderRow} rows above the clavicles)`);
  check(repeat.changed===0,`${profile}: the bake is deterministic, pixel for pixel`);
  check(result.faceMorphs.length===0,`${profile}: face morphs are stripped after baking`);
  check(result.blinkMeshes.length>0&&result.states[0].hits.every(name=>/^brown(?:\.\d+)?$/.test(name))&&result.states[1].hits.every(name=>/^(young|middleage|old)_/.test(name)),`${profile}: eyelids still open and close over the baked eyes`);
  check(pivotDrift.every(drift=>drift<.0003)&&baked.pivotGap.every(gap=>gap<.01),`${profile}: gaze pivots moved with the baked eyeballs (eyes shifted ${eyeShift.map(v=>(v*1000).toFixed(1)).join(' / ')} mm, pivot offset unchanged within ${(Math.max(...pivotDrift)*1000).toFixed(2)} mm)`);
 }
 check(!errors.length,'No uncaught resident face errors');await page.goto('about:blank');
 return {checks,results,errors,scope:'Per rig: neutral vs baked portrait pixels (head only, visible, deterministic), morph stripping, eyelid ray probes, gaze pivot vs baked eye centre.'};
}
