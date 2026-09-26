async page=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://127.0.0.1:5181/e2e/fixtures/workers.html');
  await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
  const result=await page.evaluate(()=>{
    const f=window.workerFixture,runs=[];let now=1000;
    if(f.people.userData.figures.length!==194)throw new Error('Expected every worker, guest and mannequin to be loaded');
    const pose=figure=>{
      const values=figure.avatar.bones.flatMap(bone=>bone.matrixWorld.toArray());
      figure.avatar.model.traverse(mesh=>{
        if(!mesh.isSkinnedMesh)return;
        mesh.skeleton.update();
        values.push(...mesh.bindMatrixInverse.elements,...mesh.skeleton.boneMatrices);
      });
      return values;
    };
    for(const figure of f.people.userData.figures) {
      const visitor=f.focus(figure),near=f.camera.position.clone();f.state.selectedId=null;
      f.people.userData.update(f.camera,now+=100,f.state,visitor);
      f.renderer.render(f.scene,f.camera);
      const before=pose(figure),workTime=figure.workTime;
      f.camera.position.copy(near).addScalar(1000);
      f.people.userData.update(f.camera,now+=100,f.state,visitor);
      if(figure.holder.parent.visible)throw new Error('Room did not become hidden');
      f.renderer.render(f.scene,f.camera);
      const hidden=pose(figure);
      if(hidden.some((value,index)=>value!==before[index]))throw new Error(`Hidden skeleton changed: ${figure.id}`);
      f.camera.position.copy(near);
      f.people.userData.update(f.camera,now+=5000,f.state,visitor);
      f.renderer.render(f.scene,f.camera);
      const returned=pose(figure),maxDifference=Math.max(...returned.map((value,index)=>Math.abs(value-before[index])));
      if(maxDifference>1e-5||figure.workTime!==workTime)throw new Error(`Return pose changed: ${figure.id}, ${maxDifference}`);
      runs.push({id:figure.id,role:figure.role,kind:figure.task?.kind??(figure.seatedFeet?'seated':'standing'),maxDifference});
    }
    return {runs};
  });
  if(errors.length)throw new Error(errors.join('; '));
  return {...result,errors,scope:'Actual renderer updates across hide/re-entry for every station skeleton, skinning palette and bind transform.'};
}
