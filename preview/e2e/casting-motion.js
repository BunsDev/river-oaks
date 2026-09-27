async page=>{
  const checks=[],runs=[],errors=[];page.on('pageerror',error=>errors.push(error.message));
  const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
  await page.setViewportSize({width:1000,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  for(const [name,heading] of [['backpedal',Math.PI],['strafe-left',-Math.PI/2],['strafe-right',Math.PI/2]]) {
    await page.goto('http://127.0.0.1:5181/e2e/fixtures/jevica.html');
    await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
    const result=await page.evaluate(({name,heading})=>{
      const f=window.jevicaFixture;let error=0,slip=0,steps=0;const previous=new Map();
      for(let frame=0;frame<=180;frame++) {
        const distance=frame/60;
        f.render('full',frame*1000/60,1,{action:'force',heading,distance,position:[Math.sin(heading)*distance,0,Math.cos(heading)*distance]});
        for(const leg of f.avatar.feet) {
          error=Math.max(error,leg.error);const old=previous.get(leg.side);
          if(old?.contact&&leg.contact)slip=Math.max(slip,leg.target.distanceTo(old.target));
          if(!leg.contact)steps++;
          previous.set(leg.side,{contact:leg.contact,target:leg.target.clone()});
        }
      }
      return {name,error,slip,steps};
    },{name,heading});
    check(result.error<.005,`${name}: actual Jevica rig reaches its foot targets`);
    check(result.slip<.001,`${name}: support targets remain planted`);
    check(result.steps>90,`${name}: walking continues throughout the cast`);
    await page.screenshot({path:`output/playwright/casting-${name}.png`});runs.push(result);
  }
  check(!errors.length,'No uncaught casting fixture errors');return {checks,runs,errors};
}
