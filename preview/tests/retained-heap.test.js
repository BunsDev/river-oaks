import test from 'node:test';
import assert from 'node:assert/strict';
import {collectRetainedHeap} from '../e2e/retained-heap.js';

function fixture(usage,fail,detachError){
  const calls=[];
  const session={send:async command=>{calls.push(command);if(command===fail)throw new Error('CDP unavailable');return usage;},detach:async()=>{calls.push('detach');if(detachError)throw detachError;}};
  const page={context:()=>({newCDPSession:async target=>{assert.equal(target,page);calls.push('attach');return session;}})};
  return{page,calls};
}
test('retained heap is sampled after collection and the CDP session is released',async()=>{
  const {page,calls}=fixture({usedSize:1234,totalSize:4096,embedderHeapUsedSize:42});
  assert.deepEqual(await collectRetainedHeap(page),{usedSize:1234,totalSize:4096,embedderHeapUsedSize:42});
  assert.deepEqual(calls,['attach','HeapProfiler.collectGarbage','Runtime.getHeapUsage','detach']);
});
for(const failure of ['HeapProfiler.collectGarbage','Runtime.getHeapUsage'])test(`CDP failure at ${failure} is retained and detaches`,async()=>{
  const {page,calls}=fixture({usedSize:1234},failure);
  await assert.rejects(collectRetainedHeap(page),/CDP unavailable/);assert.equal(calls.at(-1),'detach');
});
for(const usedSize of [undefined,0,-1,NaN,Infinity])test(`invalid heap counter ${usedSize} cannot become passing evidence`,async()=>{
  const {page,calls}=fixture({usedSize});
  await assert.rejects(collectRetainedHeap(page),/Invalid retained heap/);assert.equal(calls.at(-1),'detach');
});
test('sampling and cleanup failures both survive with sampling as the cause',async()=>{
  const cleanup=new Error('detach unavailable'),{page}=fixture({usedSize:1234},'Runtime.getHeapUsage',cleanup);
  await assert.rejects(collectRetainedHeap(page),error=>{
    assert.ok(error instanceof AggregateError);assert.match(error.cause.message,/CDP unavailable/);
    assert.equal(error.errors[0],error.cause);assert.equal(error.errors[1],cleanup);
    assert.match(error.message,/CDP unavailable/);assert.match(error.message,/detach unavailable/);return true;
  });
});
test('cleanup-only failure prevents a passing sample',async()=>{
  const cleanup=new Error('detach unavailable'),{page}=fixture({usedSize:1234},null,cleanup);
  await assert.rejects(collectRetainedHeap(page),error=>error===cleanup);
});
