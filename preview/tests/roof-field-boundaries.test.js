import test from 'node:test';
import assert from 'node:assert/strict';
import { roofFieldBoundaries } from '../src/roof-field-boundaries.js';
const field = (x,n) => ({at:[x,n],size:1});
const area = ring => ring.reduce((sum,a,i) => { const b=ring[(i+1)%ring.length];return sum+(a[0]*b[1]-b[0]*a[1])/2; },0);
test('adjacent field cells become one seamless boundary without changing planted area',()=>{
 const rings=roofFieldBoundaries([field(0,0),field(1,0),field(1,1)]);
 assert.equal(rings.length,1);assert.equal(area(rings[0]),3);
 assert.deepEqual(rings,roofFieldBoundaries([field(0,0),field(1,0),field(1,1)]));
});
test('equipment and service holes remain holes, separate patches remain separate',()=>{
 const fields=[];for(let n=0;n<3;n++)for(let x=0;x<3;x++)if(x!==1||n!==1)fields.push(field(x,n));
 const rings=roofFieldBoundaries(fields);assert.equal(rings.length,2);assert.deepEqual(rings.map(area).sort((a,b)=>a-b),[-1,9]);
 assert.equal(roofFieldBoundaries([field(0,0),field(1,1)]).length,2);
 assert.deepEqual(roofFieldBoundaries([]),[]);
});
