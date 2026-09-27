async page=>{
 await page.goto('http://127.0.0.1:5181/e2e/fixtures/workers.html');
 await page.waitForFunction(()=>document.body.dataset.ready==='true',null,{timeout:90000});
 return await page.evaluate(()=>{
  const f=window.workerFixture,figures=f.people.userData.figures;
  const visitor=f.focus(figures.find(p=>p.role==='staff'));
  f.people.userData.update(f.camera,1000,f.state,visitor);
  let visible=0,hidden=0,visibleVisits=0,hiddenVisits=0;
  const originals=[];
  for(const room of f.people.children)room.traverse(node=>{
   if(room.visible)visible++;else hidden++;
   const original=node.updateMatrixWorld;originals.push([node,original]);
   node.updateMatrixWorld=function(force){if(room.visible)visibleVisits++;else hiddenVisits++;return original.call(this,force);};
  });
  f.scene.updateMatrixWorld(true);
  for(const [node,original] of originals)node.updateMatrixWorld=original;
  const runs=[];
  for(let run=0;run<8;run++){
   const start=performance.now();for(let i=0;i<300;i++)f.scene.updateMatrixWorld(true);
   if(run)runs.push((performance.now()-start)/300);
  }
  runs.sort((a,b)=>a-b);
  return {visible,hidden,visibleVisits,hiddenVisits,medianUpdateMs:runs[3],runs,figures:figures.length};
 });
}
