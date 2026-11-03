import test from 'node:test';
import assert from 'node:assert/strict';
import { createRideFlush } from '../ride-flush.js';

// A fake world hands out whatever rides are queued and forgets them, as
// world.drainRides does; a fake store scripts its answers per call.
function harness(answers) {
  let rides=[];
  const calls=[],warnings=[];
  const store={async add(userId,meters,name){
    calls.push({userId,meters,name});
    const answer=answers.shift()??'ok';
    if(answer instanceof Error)throw answer;
    return answer==='null'?null:meters;
  }};
  const flush=createRideFlush({world:()=>({drainRides(){const drained=rides;rides=[];return drained;}}),store,warn:detail=>warnings.push(detail)});
  return {flush,calls,warnings,ride(userId,meters,name=userId){rides.push({userId,name,meters});}};
}

test('a store that throws twice keeps the metres pending and banks them on the third flush', async () => {
  const h=harness([new Error('redis down'),new Error('redis down')]);
  h.ride('alice',5);
  await h.flush.flush();
  assert.deepEqual(h.flush.pending(),[{userId:'alice',name:'alice',meters:5}]);
  assert.deepEqual(h.warnings,[{event:'cycling_flush_failed',riders:1,error:'redis down'}]);
  h.ride('alice',2,'Alice');
  await h.flush.flush();
  assert.deepEqual(h.flush.pending(),[{userId:'alice',name:'Alice',meters:7}],'a later ride merges into the held entry with the newest name');
  assert.equal(h.warnings.length,2,'one warning per failed attempt, not per rider');
  await h.flush.flush();
  assert.deepEqual(h.flush.pending(),[]);
  assert.deepEqual(h.calls.map(call=>call.meters),[5,7,7]);
  assert.equal(h.warnings.length,2);
});

test('a null answer (the rider cap) drops the entry instead of retrying it', async () => {
  const h=harness(['null']);
  h.ride('bob',3);
  await h.flush.flush();
  assert.deepEqual(h.flush.pending(),[]);
  assert.deepEqual(h.warnings,[{event:'cycling_riders_dropped',riders:1}]);
  await h.flush.flush();
  assert.equal(h.calls.length,1);
});

test('overlapping flushes share one in-flight promise and nothing is lost across them', async () => {
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const calls=[];
  const store={async add(userId,meters){calls.push([userId,meters]);await gate;return meters;}};
  let rides=[{userId:'alice',name:'alice',meters:4}];
  const flush=createRideFlush({world:()=>({drainRides(){const drained=rides;rides=[];return drained;}}),store});
  const first=flush.flush();
  rides=[{userId:'alice',name:'alice',meters:1},{userId:'bob',name:'bob',meters:2}];
  const second=flush.flush();
  assert.equal(second,first,'a flush started while one runs returns the running one');
  assert.equal(flush.inFlight,first);
  assert.deepEqual(flush.pending().map(ride=>[ride.userId,ride.meters]),[['alice',1],['bob',2]],'the second call still merged its drain');
  release();await first;
  assert.equal(flush.inFlight,null);
  assert.deepEqual(calls,[['alice',4]]);
  await flush.flush();
  assert.deepEqual(calls,[['alice',4],['alice',1],['bob',2]]);
  assert.deepEqual(flush.pending(),[]);
});

test('settle waits for the running flush and then sends what it left behind', async () => {
  let release;
  const gate=new Promise(resolve=>{release=resolve;});
  const calls=[];
  const store={async add(userId,meters){calls.push([userId,meters]);await gate;return meters;}};
  let rides=[{userId:'alice',name:'alice',meters:4}];
  const flush=createRideFlush({world:()=>({drainRides(){const drained=rides;rides=[];return drained;}}),store});
  void flush.flush();
  flush.merge([{userId:'carol',name:'carol',meters:6}]);
  const settled=flush.settle();
  release();await settled;
  assert.deepEqual(calls,[['alice',4],['carol',6]]);
  assert.deepEqual(flush.pending(),[]);
});

test('forgetting an account drops its queued metres and waits out a bank already running', async () => {
  let rides=[{userId:'erin',name:'Erin',meters:5},{userId:'pat',name:'Pat',meters:7}],release,failErin=true;
  const banked=[],gate=new Promise(resolve=>{release=resolve;});
  const store={async add(userId,meters){await gate;if(userId==='erin'&&failErin)throw new Error('down');banked.push([userId,meters]);return meters;}};
  const flush=createRideFlush({world:()=>({drainRides(){const drained=rides;rides=[];return drained;}}),store});
  const running=flush.flush();
  let forgotten=false;const forgetting=flush.forget('erin').then(()=>{forgotten=true;});
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(forgotten,false,'the erasure waits for the bank in progress');
  release();await running;await forgetting;
  // Erin's failed ride came back to the queue, and the erasure dropped it again.
  assert.deepEqual(flush.pending(),[]);
  assert.deepEqual(banked,[['pat',7]]);
  rides=[{userId:'erin',name:'Erin',meters:3}];flush.drain();await flush.forget('erin');
  failErin=false;await flush.send();
  assert.deepEqual(banked,[['pat',7]]);
});
