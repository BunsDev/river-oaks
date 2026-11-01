import test from 'node:test';import assert from 'node:assert/strict';import {createAngelWings,WING_REST} from '../src/angel-wings.js';
test('layered wings stay instanced, unfold continuously, and honor reduced motion',()=>{
 const wings=createAngelWings({reducedMotion:true});
 try {
  let meshes=0,triangles=0;wings.object.traverse(mesh=>{if(mesh.isMesh){meshes++;triangles+=mesh.geometry.index.count/3*(mesh.count??1);}});
  assert.ok(meshes<=8);assert.ok(triangles<80000);
  assert.equal(wings.object.visible,false);
  for(let i=0;i<180;i++)wings.update(i*1000/60,1/60,{amount:1,speed:7,climbing:2});
  assert.equal(wings.object.visible,true);const before=wings.object.children[0].rotation.toArray();
  wings.update(20000,1/60,{amount:1,speed:7,climbing:2});const after=wings.object.children[0].rotation.toArray();
  assert.ok(Math.abs(before[1]-after[1])<1e-6);
  for(let i=0;i<180;i++)wings.update(20000+i*1000/60,1/60,{amount:0});
  assert.equal(wings.object.visible,false);
 }finally{wings.dispose();}
});

test('at rest the wings stay out, folded back and nearly still; seated (rest 0) they fold away',()=>{
 for(const reducedMotion of [true,false]){
  const wings=createAngelWings({reducedMotion});
  try {
   for(let i=0;i<240;i++)wings.update(i*1000/60,1/60,{amount:0,rest:WING_REST});
   assert.equal(wings.object.visible,true,'resting wings are visible');
   const hinge=wings.object.children[0],restFold=Math.abs(hinge.rotation.y);
   const samples=[];for(let i=0;i<240;i++){wings.update(4000+i*1000/60,1/60,{amount:0,rest:WING_REST});samples.push(hinge.rotation.y);}
   const spread=Math.max(...samples)-Math.min(...samples);
   if(reducedMotion)assert.ok(spread<1e-6,'reduced motion holds the resting fold still');else assert.ok(spread>0&&spread<.06,`resting wings only breathe (${spread.toFixed(3)} rad)`);
   for(let i=0;i<240;i++)wings.update(8000+i*1000/60,1/60,{amount:1,rest:WING_REST,speed:7,climbing:2});
   assert.ok(Math.abs(hinge.rotation.y)<restFold-.4,'flight opens the wings well past the resting fold');
   for(let i=0;i<240;i++)wings.update(12000+i*1000/60,1/60,{amount:0,rest:0});
   assert.equal(wings.object.visible,false,'in the car the wings fold away');
  }finally{wings.dispose();}
 }
});
