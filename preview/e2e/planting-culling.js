async page=>{
 await page.goto('http://127.0.0.1:5181/e2e/fixtures/carriage.html');
 await page.waitForFunction(()=>window.carriageFixture,null,{timeout:90000});
 await page.evaluate(async()=>{
  const {buildPlanterPlanting}=await import('/src/landscape-models.js');
  window.plantingReview=buildPlanterPlanting([[0,0,0,0],[2,0,-2,.4],[120,0,0,0]]);
 });
 await page.waitForFunction(()=>window.plantingReview?.children.length>14,null,{timeout:30000});
 const result=await page.evaluate(async()=>{
  const source=await (await fetch('/src/landscape-models.js')).text();
  const T=await import(source.match(/from\s+["']([^"']+three\.js[^"']*)["']/)[1]);
  const f=window.carriageFixture,plants=window.plantingReview;
  f.carriage.object.visible=false;f.avatar.object.visible=false;f.scene.add(plants);
  const reference=new T.Group(),groups=new Map(),matrix=new T.Matrix4(),color=new T.Color();
  for(const mesh of plants.children){const key=mesh.geometry.uuid+mesh.material.uuid;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(mesh);}
  for(const meshes of groups.values()){
   const first=meshes[0],merged=new T.InstancedMesh(first.geometry,first.material,meshes.reduce((n,m)=>n+m.count,0));let slot=0;
   merged.castShadow=first.castShadow;merged.receiveShadow=first.receiveShadow;
   for(const mesh of meshes)for(let i=0;i<mesh.count;i++){
    mesh.getMatrixAt(i,matrix);merged.setMatrixAt(slot,matrix);
    if(mesh.instanceColor){mesh.getColorAt(i,color);merged.setColorAt(slot,color);}slot++;
   }
   merged.computeBoundingSphere();reference.add(merged);
  }
  f.scene.add(reference);f.renderer.setSize(1000,800);f.camera.aspect=1.25;f.camera.updateProjectionMatrix();
  f.camera.position.set(4,3,5);f.camera.lookAt(0,1,-1);
  const gl=f.renderer.getContext(),capture=optimized=>{
   plants.visible=optimized;reference.visible=!optimized;f.renderer.render(f.scene,f.camera);
   const pixels=new Uint8Array(1000*800*4);gl.readPixels(0,0,1000,800,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
   return {pixels,triangles:f.renderer.info.render.triangles,calls:f.renderer.info.render.calls};
  };
  const before=capture(false),after=capture(true);let changed=0,totalError=0,maxError=0;
  for(let i=0;i<before.pixels.length;i++){const error=Math.abs(before.pixels[i]-after.pixels[i]);if(error)changed++;totalError+=error;maxError=Math.max(maxError,error);}
  const meanError=totalError/before.pixels.length;
  if(meanError>.01)throw new Error(`Planting image changed: ${meanError}, max ${maxError}`);
  if(after.triangles>=before.triangles)throw new Error('Offscreen planting was not culled');
  return {before:{calls:before.calls,triangles:before.triangles},after:{calls:after.calls,triangles:after.triangles},changedChannels:changed,meanError,maxError,instances:plants.children.reduce((n,m)=>n+m.count,0)};
 });
 await page.screenshot({path:'output/playwright/planting-culling.png'});return result;
}
