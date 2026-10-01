async page=>{
 const runs=[];await page.setViewportSize({width:900,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
 for(const reference of [true,false]) {
  if(reference)await page.route('**/src/bodice-fitting.js*',route=>route.fulfill({contentType:'application/javascript',body:'export function fitJevicaBodice() {}'}));
  await page.goto('http://127.0.0.1:5181/e2e/fixtures/jevica.html');await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const samples=await page.evaluate(async()=>{
   const code=await(await fetch('/src/avatars.js')).text(),T=await import(code.match(/from\s+["']([^"']*deps\/three\.js[^"']*)["']/)[1]);
   const f=window.jevicaFixture;for(let frame=0;frame<=100;frame++){const distance=frame/60*1.65;f.render('full',frame*1000/60,1.65,{distance,position:[0,0,distance],action:'force'});}
   const p=f.holder.position;f.camera.position.set(p.x,1.08,p.z-1.25);f.camera.lookAt(p.x,1.03,p.z);f.renderer.render(f.scene,f.camera);
   const body=f.avatar.rig.model.getObjectByName('Jevica'),cloth=f.avatar.rig.model.getObjectByName('Jevica_fitted_bodice'),ray=new T.Raycaster();body.boundingSphere=null;cloth.boundingSphere=null;
   return [[622,280],[626,280],[623,288],[628,290],[621,276]].map(([x,y])=>{ray.setFromCamera(new T.Vector2((x+.5)/900*2-1,1-(y+.5)/1000*2),f.camera);return {pixel:[x,y],hits:ray.intersectObjects([body,cloth]).slice(0,2).map(h=>({name:h.object.name,distance:h.distance,face:[h.face.a,h.face.b,h.face.c]}))};});
  });
  await page.screenshot({path:`output/playwright/bodice-visible-${reference?'reference':'fitted'}.png`});runs.push({reference,samples});
  if(reference)await page.unroute('**/src/bodice-fitting.js*');
 }
 // Clearance of the bodice over the skin along each ray (negative: skin shows through).
 const clearance=sample=>{const cloth=sample.hits.find(h=>h.name==='Jevica_fitted_bodice'),body=sample.hits.find(h=>h.name==='Jevica');return cloth&&body?body.distance-cloth.distance:Infinity;};
 // Without fitting the skin shows through or sits within 6 mm, where the two
 // surfaces flicker; fitted, the bodice is in front everywhere with 8 mm to spare.
 const unfitted=runs[0].samples.filter(s=>clearance(s)<.006).length;
 if(unfitted<3||runs[1].samples.some(s=>s.hits[0]?.name!=='Jevica_fitted_bodice'||clearance(s)<.008))throw new Error(JSON.stringify(runs));
 return {unfittedNearSkin:unfitted,minFittedClearance:Math.min(...runs[1].samples.map(clearance)),runs};
}
