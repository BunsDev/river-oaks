import test from 'node:test';import assert from 'node:assert/strict';import {createAngelWings} from '../src/angel-wings.js';
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
