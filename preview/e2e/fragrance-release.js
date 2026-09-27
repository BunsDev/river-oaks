async page=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.setViewportSize({width:1400,height:900});await page.emulateMedia({reducedMotion:'no-preference'});
  const origin=await page.evaluate(()=>location.origin);
  await page.goto(`${origin.startsWith('http')?origin:'http://127.0.0.1:5173'}/e2e/fixtures/workers.html`);
  await page.waitForFunction(()=>document.body.dataset.ready==='true');
  const result=await page.evaluate(async()=>{
    const f=window.workerFixture,{THREE}=f,workers=f.people.userData.figures.filter(p=>p.task?.kind==='blotter'),results=[],failures=[];
    const intersects=(strip,box)=>{
      box.geometry.computeBoundingBox();const bounds=box.geometry.boundingBox.clone().expandByScalar(-.00005);
      const p=strip.geometry.attributes.position,index=strip.geometry.index;
      const point=i=>box.worldToLocal(strip.localToWorld(new THREE.Vector3().fromBufferAttribute(p,i)));
      for(let i=0;i<index.count;i+=3)if(bounds.intersectsTriangle(new THREE.Triangle(...[0,1,2].map(k=>point(index.getX(i+k))))))return true;
      return false;
    };
    let now=1000;
    for(const hz of [30,60,120])for(const pauseAt of [.9,2.8])for(const figure of workers) {
      const visitor=f.focus(figure);figure.workTime=0;figure.motionTime=0;figure.attention=0;figure.suspended=true;f.state.selectedId=null;
      let previous=null,pauseTime=null,pausePoint=null,maxPauseDrift=0,maxElbowSpeed=0,maxWristSpeed=0,maxWristAngularSpeed=0,maxTipSpeed=0,maxPaperAngularSpeed=0,held=0,released=0,skinSamples=0,clipSamples=0,maxWristBend=0,maxSidewaysBend=0;
      const stand=figure.task.object.getObjectByName('Blotter stand'),solids=[];stand?.traverse(mesh=>{if(mesh.isMesh)solids.push(mesh);});
      for(let frame=0;frame<=16*hz;frame++) {
        const time=frame/hz;f.state.selectedId=time>=pauseAt&&time<pauseAt+2?figure.id:null;
        now+=1000/hz;f.people.userData.update(f.camera,now,f.state,visitor);
        const task=figure.task,contact=task.contacts.find(c=>c.side==='r'),hand=figure.avatar.model.getObjectByName('hand_r');
        const point=task.strip.getWorldPosition(new THREE.Vector3()),tip=task.strip.localToWorld(new THREE.Vector3(0,0,.117));
        const wrist=hand.getWorldPosition(new THREE.Vector3()),rotation=hand.getWorldQuaternion(new THREE.Quaternion()),paper=task.strip.getWorldQuaternion(new THREE.Quaternion());
        const elbow=figure.avatar.model.getObjectByName('lowerarm_r').getWorldPosition(new THREE.Vector3());
        if(previous){maxElbowSpeed=Math.max(maxElbowSpeed,elbow.distanceTo(previous.elbow)*hz);maxWristSpeed=Math.max(maxWristSpeed,wrist.distanceTo(previous.wrist)*hz);maxWristAngularSpeed=Math.max(maxWristAngularSpeed,rotation.angleTo(previous.rotation)*hz);maxTipSpeed=Math.max(maxTipSpeed,tip.distanceTo(previous.tip)*hz);maxPaperAngularSpeed=Math.max(maxPaperAngularSpeed,paper.angleTo(previous.paper)*hz);}
        previous={elbow,wrist,rotation,tip,paper};
        if(time>=pauseAt&&time<pauseAt+2){
          if(pauseTime===null){pauseTime=figure.workTime;pausePoint=point.clone();}
          if(figure.workTime!==pauseTime)failures.push({id:figure.id,hz,pauseAt,time,reason:'task advanced during conversation'});
          maxPauseDrift=Math.max(maxPauseDrift,point.distanceTo(pausePoint));
        }
        if(contact.engaged)held++;else released++;
        if(!task.docked&&!contact.engaged)failures.push({id:figure.id,hz,time,reason:'unsupported paper released'});
        if(frame%Math.max(1,Math.round(hz/12))===0) {
          const skins=f.inspectSkin(figure);skinSamples++;
          for(const skin of skins){
            maxWristBend=Math.max(maxWristBend,skin.wristBend);maxSidewaysBend=Math.max(maxSidewaysBend,skin.sidewaysBend);
            if(skin.collisions||skin.loadPenetrations||skin.pinch?.penetrations||skin.wristBend>=Math.PI/2||skin.sidewaysBend>Math.PI/9)failures.push({id:figure.id,hz,pauseAt,time,skin});
            if(skin.kind==='pinch'&&skin.engaged&&(!skin.pinch.index||!skin.pinch.thumb||[skin.pinch.indexGap,skin.pinch.thumbGap].some(g=>!Number.isFinite(g)||g<-.0002||g>.002)))failures.push({id:figure.id,hz,pauseAt,time,reason:'lost fingertip contact',skin});
          }
          for(const solid of solids){clipSamples++;if(intersects(task.strip,solid))failures.push({id:figure.id,hz,pauseAt,time,reason:`paper crossed ${solid.name}`});}
          if(frame%(2*hz)===0){const body=f.inspectBody(figure);if(body.collisions)failures.push({id:figure.id,hz,pauseAt,time,body});}
        }
      }
      const entry={id:figure.id,docked:figure.task.docked,hz,pauseAt,maxPauseDrift,maxElbowSpeed,maxWristSpeed,maxWristAngularSpeed,maxTipSpeed,maxPaperAngularSpeed,held,released,skinSamples,clipSamples,maxWristBend,maxSidewaysBend};
      if(maxPauseDrift>1e-6||maxElbowSpeed>1.5||maxWristSpeed>1.2||maxWristAngularSpeed>7||maxTipSpeed>1.5||maxPaperAngularSpeed>6||!held||(figure.task.docked&&!released))failures.push(entry);
      results.push(entry);
    }
    return {results,failures:failures.slice(0,12),failureCount:failures.length};
  });
  if(result.results.length!==12||result.failureCount||errors.length)throw new Error(JSON.stringify({...result,errors}));
  return {...result,errors};
}
