async page=>{
  const checks=[],samples=[],errors=[];const check=(ok,label)=>{if(!ok)throw new Error(label);checks.push(label);};
  page.on('pageerror',error=>errors.push(error.message));await page.emulateMedia({reducedMotion:'no-preference'});await page.setViewportSize({width:1260,height:680});
  for(const appearanceId of ['sable-human','woman-casual']){
    const poses=['idle','walk','run','sit','wave',...(appearanceId==='woman-casual'?['prowl','lope']:[])];
    for(const pose of poses){
      await page.goto(`http://127.0.0.1:5173/e2e/fixtures/jevica.html?appearance=${appearanceId}&remote=1&face=none`);
      await page.waitForFunction(()=>document.body.dataset.ready==='true');
      const result=await page.evaluate(async({appearanceId,pose})=>{
        const f=window.jevicaFixture,{THREE}=f,{customizedCharacterDefinition}=await import('/src/character-customization.js'),{createCharacterMaterials}=await import('/src/character-studio-materials.js'),{traversalForAppearance}=await import('/src/beast-traversal.js');
        const definition=customizedCharacterDefinition('fixture-owner',appearanceId,{palette:'rose',hair:'espresso'}),colors=createCharacterMaterials(f.avatar.object);colors.apply(definition);
        const beast=pose==='prowl'||pose==='lope',seat=pose==='sit',traversal=traversalForAppearance(appearanceId),speed=beast?(pose==='lope'?traversal.sprint:traversal.walk):pose==='walk'?1.4:pose==='run'?3.4:0;
        f.renderer.setSize(420,640);f.camera.aspect=420/640;f.camera.updateProjectionMatrix();
        const body=f.avatar.rig.model.getObjectByName('Jevica'),skirt=f.avatar.rig.model.getObjectByName('Sable ivory mini dress'),covered=[];
        f.scene.updateMatrixWorld(true);
        const {skirtContactFixture}=await import('/tests/helpers/skirt-contact.js');
        const contact=seat?skirtContactFixture(f.avatar.rig.model,body,skirt):null;
        const model=f.avatar.rig.model,pelvis=model.getObjectByName('pelvis'),restInverse=new THREE.Matrix4().compose(pelvis.getWorldPosition(new THREE.Vector3()),model.getWorldQuaternion(new THREE.Quaternion()),model.getWorldScale(new THREE.Vector3())).invert(),probe=new THREE.Vector3();
        for(let i=0;seat&&i<body.geometry.attributes.position.count;i++){
          body.getVertexPosition(i,probe).applyMatrix4(body.matrixWorld);const rest=probe.clone().applyMatrix4(restInverse);
          if(rest.y>-.21&&rest.y<.02&&Math.abs(rest.x)<.14&&rest.z>.03&&new THREE.Raycaster(probe.clone().add(new THREE.Vector3(0,0,1)),new THREE.Vector3(0,0,-1),0,1.002).intersectObject(skirt,false).length)covered.push(i);
        }
        f.avatar.object.position.y=seat?.55-f.avatar.rig.hipHeight+.025:0;
        for(let frame=0;frame<=144;frame++){
          const time=frame*1000/60;f.avatar.object.position.z=time/1000*speed;f.avatar.update(time,pose==='wave'?'wave':'continue',false,{speed,distance:time/1000*speed,beast,riding:seat,ridingKind:seat?'seat':undefined,seatToFloor:seat?.55:undefined,gestureTime:time/1000},()=>0);
        }
        // Move the rig while solving planted contacts, then recenter the frozen
        // pose for inspection. Distance alone does not exercise real foot travel.
        f.avatar.object.position.z=0;f.scene.updateMatrixWorld(true);
        const textures=new Set(),materials=new Set();let meshes=0,finite=true;const point=f.camera.position.clone(),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
        f.avatar.object.traverse(node=>{
          if(!node.isMesh)return;let visible=true;for(let parent=node;parent;parent=parent.parent)if(!parent.visible)visible=false;if(!visible)return;
          meshes++;finite&&=node.matrixWorld.elements.every(Number.isFinite);
          for(const material of Array.isArray(node.material)?node.material:[node.material]){materials.add(material);for(const value of Object.values(material))if(value?.isTexture)textures.add(value);}
          for(let i=0;i<node.geometry.attributes.position.count;i++){
            node.getVertexPosition(i,point).applyMatrix4(node.matrixWorld);finite&&=point.toArray().every(Number.isFinite);
            for(let k=0;k<3;k++){min[k]=Math.min(min[k],point.getComponent(k));max[k]=Math.max(max[k],point.getComponent(k));}
          }
        });
        const decoded=[...textures].map(texture=>({name:texture.name,width:texture.image?.width,height:texture.image?.height}));
        const canvas=document.createElement('canvas');canvas.width=1260;canvas.height=680;canvas.id='character-pose-strip';const ctx=canvas.getContext('2d');ctx.fillStyle='#eeeae5';ctx.fillRect(0,0,1260,680);ctx.font='18px sans-serif';ctx.textAlign='center';const render=[];
        for(const [i,[view,x,z]]of [['front',0,3.8],['side',3.8,0],['rear',0,-3.8]].entries()){
          f.camera.position.set(x,1.05,z);f.camera.lookAt(0,.85,0);f.renderer.render(f.scene,f.camera);ctx.drawImage(f.renderer.domElement,i*420,0);ctx.fillStyle='#302c28';ctx.fillText(`${appearanceId} · ${pose} · ${view}`,i*420+210,666);render.push({...f.renderer.info.render});
        }
        if(seat){f.camera.position.set(0,2,2);f.camera.lookAt(0,.65,0);f.renderer.render(f.scene,f.camera);const top=document.createElement('canvas');top.width=420;top.height=640;top.id='seat-overhead';top.getContext('2d').drawImage(f.renderer.domElement,0,0);document.body.append(top);}
        f.renderer.domElement.style.display='none';document.body.append(canvas);
        const gl=f.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
        let exposed=0,frontExposed=0;if(seat){skirt.computeBoundingSphere();for(const i of covered){body.getVertexPosition(i,probe).applyMatrix4(body.matrixWorld);const eye=new THREE.Vector3(0,1.05,3.8);if(!new THREE.Raycaster(eye,probe.clone().sub(eye).normalize(),0,eye.distanceTo(probe)+.002).intersectObject(skirt,false).length)frontExposed++;if(!new THREE.Raycaster(probe.clone().add(new THREE.Vector3(0,1,0)),new THREE.Vector3(0,-1,0),0,1.002).intersectObject(skirt,false).length)exposed++;}}
        const thighContact=contact?.sample()??null;contact?.dispose();
        return {thighContact,seatCoverage:seat?{exposedFromAbove:exposed,exposedFromFront:frontExposed,samples:covered.length}:null,appearanceId,pose,speed,beastWeight:f.avatar.beastMotion,meshes,materials:materials.size,decoded,finite,bounds:{min,max},render,userAgent:navigator.userAgent,renderer:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER)};
      },{appearanceId,pose});
      check(result.finite&&result.meshes>0,`${appearanceId}/${pose}: actual skinned mesh coordinates are finite`);
      check(result.decoded.length>0&&result.decoded.every(t=>t.width>0&&t.height>0),`${appearanceId}/${pose}: all visible material textures decoded`);
      if(pose==='sit'){check(result.seatCoverage.samples>100,`${appearanceId}/${pose}: nonempty actual-body coverage diagnostic`);check(result.thighContact.tested>200&&result.thighContact.penetrating===0,`${appearanceId}/${pose}: front garment clears sampled upper-thigh surface`);}
      if(['prowl','lope'].includes(pose))check(result.beastWeight>.95,`${appearanceId}/${pose}: beast locomotion is fully active`);
      await page.locator('#character-pose-strip').screenshot({path:`output/playwright/character-poses-${appearanceId}-${pose}.png`});samples.push(result);if(pose==='sit')await page.locator('#seat-overhead').screenshot({path:`output/playwright/character-poses-${appearanceId}-sit-above.png`});
    }
  }
  check(errors.length===0,`No runtime errors: ${errors.join('; ')}`);
  return {passed:true,checks,samples,scope:'Finite real-rig poses and decoded textures; 36 front/side/rear views and two seated overhead views for inspection. Seated front garment contact samples clear the selected upper-thigh surface. Original body-ray counts remain diagnostics. Whole-body collision, other wardrobe, gait-cycle phases, performance and human acceptance are not covered.'};
}
