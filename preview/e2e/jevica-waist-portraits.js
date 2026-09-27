async page=>{
 const images=[];
 await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:900,height:1000});
 for(const stage of ['rest','walk','force']) {
  await page.goto('http://127.0.0.1:5181/e2e/fixtures/jevica.html');await page.waitForFunction(()=>document.body.dataset.ready==='true');
  await page.evaluate(stage=>{const f=window.jevicaFixture;for(let frame=0;frame<=100;frame++){const speed=stage==='rest'?0:1.65,distance=frame/60*speed;f.render('full',frame*1000/60,speed,{distance,position:[0,0,distance],action:stage==='force'?'force':'continue'});}},stage);
  for(const view of ['front','back']) {
   await page.evaluate(view=>{const f=window.jevicaFixture,p=f.holder.position;f.camera.position.set(p.x,p.y+1.08,p.z+(view==='front'?1.25:-1.25));f.camera.lookAt(p.x,p.y+1.03,p.z);f.renderer.render(f.scene,f.camera);},view);
   const path=`output/playwright/jevica-waist-${stage}-${view}.png`;await page.screenshot({path});images.push(path);
  }
 }
 return {images};
}
