async page=>{
  const errors=[],views=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:900,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  for(const [name,query]of [['woman-casual','?resident=local-00&rig=0'],['man-workwear','?resident=local-05&rig=5'],['jevica','']]) {
    await page.goto(`http://127.0.0.1:5181/e2e/fixtures/jevica.html${query}`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
    let previous=-1;
    for(const frame of [80,100,120,300]) {
      await page.evaluate(({previous,frame})=>{
        const f=window.jevicaFixture;
        for(let i=previous+1;i<=frame;i++) {
          const speed=i<180?1.1:0,distance=Math.min(i,180)*1.1/60;
          f.render('full',i*1000/60,speed,{position:[0,0,distance],distance});
        }
      },{previous,frame});
      const path=`output/playwright/natural-motion-${name}-${frame}.png`;
      await page.screenshot({path});views.push(path);previous=frame;
    }
  }
  if(errors.length)throw new Error(errors.join('; '));
  return {views,errors,scope:'Rendered pose sequence with production costumes, walking translation, and a settled stop; visual review required.'};
}
