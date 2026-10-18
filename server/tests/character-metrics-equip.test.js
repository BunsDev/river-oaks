import test from 'node:test';
import assert from 'node:assert/strict';
import {createCharacterMetrics} from '../character-metrics.js';
import {observeCharacterEquip} from '../character-metrics-equip.js';
test('equip observations classify fixed outcomes, emit once and exclude result payloads',()=>{
 const output=[],metrics=createCharacterMetrics({enabled:true,intervalMs:0,emit:value=>output.push(value)});
 const cases=[['success',{ok:true,definition:{private:'secret'}}],['paused',{ok:false,error:'character_studio_disabled'}],['conflict',{ok:false,error:'character_selection_conflict'}],['rejected',{ok:false,error:'character_revision_missing'}],['unavailable',{ok:false,error:'private-owner-storage-error'}],['unavailable',{ok:false,error:'request_timeout'}]];
 for(const [,result] of cases){let clock=0;const observation=observeCharacterEquip(metrics,{now:()=>clock});clock=501;observation.result(result);observation.result({ok:true});observation.unavailable();observation.aborted();}
 const aborted=observeCharacterEquip(metrics);aborted.aborted();aborted.result({ok:true});
 metrics.close();const counts=output[0].counts;
 for(const outcome of ['success','paused','conflict','rejected','unavailable','aborted'])assert.equal(counts.filter(row=>row.outcome===outcome).reduce((sum,row)=>sum+row.count,0),outcome==='unavailable'?2:1);
 assert(counts.every(row=>row.operation==='equip'));
 assert(counts.filter(row=>row.outcome!=='aborted').every(row=>row.latency==='le2000ms'));
 assert.doesNotMatch(JSON.stringify(output),/private|secret|definition|request_timeout|character_revision/);
});
test('failed and missing metrics sinks cannot change equip behavior',()=>{
 for(const metrics of [null,{record(){throw new Error('sink failed');}}]){
  const observation=observeCharacterEquip(metrics);assert.doesNotThrow(()=>observation.result({ok:true}));
  assert.doesNotThrow(()=>observeCharacterEquip(metrics).unavailable());
 }
});
test('ordinary world policy denials are rejected, not backend outages',()=>{
 const codes=['invalid_character_selection','invalid_character_owner','invalid_character_definition','land_before_appearance','exclusive_appearance','leave_office_first','invalid_character','invalid_appearance','rate_limited','appearance_cooldown'];
 const rows=[];for(const error of codes)observeCharacterEquip({record:(...args)=>rows.push(args)}).result({ok:false,error});
 assert(rows.every(([operation,outcome])=>operation==='equip'&&outcome==='rejected'));
});
