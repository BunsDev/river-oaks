import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';

test('invasion reset releases old residents and disposes the old world before another begin',async()=>{
  // Exercise the real controller with only its DOM and WebGL view replaced.
  function load(url,context,nextLoad){
    if(url.endsWith('.css'))return {format:'module',source:'',shortCircuit:true};
    if(url.endsWith('/invaders.js'))return {format:'module',shortCircuit:true,source:`export function createInvaders({scene}) { return {crew:[],begin(){scene.events.push('begin')},clear(){},sync(){},dispose(){scene.events.push('dispose')}}; }`};
    return nextLoad(url,context);
  }
  register(new URL(`data:text/javascript,${encodeURIComponent(`export ${load.toString()}`)}`));
  const previousDocument=globalThis.document;
  class Element {
    dataset={};children=new Map();listeners=new Map();
    setAttribute(){}
    addEventListener(type,listener){this.listeners.set(type,listener);}
    querySelector(selector){if(!this.children.has(selector))this.children.set(selector,new Element());return this.children.get(selector);}
    click(){this.listeners.get('click')?.();}
  }
  globalThis.document={createElement:()=>new Element()};
  try {
    const {createInvasionControls}=await import('../src/invasion-ui.js');
    const scene={events:[]},world={bounds_m:[-40,-40,40,40],walkSpawn:[0,0,0],collisionPolygons:[]};
    let locals=[{id:'old-resident',position:[0,0,0]}];
    const controls=createInvasionControls({scene,host:new Element(),walking:{getPose:()=>null},getWorld:()=>world,getLocals:()=>locals,getForm:()=> 'jevica'});
    assert.equal(typeof controls.reset,'function','World replacement needs an explicit reset contract');
    controls.reset();
    const toggle=controls.panel.querySelector('#invasion-toggle');toggle.click();
    const oldState=controls.state,oldResident=locals[0];oldResident.abducted=true;oldState.abducted.push(oldResident.id);
    controls.reset();
    assert.equal(oldResident.abducted,undefined);assert.deepEqual(oldState.abducted,[]);
    assert.equal(controls.state,null);assert.equal(JSON.parse(controls.panel.dataset.state).phase,'idle');
    assert.deepEqual(scene.events,['begin','dispose']);
    locals=[{id:'new-resident',position:[0,0,0]}];controls.update(1,1000);
    assert.equal(locals[0].abducted,undefined);assert.equal(controls.state,null);
    toggle.click();assert.notEqual(controls.state,oldState);assert.equal(controls.state.elapsed,0);assert.deepEqual(controls.state.abducted,[]);
    controls.reset();controls.reset();assert.deepEqual(scene.events,['begin','dispose','begin','dispose']);
  } finally {globalThis.document=previousDocument;}
});
