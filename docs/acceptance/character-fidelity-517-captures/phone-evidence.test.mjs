import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePhoneEvidence} from './phone-evidence.mjs';
const ids=['morgan-human','imani-human'],tiers=['off','low','standard','high'];
const metric=()=>({count:120,min:1,p50:2,p95:3,max:4,mean:2});
const counts={geometries:1,textures:2,programs:3};
function complete(){
 const records=[{kind:'hello',data:{userAgent:'iPhone Safari',visibility:'visible'}},{kind:'environment',data:{viewport:{width:1920,height:1080},gpu:'Apple GPU'}}];
 for(const id of ids){
  records.push({kind:'load',data:{id,result:{loadMs:10,firstFrameMs:20}}});
  for(const realism of tiers){
   for(const repeat of [0,1])for(const count of [1,8,24])records.push({kind:'frames',data:{id,realism,repeat,result:{count,frameIntervalMs:metric(),cpuMs:metric(),gpuMs:null,gpuDisjoint:null,census:{triangles:10,drawCalls:2,textureBytes:100}}}});
   records.push({kind:'lifecycle',data:{id,realism,result:{count:10,before:{...counts},after:{...counts},delta:{geometries:0,textures:0,programs:0}}}});
  }
  records.push({kind:'portraitLifecycle',data:{id,realism:'high',result:{count:3,before:{...counts},after:{...counts},delta:{geometries:0,textures:0,programs:0}}}});
  for(const realism of ['off','high'])records.push({kind:'capture',data:{id,realism,result:{definition:{appearanceId:id},views:Object.fromEntries((realism==='off'?['full','closeUp']:['full','closeUp','expression-smile','expression-browRaise']).map(view=>[view,{png:{file:`${id}.${realism}-${view}.png`,bytes:100,width:3840,height:2160,sha256:'0'.repeat(64)}}]))}}});
 }
 return records;
}
test('complete physical matrix is accepted',()=>assert.equal(validatePhoneEvidence(complete(),'physical').frames,48));
test('smoke can never count as physical evidence',()=>assert.throws(()=>validatePhoneEvidence([{kind:'smoke',data:{ready:true}}],'physical')));
test('missing and duplicate frame cases fail',()=>{
 const missing=complete();missing.splice(missing.findIndex(x=>x.kind==='frames'),1);assert.throws(()=>validatePhoneEvidence(missing,'physical'));
 const duplicate=complete();duplicate.push(duplicate.find(x=>x.kind==='frames'));assert.throws(()=>validatePhoneEvidence(duplicate,'physical'));
});
test('nonfinite or insufficient timing samples fail',()=>{
 for(const change of [metric=>metric.p95=NaN,metric=>metric.count=0]){const r=complete();change(r.find(x=>x.kind==='frames').data.result.frameIntervalMs);assert.throws(()=>validatePhoneEvidence(r,'physical'));}
});
test('missing, malformed or growing lifecycle evidence fails',()=>{
 for(const change of [r=>r.data.result.after.textures++,r=>r.data.result.delta.textures++,r=>r.data.result.count=0]){const r=complete();change(r.find(x=>x.kind==='lifecycle'));assert.throws(()=>validatePhoneEvidence(r,'physical'));}
});
test('wrong capture identity, dimensions or missing views fail',()=>{
 for(const change of [r=>r.data.result.definition.appearanceId='other',r=>r.data.result.views.full.png.width=0,r=>delete r.data.result.views.closeUp]){const r=complete();change(r.find(x=>x.kind==='capture'));assert.throws(()=>validatePhoneEvidence(r,'physical'));}
});
test('a hidden page and absent environment cannot pass',()=>{
 const hidden=complete();hidden[0].data.visibility='hidden';assert.throws(()=>validatePhoneEvidence(hidden,'physical'));
 assert.throws(()=>validatePhoneEvidence(complete().filter(x=>x.kind!=='environment'),'physical'));
});
