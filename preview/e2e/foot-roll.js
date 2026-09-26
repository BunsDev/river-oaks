async page=>{
  const current=await page.evaluate(()=>location.origin),origin=current.startsWith('http')?current:'http://127.0.0.1:5173';
  const errors=[],runs=[];page.on('pageerror',e=>errors.push(e.message));
  await page.emulateMedia({reducedMotion:'no-preference'});
  for(const terrain of ['plane','wave','ramp'])for(const hz of [30,60,120]) {
    await page.goto(`${origin}/e2e/fixtures/motion.html?slope=0&terrain=${terrain}&hz=${hz}`);
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    runs.push(await page.evaluate(async({hz,terrain})=>{
      const {createShoeProbe}=await import('/e2e/fixtures/shoe-clearance.js');
      const f=window.motionFixture,probes=f.avatars.map(avatar=>createShoeProbe(avatar,{contactPatch:true})),previous=new Map();
      let penetration=0,float=0,slide=0,pivotError=0,ankleError=0,rollJump=0,contactSamples=0,pivotGap=0,patchSlide=0,patchSamples=0;
      const phases=Object.fromEntries(f.avatars.map(a=>[a.profile,{heel:0,push:0,toe:0}]));
      for(let frame=0;frame<=5*hz;frame++) {
        const {samples}=f.advance(frame);
        for(const [index,avatar]of f.avatars.entries()) {
          const sample=samples.find(s=>s.profile===avatar.profile&&s.frame===frame);
          if(!sample)continue;
          const shoes=probes[index](f.ground);
          for(const foot of sample.feet) {
            const shoe=shoes.find(s=>s.side===foot.side),key=`${sample.profile}-${foot.side}`,before=previous.get(key);
            penetration=Math.max(penetration,-shoe.minHeight);ankleError=Math.max(ankleError,foot.error);
            pivotError=Math.max(pivotError,Math.hypot(...foot.support.map((v,i)=>v-foot.supportActual[i])));
            if(before)rollJump=Math.max(rollJump,Math.abs(foot.roll-before.roll));
            if(foot.contact) {
              pivotGap=Math.max(pivotGap,Math.abs(foot.supportActual[1]-f.ground(foot.supportActual[0],foot.supportActual[2])));
              for(const point of shoe.patch)if(before?.contact) {
                const old=before.patch.find(p=>p.id===point.id);
                if(old){patchSlide=Math.max(patchSlide,Math.hypot(point.position[0]-old.position[0],point.position[2]-old.position[2]));patchSamples++;}
              }
              contactSamples++;float=Math.max(float,shoe.minHeight);
              phases[sample.profile].heel=Math.max(phases[sample.profile].heel,-foot.roll);
              phases[sample.profile].push=Math.max(phases[sample.profile].push,foot.roll);
              phases[sample.profile].toe=Math.max(phases[sample.profile].toe,foot.toeFlex);
              if(before?.contact&&before.pivot===foot.pivot)slide=Math.max(slide,Math.hypot(foot.supportActual[0]-before.supportActual[0],foot.supportActual[2]-before.supportActual[2]));
            }
            previous.set(key,{...foot,patch:shoe.patch});
          }
        }
      }
      return {hz,terrain,pivotGap,patchSlide,patchSamples,penetration,float,slide,pivotError,ankleError,rollJump,contactSamples,phases};
    },{hz,terrain}));
  }
  if(errors.length||runs.some(r=>r.pivotGap>.001||r.patchSlide>.003||r.penetration>.003||r.float>.003||r.slide>.003||r.pivotError>.001||r.ankleError>.005||r.rollJump>.18||Object.values(r.phases).some(p=>p.heel<.1||p.push<.15||p.toe<.15)))throw new Error(JSON.stringify({runs,errors}));
  return {runs,errors};
}
