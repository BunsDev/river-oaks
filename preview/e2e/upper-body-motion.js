async page=>{
  const current=await page.evaluate(()=>location.origin),origin=current.startsWith('http')?current:'http://127.0.0.1:5181';
  const runs=[],errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const terrain of ['plane','wave','ramp'])for(const hz of [30,60,120]) {
    await page.goto(`${origin}/e2e/fixtures/motion.html?slope=0&terrain=${terrain}&hz=${hz}&hero=jevica`);await page.waitForFunction(()=>document.body.dataset.ready==='true');
    runs.push(await page.evaluate(async({terrain,hz})=>{
      const {inspectUpperBody}=await import('/e2e/fixtures/upper-body.js'),f=window.motionFixture;
      const profiles=Object.fromEntries(f.avatars.map(a=>[a.profile,{samples:0,opposed:0,aligned:0,cross:0,arms:0,legs:0,maxArmRange:0,maxWristSpeed:0,maxFootError:0,elbowMin:1,elbowMax:-1,wristMin:1,wristMax:-1,finalFlex:0,previous:null}]));
      for(let frame=0;frame<=5*hz;frame++) {
        f.advance(frame);
        for(const a of f.avatars) {
          const r=profiles[a.profile],p=inspectUpperBody(a);
          if(r.previous)for(const side of ['l','r'])r.maxWristSpeed=Math.max(r.maxWristSpeed,Math.hypot(...p.arms[side].wrist.map((v,i)=>v-r.previous.arms[side].wrist[i]))*hz);
          r.previous=p;
          for(const leg of a.feet)r.maxFootError=Math.max(r.maxFootError,leg.error);
          if(frame===5*hz)r.finalFlex=Math.max(...Object.values(p.arms).flatMap(arm=>[Math.abs(arm.elbowFlex),Math.abs(arm.wristFlex)]));
          if(frame<.75*hz||frame>3.5*hz)continue;
          for(const arm of Object.values(p.arms)) {
            r.elbowMin=Math.min(r.elbowMin,arm.elbowFlex);r.elbowMax=Math.max(r.elbowMax,arm.elbowFlex);
            r.wristMin=Math.min(r.wristMin,arm.wristFlex);r.wristMax=Math.max(r.wristMax,arm.wristFlex);
          }
          r.samples++;r.cross+=p.armDifference*p.legDifference;r.arms+=p.armDifference**2;r.legs+=p.legDifference**2;r.maxArmRange=Math.max(r.maxArmRange,Math.abs(p.armDifference));
          if(Math.abs(p.legDifference)>.15&&Math.abs(p.armDifference)>.03){if(p.armDifference*p.legDifference<0)r.opposed++;else r.aligned++;}
        }
      }
      for(const r of Object.values(profiles)){r.correlation=r.cross/Math.sqrt(r.arms*r.legs);delete r.previous;}
      return {terrain,hz,profiles};
    },{terrain,hz}));
  }
  const failures=[];
  for(const run of runs)for(const [profile,r]of Object.entries(run.profiles)) {
    if(!Number.isFinite(r.correlation)||r.correlation>-.8||r.maxArmRange<.2||r.maxWristSpeed>3||r.opposed<r.aligned*4)failures.push({terrain:run.terrain,hz:run.hz,profile,...r});
    // Walking eases the rest pose's elbow bend by up to .15 rad so forearms hang
    // naturally (upper-body-gait.js). Every rig rests at 39-46 degrees of bend, so
    // .18 rad of extension still leaves the elbow well bent: no hyperextension.
    if(r.elbowMax-r.elbowMin<.04||r.elbowMin<-.35||r.elbowMax>.18||r.wristMax-r.wristMin<.008||r.finalFlex>.001||r.maxFootError>.005)failures.push({terrain:run.terrain,hz:run.hz,profile,reason:'Forearm articulation, stop or foot contact',...r});
  }
  if(failures.length||errors.length)throw new Error(JSON.stringify({failures,runs,errors}));
  return {runs,errors};
}
