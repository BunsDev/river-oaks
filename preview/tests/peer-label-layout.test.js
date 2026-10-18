import test from 'node:test';
import assert from 'node:assert/strict';
import {layoutPeerLabels} from '../src/peer-label-layout.js';
const label=(id,x,y,extra={})=>({id,x,y,width:110,height:26,distance:10,...extra});
test('a crowded phone view retains readable nonoverlapping labels instead of stacking names',()=>{
 const candidates=Array.from({length:16},(_,i)=>label(String(i),160+(i%4)*20,250+Math.floor(i/4)*15,{distance:4+i}));
 const visible=layoutPeerLabels(candidates,{width:390,height:844});
 assert(visible.length>0&&visible.length<16);assert.equal(visible[0].id,'0');
 for(let i=0;i<visible.length;i++)for(let j=i+1;j<visible.length;j++){
  const a=visible[i],b=visible[j];assert(a.right+4<=b.left||b.right+4<=a.left||a.bottom+4<=b.top||b.bottom+4<=a.top);
 }
 assert.equal(candidates.length,16,'layout does not remove players or mutate input');
});
test('speakers take priority and existing nearby labels resist tiny distance changes',()=>{
 const candidates=[label('near',100,100,{distance:4}),label('old',100,100,{distance:4.1,wasVisible:true})];
 assert.equal(layoutPeerLabels(candidates,{width:400,height:300})[0].id,'old');
 assert.equal(layoutPeerLabels([...candidates,label('speaker',100,100,{distance:8,speaking:true})],{width:400,height:300})[0].id,'speaker');
 candidates[0].distance=2;assert.equal(layoutPeerLabels(candidates,{width:400,height:300})[0].id,'near');
});
test('separated labels all remain and viewport edges contain full text boxes',()=>{
 const candidates=[label('left',1,30),label('right',399,30),label('bottom',200,299)];
 const visible=layoutPeerLabels(candidates,{width:400,height:300});assert.equal(visible.length,3);
 assert(visible.every(r=>r.left>=4&&r.right<=396&&r.top>=4&&r.bottom<=296));
});
test('ties are stable across input order and invalid geometry does not consume space',()=>{
 const candidates=[label('b',100,100),label('a',100,100),label('invalid',NaN,100)];
 const opts={width:400,height:300};assert.deepEqual(layoutPeerLabels(candidates,opts),layoutPeerLabels([...candidates].reverse(),opts));
 assert.equal(layoutPeerLabels(candidates,opts)[0].id,'a');assert.deepEqual(layoutPeerLabels(candidates,{width:0,height:0}),[]);
});
