// Render the actual craft with the production chase-camera and boom functions while
// crossing a real boutique footprint aloft. This is a camera fixture, not live-auth flight.
async page => {
  const origin=page.url().startsWith('http')?await page.evaluate(()=>location.origin):'http://127.0.0.1:5181';
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:960,height:720});
  await page.goto(`${origin}/e2e/fixtures/ribbonwing.html?w=960&h=720&ground=0`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const result=await page.evaluate(async()=>{
    const {thirdPersonPose,createCameraBoom}=await import('/src/third-person.js');
    const {createWalkingEnvironment}=await import('/src/walking.js');
    const world=await fetch('/data/district.json').then(response=>response.json());
    const environment=createWalkingEnvironment(world),fixture=window.ribbonwingFixture;
    fixture.pose({phase:'hover',altitude:10,occupied:true});
    const target=fixture.craft.object.localToWorld(new fixture.THREE.Vector3(-1,1.25,0)).toArray();target[1]-=.25;
    const samples=[],captures=[];
    for(const yaw of [0,Math.PI]){
      const boom=createCameraBoom();
      for(let frame=0;frame<=80;frame++){
        await new Promise(requestAnimationFrame);
        const position=[-2852+frame*.5,80,1358.439548752362];
        const pose=thirdPersonPose({position,yaw,pitch:0,cameraDistance:10.4},environment);
        const clear=Math.hypot(...pose.position.map((value,i)=>value-pose.target[i]));
        const distance=boom.update(clear,1/60);
        const camera=pose.position.map((value,i)=>target[i]+(value-pose.target[i])*(clear>0?distance/clear:0));
        fixture.craft.animate(1/60);
        const stats=fixture.render({position:camera,target,fov:55});
        samples.push({yaw,frame,room:environment.roomAt(position[0],position[2])?.storeId??null,clear,distance,showBody:pose.showBody,draws:stats.draws,triangles:stats.triangles});
        if([0,40,80].includes(frame))captures.push({name:`${yaw===0?'left':'right'}-${frame}.png`,png:fixture.renderer.domElement.toDataURL('image/png').split(',')[1]});
      }
    }
    return {samples,captures};
  });
  const {mkdir,writeFile}=await import('node:fs/promises');
  const capturePath=`output/playwright/ribbonwing-camera-${page.context().browser().browserType().name()}`;
  await mkdir(capturePath,{recursive:true});
  for(const capture of result.captures)await writeFile(`${capturePath}/${capture.name}`,Buffer.from(capture.png,'base64'));
  const checks=[],check=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
  check(result.samples.some(sample=>sample.room!==null)&&result.samples.some(sample=>sample.room===null),'The rendered route enters and leaves a real boutique footprint');
  check(result.samples.every(sample=>sample.clear>10.4&&sample.distance>10.4&&sample.showBody),'The chase camera stays outside the craft without hiding the rider throughout both crossings');
  const distances=result.samples.map(sample=>sample.distance);
  check(Math.max(...distances)-Math.min(...distances)<1e-8,'Room boundaries cause no boom contraction or recovery pop in clear sky');
  check(result.samples.every(sample=>sample.draws>0&&sample.triangles>0),'Every sampled crossing frame renders the actual Ribbonwing geometry');
  check(errors.length===0,'No page errors');
  return {checks,samples:result.samples,captures:result.captures.map(capture=>`${capturePath}/${capture.name}`),errors,scope:'Actual model plus production camera functions and district collision environment; no authenticated town flight, device or user visual acceptance.'};
}
