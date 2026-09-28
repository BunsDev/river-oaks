async page=>{
 const checks=[],errors=[];const check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&/Shader Error|WebGLProgram/.test(m.text()))errors.push(m.text());});
 await page.setViewportSize({width:1440,height:1000});
 // The unicorn artwork remains in its studio fixture. The live district now
 // uses the Rolls and motorcycle, exercised by carriage.js and the native suite.
 await page.goto('http://127.0.0.1:5181/e2e/fixtures/carriage.html');await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const before=await page.evaluate(()=>{const f=window.carriageFixture;f.render('team');return f.unicorns.inspect();});
 check(before.length===2&&before.every(h=>h.horn&&h.triangles>0),'The studio renders both detailed unicorns');
 check(before.every(h=>Math.abs(h.position[1])<.001),'Both unicorns stand on the studio ground');
 await page.screenshot({path:'output/playwright/unicorn-team.png'});
 const moving=await page.evaluate(()=>{
  const f=window.carriageFixture,dt=1/60;
  for(let frame=1;frame<=120;frame++){f.carriage.object.position.x-=3*dt;f.unicorns.update(frame*dt,dt,3,frame*3*dt);}
  return {horses:f.unicorns.inspect(),render:f.render('team')};
 });
 check(moving.horses.every(h=>h.walkWeight>.9),'Both unicorns blend into their contact-driven gait');
 check(moving.horses.every((h,i)=>Math.hypot(h.position[0]-before[i].position[0],h.position[2]-before[i].position[2])>5),'The team follows the moving coach');
 check(moving.horses.every(h=>Math.abs(h.position[1])<.001),'Moving unicorns retain ground contact');
 check(moving.render.calls>0&&moving.render.triangles>0,'The animated studio scene renders geometry');
 const stopped=await page.evaluate(()=>{
  const f=window.carriageFixture,dt=1/60;
  for(let frame=1;frame<=180;frame++)f.unicorns.update(2+frame*dt,dt,0,6);
  f.render('team');return f.unicorns.inspect();
 });
 check(stopped.every(h=>h.walkWeight<.01),'Gait blends back to idle after stopping');
 check(!errors.length,'No uncaught runtime or shader errors');
 return {checks,before,moving,stopped,errors};
}
