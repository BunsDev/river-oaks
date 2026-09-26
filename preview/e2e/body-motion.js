async page=>{
  const current=await page.evaluate(()=>location.origin),origin=current.startsWith('http')?current:'http://127.0.0.1:5173';
  const errors=[],runs=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const terrain of ['plane','wave','ramp'])for(const hz of [30,60,120]) {
    await page.goto(`${origin}/e2e/fixtures/motion.html?slope=0&terrain=${terrain}&hz=${hz}&hero=jevica`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
    runs.push(await page.evaluate(async({terrain,hz})=>{
      const {inspectBodyPose}=await import('/e2e/fixtures/body-motion.js'),f=window.motionFixture;
      const profiles=Object.fromEntries(f.avatars.map(a=>[a.profile,{base:null,previous:null,previousWorld:null,minExtension:1,maxKnee:0,maxSwingKnee:0,maxDrop:0,maxSpeed:0,maxWorldSpeed:0,midStanceSamples:0,maxFootError:0}]));
      for(let frame=0;frame<=5*hz;frame++) {
        f.advance(frame);
        for(const a of f.avatars) {
          const r=profiles[a.profile],pose=inspectBodyPose(a);
          if(r.base===null)r.base=pose.height;
          r.maxDrop=Math.max(r.maxDrop,r.base-pose.height);
          if(r.previous!==null)r.maxSpeed=Math.max(r.maxSpeed,Math.abs(pose.height-r.previous)*hz);
          if(r.previousWorld!==null)r.maxWorldSpeed=Math.max(r.maxWorldSpeed,Math.abs(pose.worldHeight-r.previousWorld)*hz);
          r.previousWorld=pose.worldHeight;
          r.previous=pose.height;r.finalHeight=pose.height;
          for(const l of pose.legs) {
            if(!l.contact)r.maxSwingKnee=Math.max(r.maxSwingKnee,l.knee);
            const opposite=pose.legs.find(other=>other.side!==l.side);
            // Sample support while the other leg passes through mid-swing.
            // The subsequent landing transfer requires some support-knee bend.
            if(l.contact&&opposite.swingProgress>=.2&&opposite.swingProgress<=.65&&frame>=.75*hz&&frame<=3.5*hz&&l.horizontal<.12) {
              r.midStanceSamples++;r.minExtension=Math.min(r.minExtension,l.extension);r.maxKnee=Math.max(r.maxKnee,l.knee);
            }
          }
          for(const leg of a.feet)r.maxFootError=Math.max(r.maxFootError,leg.error);
        }
      }
      return {terrain,hz,profiles};
    },{terrain,hz}));
  }
  const failures=[];
  for(const run of runs)for(const [profile,r]of Object.entries(run.profiles)) {
    if(run.terrain==='plane'&&(r.minExtension<.94||r.maxDrop>.08||r.midStanceSamples<run.hz*.5||Math.abs(r.base-r.finalHeight)>.01))failures.push({terrain:run.terrain,hz:run.hz,profile,reason:'Sustained crouch or failure to settle',...r});
    if(r.maxSpeed>1||r.maxWorldSpeed>1||r.maxFootError>.005||r.maxSwingKnee<.5)failures.push({terrain:run.terrain,hz:run.hz,profile,reason:'Body discontinuity, unreachable foot or missing swing flex',...r});
  }
  if(failures.length||errors.length)throw new Error(JSON.stringify({failures,runs,errors}));
  return {runs,errors};
}
