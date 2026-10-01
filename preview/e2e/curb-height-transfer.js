async page=>{
  const origin='http://127.0.0.1:5181',errors=[],runs=[],views=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1000,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  let reference=false;
  const route=async request=>{
    if(!reference)return request.continue();
    const response=await request.fetch(),source=await response.text();
    const expression='bodyRootHeight=reset?origin.y:origin.y+(bodyRootHeight-lastPosition.y-(abruptStep?heightStep:0))*Math.exp(-STEP_TRANSFER*delta);';
    if(!source.includes(expression))throw new Error('Missing body height response seam');
    await request.fulfill({response,body:source.replace(expression,'bodyRootHeight=origin.y;')});
  };
  await page.route('**/src/foot-placement.js*',route);
  try {
    for(const mode of ['reference','corrected'])for(const hz of mode==='reference'?[60]:[30,60,120]) {
      reference=mode==='reference';
      await page.goto(`${origin}/e2e/fixtures/motion.html?slope=0&hz=${hz}&hero=jevica`);
      await page.waitForFunction(()=>document.body.dataset.ready==='true');
      await page.evaluate(async()=>{
        const source=await(await fetch('/src/avatars.js')).text();
        const url=source.match(/from\s+["']([^"']*deps\/three\.js[^"']*)["']/)[1],THREE=await import(url);
        const f=window.motionFixture,old=f.scene.children.find(o=>o.isMesh&&o.geometry.type==='PlaneGeometry');f.scene.remove(old);
        const material=new THREE.MeshStandardMaterial({color:'#aaa99e',roughness:.95});
        const road=new THREE.Mesh(new THREE.BoxGeometry(24,.1,12),material);road.position.y=1.45;road.receiveShadow=true;f.scene.add(road);
        const curb=new THREE.Mesh(new THREE.BoxGeometry(24,.16,6),material);curb.position.y=1.58;curb.receiveShadow=true;f.scene.add(curb);
        f.renderer.setSize(1000,1000);f.camera.aspect=1;f.camera.updateProjectionMatrix();
        window.curbReview={THREE,curb,frame:0,distance:0,stats:null};
      });
      for(const edge of mode==='reference'?[.8]:[.7,.8,1.1,1.2]) {
        const capture=hz===60&&edge===.8;
        await page.evaluate(({edge})=>{
          const c=window.curbReview;c.frame=0;c.distance=0;c.curb.position.z=edge-3;
          c.stats=Object.fromEntries(window.motionFixture.avatars.map(a=>[a.profile,{previousHeight:null,previousGround:null,maxNavigationStepSpeed:0,maxWorldSpeed:0,maxFootError:0,transitions:0}]));
        },{edge});
        for(const until of capture?[43,45,47,49,3*hz-1]:[3*hz-1]) {
          const stats=await page.evaluate(({edge,hz,until})=>{
            const f=window.motionFixture,c=window.curbReview,{THREE}=c,ground=(_x,z)=>1.5+(z<edge?.16:0);
            for(;c.frame<=until;c.frame++) {
              c.distance+=1.05/hz;
              for(const [index,a]of f.avatars.entries()) {
                a.object.position.set((index-3)*1.6,ground(0,c.distance),c.distance);a.object.rotation.y=0;
                a.update((c.frame+1)*1000/hz,'continue',false,{speed:1.05,distance:c.distance},ground);
                a.rig.model.updateMatrixWorld(true);
                const height=a.feet[0].thigh.getWorldPosition(new THREE.Vector3()).y,r=c.stats[a.profile];
                if(r.previousHeight!==null) {
                  const speed=Math.abs(height-r.previousHeight)*hz;r.maxWorldSpeed=Math.max(r.maxWorldSpeed,speed);
                  if(r.previousGround!==a.object.position.y){r.transitions++;r.maxNavigationStepSpeed=Math.max(r.maxNavigationStepSpeed,speed);}
                }
                for(const leg of a.feet)r.maxFootError=Math.max(r.maxFootError,leg.foot.getWorldPosition(new THREE.Vector3()).distanceTo(leg.ikTarget));
                r.previousHeight=height;r.previousGround=a.object.position.y;
              }
            }
            const focus=f.avatars.find(a=>a.profile==='man-workwear'),p=focus.object.position;
            for(const a of f.avatars)a.object.visible=a===focus;
            f.camera.position.set(p.x+3.3,2.85,p.z+1.8);f.camera.lookAt(p.x,2.35,p.z);
            f.renderer.render(f.scene,f.camera);for(const a of f.avatars)a.object.visible=true;
            document.querySelector('#caption').textContent=`Curb crossing · ${hz} Hz · frame ${until}`;
            return c.stats;
          },{edge,hz,until});
          if(capture&&until<50){const path=`output/playwright/curb-height-${mode}-${until}.png`;await page.screenshot({path});views.push(path);}
          if(until===3*hz-1)runs.push({mode,hz,edge,profiles:stats});
        }
      }
    }
  } finally {await page.unroute('**/src/foot-placement.js*',route);}
  const corrected=runs.filter(r=>r.mode==='corrected').flatMap(r=>Object.values(r.profiles));
  const baseline=runs.find(r=>r.mode==='reference');
  // Sensitivity: without the transfer at least one rig must break the 2 m/s limit the
  // corrected runs are held to. (Since the pelvis release eases in world height, some
  // rigs absorb a curb even without the transfer, so 'every rig > 3 m/s' no longer holds.)
  if(errors.length||corrected.some(r=>r.transitions!==1||r.maxNavigationStepSpeed>=2||r.maxFootError>.003)||!(Math.max(...Object.values(baseline.profiles).map(r=>r.maxNavigationStepSpeed))>2))throw new Error(JSON.stringify({runs,errors}));
  return {runs,views,errors,scope:'Production avatar animations and exact rendered 16 cm box curb. The navigation-height handoff is gated; whole-stride peaks remain a separate diagnostic.'};
}
