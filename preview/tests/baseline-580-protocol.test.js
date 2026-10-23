import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTimingBudgets } from '../audit/baseline-580-protocol.js';

const rendering = () => ({renderer:'test GPU',viewport:[1440,1000],buffer:[1440,1000],quality:{mode:'sharp',scale:1,occlusion:true,fps:60,tailShedding:false},pipeline:{samples:4,ao:true,bloom:true,renderScale:1,aoScale:1,transmissionScale:1}});
const report = () => ({ head:'a'.repeat(40),sourceFingerprint:'b'.repeat(64),status:'passed', sourceStable:true, sampleDurationMs:30000, warmupMs:5000, repetitions:3,
  machine:{platform:'darwin',arch:'arm64',cpu:'test GPU host',logicalCpus:18}, browser:'test-1', quality:'sharp', reducedMotion:'reduce',
  camera:{position:[1,2,3],target:[4,5,6],fov:55},
  profiles:[{name:'desktop',viewport:{width:1440,height:1000},deviceScaleFactor:1,status:'passed',errors:[],
    samples:[1,2].flatMap(players=>[1,2,3].map(repetition=>({players,repetition,durationMs:30001,frame:{p95Ms:20,count:1700},cpuSubmission:{p95Ms:10,count:1700},before:rendering(),after:rendering()})))}] });

test('timing budget compares medians of three windows and reports a real regression',()=>{
  const a=report(),b=report();
  b.profiles[0].samples[0].frame.p95Ms=80;
  assert.equal(compareTimingBudgets(a,b).status,'passed','one slow window is retained, median rule applies');
  b.profiles[0].samples[1].frame.p95Ms=23;
  const result=compareTimingBudgets(a,b);
  assert.equal(result.status,'failed');
  assert.equal(result.rows[0].baselineMs,20);
  assert.equal(result.rows[0].candidateMs,23);
  assert.equal(result.rows[0].limitMs,22);
});

test('ten-second, missing, duplicate, invalid and changed-source evidence cannot pass',()=>{
  for(const mutate of [
    r=>{r.sampleDurationMs=10000;},r=>{r.warmupMs=0;},r=>{delete r.warmupMs;},r=>{r.warmupMs=NaN;},r=>{r.sourceStable=false;},
    r=>{r.profiles[0].samples.pop();},r=>{r.profiles[0].samples[1].repetition=1;},
    r=>{r.profiles[0].samples[0].frame.p95Ms=NaN;},r=>{r.profiles[0].samples[0].durationMs=9000;},
    r=>{r.profiles[0].samples[0].frame.count=0;},r=>{r.profiles[0].errors.push('failed asset');},
  ]) {
    const candidate=report();mutate(candidate);
    assert.equal(compareTimingBudgets(report(),candidate).status,'incomplete');
  }
});

test('different cameras, hardware, renderers and viewport workloads are incomparable',()=>{
  for(const mutate of [
    r=>{r.camera.fov=65;},r=>{r.machine.cpu='another host';},r=>{r.browser='test-2';},
    r=>{r.quality='smooth';},r=>{r.profiles[0].deviceScaleFactor=2;},
    r=>{r.profiles[0].samples[0].after.renderer='different GPU';},
  ]){
    const candidate=report();mutate(candidate);
    assert.equal(compareTimingBudgets(report(),candidate).status,'incomplete');
  }
});


test('actual rendering workload must match and remain stable throughout every window',()=>{
  for(const mutate of [
    r=>{for(const s of r.profiles[0].samples)for(const state of [s.before,s.after]){state.buffer=state.buffer.map(x=>x/2);state.quality.scale=.5;}},
    r=>{r.profiles[0].samples[0].before.buffer=[720,500];},
    r=>{r.profiles[0].samples[0].after.pipeline.ao=false;},
    r=>{r.profiles[0].samples[0].after.pipeline.transmissionScale=.5;},
    r=>{r.profiles[0].samples[0].after.quality.tailShedding=true;},
    r=>{delete r.profiles[0].samples[0].before;},
    r=>{delete r.profiles[0].samples[0].after.pipeline;},
  ]) {
    const candidate=report();mutate(candidate);
    for(const sample of candidate.profiles[0].samples)sample.frame.p95Ms*=.9;
    assert.equal(compareTimingBudgets(report(),candidate).status,'incomplete');
  }
  const candidate=report();
  for(const sample of candidate.profiles[0].samples){sample.before.quality.fps=3;sample.after.quality.fps=59;}
  assert.equal(compareTimingBudgets(report(),candidate).status,'passed','observed FPS is a measurement, not a rendering setting');
});

test('source identities are required but different candidate revisions remain comparable',()=>{
  for(const field of ['head','sourceFingerprint'])for(const value of [undefined,'',123,'invalid']){
    const candidate=report();candidate[field]=value;
    assert.equal(compareTimingBudgets(report(),candidate).status,'incomplete');
  }
  const candidate=report();candidate.head='c'.repeat(40);candidate.sourceFingerprint='d'.repeat(64);
  assert.equal(compareTimingBudgets(report(),candidate).status,'passed');
});
