import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { createLiftSparkles } from '../src/lift-sparkles.js';

const wand=new THREE.Vector3(12,3,-8);
const spell={id:'person',mode:'lift',position:[15,2,-9],height:1.8,radius:.35};

test('both emitters follow the spell, reuse a bounded pool and fade completely after release',()=>{
  const fx=createLiftSparkles(),geometry=fx.object.geometry,buffer=geometry.attributes.position.array;
  for(let i=0;i<600;i++)fx.update(1/60,spell,wand);
  const held=fx.inspect();
  assert.ok(held.wand>0&&held.target>0);
  assert.ok(held.count<=held.capacity&&held.capacity<=320);
  assert.deepEqual(held.wandTip,wand.toArray());
  assert.equal(geometry.attributes.position.array,buffer,'No replacement GPU buffers during a hold');
  assert.ok(buffer.every(Number.isFinite));
  for(let i=0;i<180;i++)fx.update(1/60,null,wand);
  assert.equal(fx.inspect().count,0);assert.equal(fx.object.visible,false);
  fx.dispose();
});

test('reset and target changes clear old world-space trails, and disposal releases GPU resources',()=>{
  const fx=createLiftSparkles(),scene=new THREE.Scene();scene.add(fx.object);
  for(let i=0;i<30;i++)fx.update(1/60,spell,wand);
  fx.update(0,{...spell,id:'other',position:[100,2,100]},wand);
  assert.equal(fx.inspect().count,0,'A new target must not inherit the previous trail');
  fx.update(.08,spell,wand);fx.reset();assert.equal(fx.inspect().count,0);
  let disposed=0;
  for(const resource of [fx.object.geometry,fx.object.material])resource.addEventListener('dispose',()=>disposed++);
  fx.dispose();assert.equal(disposed,2);assert.equal(scene.children.length,0);
});

test('reduced motion uses stationary glimmers and pushing fades the lift effect',()=>{
  const fx=createLiftSparkles({reducedMotion:true});
  fx.update(.08,spell,wand);
  const before=Array.from(fx.object.geometry.attributes.position.array);
  for(let i=0;i<120;i++)fx.update(1/60,spell,wand);
  assert.deepEqual(Array.from(fx.object.geometry.attributes.position.array),before);
  assert.ok(fx.inspect().wand>0&&fx.inspect().target>0);
  for(let i=0;i<180;i++)fx.update(1/60,{...spell,mode:'push'},wand);
  assert.equal(fx.inspect().count,0);fx.dispose();
});
