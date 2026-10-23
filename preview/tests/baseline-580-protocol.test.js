import test from 'node:test';
import assert from 'node:assert/strict';
import { compareTimingBudgets } from '../audit/baseline-580-protocol.js';

const report = () => ({ status:'passed', sourceStable:true, sampleDurationMs:30000, warmupMs:5000, repetitions:3,
  machine:{platform:'darwin',arch:'arm64',cpu:'test GPU host',logicalCpus:18}, browser:'test-1', quality:'sharp', reducedMotion:'reduce',
  camera:{position:[1,2,3],target:[4,5,6],fov:55},
  profiles:[{name:'desktop',viewport:{width:1440,height:1000},deviceScaleFactor:1,status:'passed',errors:[],
    samples:[1,2].flatMap(players=>[1,2,3].map(repetition=>({players,repetition,durationMs:30001,frame:{p95Ms:20,count:1700},cpuSubmission:{p95Ms:10,count:1700},after:{renderer:'test GPU'}})))}] });

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
