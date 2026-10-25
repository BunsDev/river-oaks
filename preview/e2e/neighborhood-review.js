async page => {
  const {mkdir,writeFile,readFile}=await import('node:fs/promises');
  const {compareViews}=await import('../../scripts/compare_skill_views.mjs');
  const {buildNeighborhood}=await import('../../shared/neighborhood/preserve.js');
  const {createDistrict}=await import('../src/studio/templates.js');
  const {neighborhoodSource}=await import('../../scripts/neighborhood-source.mjs');
  const source=neighborhoodSource();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const directory=`output/playwright/neighborhood-review-${Date.now()}`;await mkdir(directory,{recursive:true});
  const variants=[{id:'manual-market-street',region:createDistrict('market-street')},{id:'manual-garden-neighborhood',region:createDistrict('garden-neighborhood')}];
  for(const name of ['garden-market','garden-court'])for(const seed of ['default','review-0','review-5']){
    const recipe=JSON.parse(await readFile(`config/neighborhoods/${name}.json`,'utf8'));if(seed!=='default')recipe.seed=seed;
    const artifact=buildNeighborhood(recipe);variants.push({id:`${name}-${seed}`,region:artifact.region,artifact});
  }
  const sparseRecipe=JSON.parse(await readFile('config/neighborhoods/garden-market.json','utf8'));
  sparseRecipe.constraints.frontage_m=48;
  delete sparseRecipe.spawn;
  const sparseBaseline=buildNeighborhood(sparseRecipe);
  variants.push({id:'garden-market-sparse-baseline',region:sparseBaseline.region,artifact:sparseBaseline});
  await page.setViewportSize({width:1280,height:800});
  await page.goto('http://127.0.0.1:5173/studio.html');
  await page.waitForSelector('body[data-studio-ready="true"]');
  // Controlled comparison rig uses the production Studio scene/materials. The
  // regular UI journey separately proves preview/apply and keyboard walking.
  await page.evaluate(async()=>{
    const {THREE,createStudioScene,disposeStudioScene}=await import('/e2e/fixtures/neighborhood-review.js');
    const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setPixelRatio(1);renderer.setSize(1280,800);
    renderer.setClearColor('#e8eeea');renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
    renderer.domElement.id='comparison-canvas';Object.assign(renderer.domElement.style,{position:'fixed',inset:'0',zIndex:'99999'});document.body.append(renderer.domElement);
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(45,1.6,.1,2000);
    scene.add(new THREE.HemisphereLight('#f9fff9','#8c9b8b',2.5));
    const sun=new THREE.DirectionalLight('#fff5df',3);sun.position.set(130,260,104);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);
    Object.assign(sun.shadow.camera,{left:-150,right:150,top:150,bottom:-150,near:1,far:800});sun.shadow.bias=-.0005;sun.shadow.normalBias=.04;scene.add(sun,sun.target);
    let content;
    window.neighborhoodReview={
      render(variant,station){
        if(content){scene.remove(content.group);disposeStudioScene(content.group);}
        content=createStudioScene(variant.region,'light',variant.artifact??null);scene.add(content.group);
        camera.position.fromArray(station==='overview'?[155,190,180]:[0,1.68,60]);camera.lookAt(station==='overview'?new THREE.Vector3(0,0,0):new THREE.Vector3(0,1.68,0));camera.updateMatrixWorld(true);
        renderer.render(scene,camera);
        return {position:camera.position.toArray(),rotation:camera.rotation.toArray().slice(0,3),projection:'perspective',fovAxis:'vertical',fov:camera.fov,aspect:camera.aspect,resolution:[renderer.domElement.width,renderer.domElement.height],counts:content.architecture?.counts??null};
      },
      dispose(){if(content)disposeStudioScene(content.group);sun.shadow.dispose();renderer.dispose();renderer.forceContextLoss();renderer.domElement.remove();},
    };
  });
  const captures=[];
  try{
    for(const variant of variants)for(const station of ['overview','south-approach']){
      const live=await page.evaluate(({variant,station})=>window.neighborhoodReview.render(variant,station),{variant,station});
      const capture=`${directory}/${variant.id}-${station}.png`;
      await page.locator('#comparison-canvas').screenshot({path:capture});
      const metadata={runtime:'browser-three-studio-comparison',scene:'neighborhood-comparison-rig',revision:variant.artifact?.sha256??`repository-starter:${variant.id}`,source_sha256:source.sha256,capture,station,units:'m',axes:'east-up-south',...live,
        exposure:'ACESFilmic exposure 1',time:'fixed Studio daylight',weather:'clear static',occupancy:'empty private scene',rotationConvention:'Three XYZ Euler radians',renderSettings:'DPR1 antialias PCF2048 hemisphere2.5 sun3 at130,260,104 light-theme; no environment map'};
      await writeFile(capture.replace('.png','.json'),JSON.stringify(metadata,null,2)+'\n');captures.push({id:variant.id,...metadata});
    }
  }finally{await page.evaluate(()=>window.neighborhoodReview.dispose());}
  const comparisons=[];
  for(const station of ['overview','south-approach']){
    const baseline=captures.find(c=>c.id==='manual-market-street'&&c.station===station);
    for(const variant of captures.filter(c=>c.station===station&&c!==baseline)){
      const result=compareViews(baseline,variant);if(result.status!=='matched')throw Error(JSON.stringify(result));
      comparisons.push({baseline:baseline.capture,variant:variant.capture,...result});
    }
  }
  if(errors.length)throw Error(errors.join('\n'));
  const finalSource=neighborhoodSource();if(JSON.stringify(source)!==JSON.stringify(finalSource))throw Error('Runtime/harness source changed during captures; retain them as non-final evidence.');
  const report={passed:true,directory,source,finalSource,captures,comparisons,errors,scope:'Matched-camera production Studio scenes in controlled rendering fixture. Requires visual inspection; metadata equality alone is not art approval. Manual references are original repository starter blockouts, without modular interiors.'};
  await writeFile(`${directory}/report.json`,JSON.stringify(report,null,2)+'\n');return report;
}
