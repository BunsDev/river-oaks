import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterMetrics} from '../character-metrics.js';
test('aggregate metrics retain fixed labels and timing buckets, never caller payloads',()=>{
 const output=[],metrics=createCharacterMetrics({enabled:true,emit:value=>output.push(value),intervalMs:0});
 metrics.record('save','success',100);metrics.record('save','success',100);metrics.record('equip','paused',101);
 metrics.record('publish','conflict',501);metrics.record('rollback','unavailable',2001);
 for(const value of ['user_private','https://private.invalid',{secret:'private-token',toString(){throw new Error('must not coerce');}},null]){
  metrics.record(value,'success',1);metrics.record('save',value,1);
 }
 for(const elapsed of [-1,Infinity,NaN,'12'])metrics.record('save','success',elapsed);
 metrics.flush();assert.equal(output.length,1);assert.deepEqual(output[0],{event:'character_studio_metrics',schemaVersion:1,counts:[
  {operation:'save',outcome:'success',latency:'le100ms',count:2},
  {operation:'publish',outcome:'conflict',latency:'le2000ms',count:1},
  {operation:'rollback',outcome:'unavailable',latency:'gt2000ms',count:1},
  {operation:'equip',outcome:'paused',latency:'le500ms',count:1},
 ]});assert.doesNotMatch(JSON.stringify(output),/private|token|user_|https:/);
 metrics.flush();assert.equal(output.length,1);metrics.close();
});
test('disabled collection is silent and shutdown flushes once then rejects further records',()=>{
 const output=[];const disabled=createCharacterMetrics({emit:value=>output.push(value),intervalMs:0});disabled.record('save','success',1);disabled.flush();disabled.close();assert.equal(output.length,0);
 const enabled=createCharacterMetrics({enabled:true,emit:value=>output.push(value),intervalMs:0});enabled.record('read','rejected',500);enabled.close();assert.equal(output.length,1);enabled.record('read','success',1);enabled.flush();enabled.close();assert.equal(output.length,1);
});
test('a failed telemetry sink cannot break gameplay or grow an unbounded retry log',()=>{
 let emits=0;const metrics=createCharacterMetrics({enabled:true,intervalMs:0,emit:()=>{emits++;throw new Error('sink unavailable');}});
 metrics.record('save','success',1);assert.doesNotThrow(()=>metrics.flush());assert.doesNotThrow(()=>metrics.flush());assert.equal(emits,1);
 metrics.record('equip','success',1);assert.doesNotThrow(()=>metrics.close());assert.equal(emits,2);
});
test('a rejected async telemetry sink is handled without delaying or retrying gameplay',async()=>{
 let emits=0;const metrics=createCharacterMetrics({enabled:true,intervalMs:0,emit:async()=>{emits++;throw new Error('async sink unavailable');}});
 metrics.record('save','success',1);metrics.flush();await new Promise(resolve=>setImmediate(resolve));metrics.flush();metrics.close();assert.equal(emits,1);
});
