async page=>{
 const runs=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.emulateMedia({reducedMotion:'no-preference'});
 for(const terrain of ['plane','wave'])for(const hz of [30,60,120]) {
 await page.goto(`http://127.0.0.1:5181/e2e/fixtures/motion.html?slope=0&terrain=${terrain}&hz=${hz}&hero=jevica`);
 await page.waitForFunction(()=>document.body.dataset.ready==='true');
 const result=await page.evaluate(async({hz})=>{
  const f=window.motionFixture,{createShoeProbe}=await import('/e2e/fixtures/shoe-clearance.js');
  const probes=f.avatars.map(a=>createShoeProbe(a,{contactPatch:true}));
  const results=f.avatars.map(a=>({profile:a.profile,penetration:0,float:0,slide:0,ankleError:0,minSeparation:Infinity,crossed:0,swingFrames:0,unsupported:0,baselineX:null,maxChestShift:0,supportShift:0,supportSamples:0,feet:{l:{maxLag:0,steps:0},r:{maxLag:0,steps:0}}}));
  const previous=new Map(),neutral=new Map();
  for(let frame=1;frame<=5*hz;frame++){
   const time=frame/hz,heading=time<.5?0:time<1.5?(time-.5)*Math.PI:time<2?Math.PI:time<3?Math.PI-(time-2)*Math.PI:0;
   for(const [index,a] of f.avatars.entries()){
    a.object.rotation.y=heading;a.update(frame*1000/hz,'continue',false,{speed:0,distance:0,heading},f.ground);a.rig.model.updateMatrixWorld(true);
    const stats=results[index],shoes=probes[index](f.ground),positions=[];
    if(a.feet.every(l=>!l.contact))stats.unsupported++;
    const hips=a.feet.map(l=>a.object.worldToLocal(l.thigh.getWorldPosition(a.object.position.clone())));
    const hipX=(hips[0].x+hips[1].x)*.5,chest=a.object.worldToLocal(a.rig.model.getObjectByName('spine_03').getWorldPosition(a.object.position.clone()));
    stats.baselineX??=chest.x-hipX;
    const chestShift=chest.x-hipX-stats.baselineX;
    stats.maxChestShift=Math.max(stats.maxChestShift,Math.abs(chestShift));
    const stepping=a.feet.find(l=>l.swing?.turning),support=a.feet.find(l=>l.contact);
    if(stepping&&support&&stepping.swing.progress>.35&&stepping.swing.progress<.75) {
      const foot=a.object.worldToLocal(support.foot.getWorldPosition(a.object.position.clone()));
      stats.supportShift+=chestShift*Math.sign(foot.x-hipX);stats.supportSamples++;
    }
    for(const leg of a.feet){
     const foot=leg.foot.getWorldPosition(a.object.position.clone()),key=index+leg.side,before=previous.get(key),shoe=shoes.find(s=>s.side===leg.side);positions.push(foot);
     stats.penetration=Math.max(stats.penetration,-shoe.minHeight);stats.ankleError=Math.max(stats.ankleError,leg.error);
     if(leg.contact){stats.float=Math.max(stats.float,shoe.minHeight);if(before?.contact)for(const point of shoe.patch){const old=before.patch.find(p=>p.id===point.id);if(old)stats.slide=Math.max(stats.slide,Math.hypot(point.position[0]-old.position[0],point.position[2]-old.position[2]));}}
     else stats.swingFrames++;
     const local=a.object.worldToLocal(foot.clone());if(local.x*Math.sign(leg.rest.x)<-.025)stats.crossed++;
     if(!neutral.has(key))neutral.set(key,leg.orientation.clone());
     stats.feet[leg.side].maxLag=Math.max(stats.feet[leg.side].maxLag,leg.orientation.angleTo(a.object.quaternion.clone().multiply(neutral.get(key))));
     if(before?.contact&&!leg.contact)stats.feet[leg.side].steps++;
     previous.set(key,{contact:leg.contact,patch:shoe.patch});
    }
    stats.minSeparation=Math.min(stats.minSeparation,positions[0].distanceTo(positions[1]));
   }
   if(frame===Math.round(hz*85/60)){f.camera.position.set(3,2.1,4);f.camera.lookAt(0,1,0);f.renderer.render(f.scene,f.camera);window.turnProbeScreenshot=f.renderer.domElement.toDataURL();}
  }
  return results;
 },{hz});
 for(const sample of result) {
  if(sample.supportSamples<15||sample.supportShift/sample.supportSamples<.003||sample.maxChestShift>.035)throw new Error(JSON.stringify({hz,terrain,sample}));
  if(sample.penetration>.003 || sample.float>.003 || sample.slide>.003 || sample.ankleError>.005 || sample.unsupported || sample.crossed || sample.minSeparation<.1 || Object.values(sample.feet).some(f=>f.maxLag>1.1||f.steps<2))throw new Error(JSON.stringify({hz,terrain,sample}));
 }
 runs.push({hz,terrain,samples:result});
 if(hz===60&&terrain==='plane') {
 await page.evaluate(()=>{const img=document.createElement('img');img.src=window.turnProbeScreenshot;img.style='position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#e7e5df;z-index:999';document.body.append(img);});
 await page.screenshot({path:'output/playwright/standing-turn-balance.png'});
 }
 }
 if(errors.length)throw new Error(errors.join('; '));
 return {runs,errors,scope:'Seven production rigs including Jevica on rendered flat and uneven surfaces at 30/60/120 Hz; half-turns and reversals, actual skinned shoe contact patches and torso displacement toward the supporting leg.'};
}
