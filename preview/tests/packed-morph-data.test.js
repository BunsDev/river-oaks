import test from 'node:test';
import assert from 'node:assert/strict';
import {unpackMorphData} from '../src/packed-morph-data.js';
const pack=values=>{const bytes=Buffer.alloc(values.length*4);values.forEach((v,i)=>bytes.writeFloatLE(v,i*4));return bytes.toString('base64');};
const input=value=>({version:1,subdivide:false,sourcePositions:value,sourceWeights:value,positionDelta:value,normalDelta:value});
test('packed corrective preserves Float32 values and optional fitted weights',()=>{
  const values=[0,-0,1,-1,Math.fround(.3),1e-30,1e30],encoded=input(pack(values));encoded.fittedWeights=pack(values);
  const result=unpackMorphData(encoded);assert.equal(result.subdivide,false);
  for(const field of ['sourcePositions','sourceWeights','positionDelta','normalDelta','fittedWeights'])assert.deepEqual(result[field],new Float32Array(values));
  assert.equal(typeof encoded.sourcePositions,'string','decoding leaves the encoded source unchanged');
  assert.equal(unpackMorphData(input(pack([0]))).fittedWeights,undefined);
});
test('packed corrective rejects missing, truncated and non-finite numeric data',()=>{
  assert.throws(()=>unpackMorphData({}),/Missing packed morph/);
  assert.throws(()=>unpackMorphData(input('AA==')),/Invalid packed morph length/);
  assert.throws(()=>unpackMorphData(input(pack([Infinity]))),/Non-finite packed morph/);
});
