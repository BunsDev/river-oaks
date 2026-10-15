import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker as NodeWorker } from 'node:worker_threads';
import { createSpaceAssessmentRunner } from '../src/studio/space-assessment-runner.js';
import { createSpace, spaceAssessmentContext } from '../src/studio/space-templates.js';

function nodeWorker() {
  const entry = new URL('../src/studio/space-assessment-worker.js', import.meta.url).href;
  const worker = new NodeWorker(`import { parentPort } from 'node:worker_threads';
    globalThis.self={postMessage:data=>parentPort.postMessage(data)};
    await import(${JSON.stringify(entry)});
    parentPort.on('message',data=>self.onmessage({data}));`, { eval:true, type:'module' });
  const adapter = { postMessage:data=>worker.postMessage(data), terminate:()=>worker.terminate() };
  worker.on('message',data=>adapter.onmessage?.({data}));
  worker.on('error',error=>adapter.onerror?.(error));
  return adapter;
}

test('real worker assesses the same bounded movement profile off the caller thread', async () => {
  const runner=createSpaceAssessmentRunner({makeWorker:nodeWorker});
  try {
    let ticked=false;setImmediate(()=>{ticked=true;});
    const result=await runner.assess(createSpace('office'),spaceAssessmentContext('office'),{revision:7});
    assert.equal(ticked,true);assert.equal(result.status,'passed');assert.equal(result.revision,7);
    assert.equal(result.routes.length,5);
  } finally { runner.dispose(); }
});

test('supersession, abort and disposal terminate workers and ignore their late replies', async () => {
  const workers=[];
  const runner=createSpaceAssessmentRunner({makeWorker:()=>{
    const worker={terminated:0,postMessage(){},terminate(){this.terminated++;}};workers.push(worker);return worker;
  }});
  const first=runner.assess({},null), firstRejected=assert.rejects(first,/cancel/i);
  const controller=new AbortController(),second=runner.assess({},null,{signal:controller.signal});
  const secondRejected=assert.rejects(second,/cancel/i);
  await firstRejected;assert.equal(workers[0].terminated,1);
  workers[0].onmessage({data:{result:{status:'passed'}}});
  controller.abort();await secondRejected;assert.equal(workers[1].terminated,1);
  const third=runner.assess({},null),thirdRejected=assert.rejects(third,/cancel/i);
  runner.dispose();await thirdRejected;assert.equal(workers[2].terminated,1);
  await assert.rejects(runner.assess({},null),/cancel/i);
});

test('worker and transport errors fail closed and release the worker', async () => {
  for(const event of ['error','messageerror','post']) {
    const workers=[];
    const runner=createSpaceAssessmentRunner({makeWorker:()=>{
      const worker={terminated:false,postMessage(){if(event==='post')throw Error('post failed');},terminate(){this.terminated=true;}};workers.push(worker);return worker;
    }});
    const pending=runner.assess({},null),rejected=assert.rejects(pending,/failed|read/);
    if(event==='error')workers[0].onerror();
    if(event==='messageerror')workers[0].onmessageerror();
    await rejected;assert.equal(workers[0].terminated,true);runner.dispose();
  }
});
