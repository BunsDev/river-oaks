async page=>{
 await page.goto('http://127.0.0.1:5181/?motion-debug=1');
 await page.waitForFunction(()=>{const d=document.querySelector('#canvas-host').dataset;return d.playerReady==='true'&&d.charactersReady==='24'&&d.storePeopleTotal===d.storePeopleReady;},null,{timeout:90000});
 return await page.evaluate(async()=>{
  const source=await (await fetch('/src/render-pipeline.js')).text(),imports=[...source.matchAll(/from\s+["']([^"']+)["']/g)].map(m=>m[1]);
  const {RenderPass}=await import(imports.find(u=>u.includes('RenderPass__js'))),original=RenderPass.prototype.render;
  const records=new Map();let frames=0;
  RenderPass.prototype.render=function(renderer,...args){
   const draw=renderer.renderBufferDirect;
   renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
    const names=[];for(let p=object;p;p=p.parent)if(p.name)names.push(p.name);
    const category=names.reverse().slice(0,3).join('/')||object.type;
    const shadow=material.isMeshDepthMaterial||material.isMeshDistanceMaterial;
    const key=`${shadow?'shadow':'scene'} ${category} [${object.material?.name??''}]`;
    const triangles=Math.min(group?.count??Infinity,geometry.index?.count??geometry.attributes.position.count)/3*(object.isInstancedMesh?object.count:1);
    const record=records.get(key)??{key,calls:0,triangles:0};record.calls++;record.triangles+=triangles;records.set(key,record);
    return draw.call(this,camera,scene,geometry,material,object,group);
   };
   try{return original.call(this,renderer,...args);}finally{renderer.renderBufferDirect=draw;frames++;}
  };
  try{for(let i=0;i<60;i++)await new Promise(r=>requestAnimationFrame(r));}
  finally{RenderPass.prototype.render=original;}
  return {frames,top:[...records.values()].sort((a,b)=>b.triangles-a.triangles).slice(0,24).map(r=>({...r,calls:r.calls/frames,triangles:r.triangles/frames}))};
 });
}
