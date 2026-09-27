async page=>{
  const errors=[],checks=[],runs=[];page.on('pageerror',e=>errors.push(e.message));
  const check=(value,message)=>{if(!value)throw new Error(message);checks.push(message);};
  await page.setViewportSize({width:900,height:1000});await page.emulateMedia({reducedMotion:'no-preference'});
  for(const hz of [30,60,120]) {
    await page.goto('http://127.0.0.1:5181/e2e/fixtures/jevica.html');
    await page.waitForFunction(()=>document.body.dataset.ready==='true');
    const result=await page.evaluate(async hz=>{
      const code=await(await fetch('/src/avatars.js')).text(),T=await import(code.match(/from\s+["']([^"']*deps\/three\.js[^"']*)["']/)[1]);
      const {createBodiceProbe}=await import('/e2e/fixtures/bodice-clearance.js');
      const f=window.jevicaFixture,body=f.avatar.rig.model.getObjectByName('Jevica'),cloth=f.avatar.rig.model.getObjectByName('Jevica_fitted_bodice');
      // The body triangles exposed in the reference casting close-up, plus
      // their mirrored counterparts on the other shoulder. Sample skin itself
      // so a garment moving away from the defect cannot evade the check.
      const faces=[[21504,25090,47749],[21503,2753,21508],[47749,25090,2769],[47748,21508,2768],[47740,2755,21504]];
      const raw=body.geometry.attributes.position,mirror=new Map(),point=new T.Vector3(),target=new T.Vector3();
      for(const id of new Set(faces.flat())) {
        target.fromBufferAttribute(raw,id);target.x=-target.x;let best=Infinity,match=-1;
        for(let i=0;i<raw.count;i++){const distance=point.fromBufferAttribute(raw,i).distanceToSquared(target);if(distance<best){best=distance;match=i;}}
        if(best>1e-8)throw new Error('Missing mirrored shoulder surface');mirror.set(id,match);
      }
      const patches=[...faces,...faces.map(ids=>ids.map(id=>mirror.get(id)))],ray=new T.Raycaster(),measurements=[];
      let time=0,distance=0;
      for(const stage of ['rest','walk','force','release','bubble','land']) {
        for(let frame=0;frame<hz;frame++) {
          time+=1000/hz;const speed=['walk','force','land'].includes(stage)?1.65:0;distance+=speed/hz;
          f.render('full',time,speed,{distance,position:[0,stage==='bubble'?3.5:0,distance],action:stage==='force'?'force':'continue',flying:stage==='bubble'});
          if(frame!==Math.floor(hz/2)&&frame!==hz-1)continue;
          const origin=f.holder.position.clone().add(new T.Vector3(0,1.08,-1.25));
          body.boundingSphere=null;cloth.boundingSphere=null;
          const gaps=patches.map(ids=>{
            target.set(0,0,0);for(const id of ids)target.add(body.getVertexPosition(id,point).applyMatrix4(body.matrixWorld));target.multiplyScalar(1/3);
            ray.set(origin,target.sub(origin).normalize());
            const skin=ray.intersectObject(body,false)[0],fabric=ray.intersectObject(cloth,false)[0];
            return skin&&fabric?skin.distance-fabric.distance:null;
          });
          measurements.push({stage,frame,gaps});
        }
      }
      const diagnostic=createBodiceProbe(f.avatar)();
      return {hz,measurements,diagnostic};
    },hz);
    for(const pose of result.measurements)check(pose.gaps.every(gap=>gap!==null&&gap>.0005),`${hz} Hz ${pose.stage}/${pose.frame}: both visible shoulder patches stay covered`);
    runs.push(result);
  }
  check(!errors.length,'No uncaught browser errors');
  return {checks,runs,errors,scope:'Visible bilateral shoulder patch coverage; the broader posed underarm contact diagnostic is reported separately and remains open'};
}
