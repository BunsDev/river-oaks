import test from 'node:test';
import assert from 'node:assert/strict';
import { createLikenessQuarantine, LIKENESS_CONSENT_POLICY } from '../character-likeness-quarantine.js';
import { makeLikenessFixture } from '../character-likeness-fixture.js';

const options={enabled:true,environment:{NODE_ENV:'test'}};
const consent=(display=true)=>({policy:LIKENESS_CONSENT_POLICY,adult:true,selfLikeness:true,processing:true,display});
const make=()=>createLikenessQuarantine(options);
async function approved(h,owner='fixture-alice',display=true) {
  const r=await h.intake.submit(owner,makeLikenessFixture(),consent(display));
  h.reviewer.approve(owner,r.id);return r.id;
}

for(const [name,value] of [
  ['missing consent',undefined],
  ['stale policy',{...consent(),policy:'fixture-consent-v0'}],
  ['unattested adult eligibility',{...consent(),adult:false}],
  ['third-party likeness',{...consent(),selfLikeness:false}],
  ['declined processing',{...consent(),processing:false}],
  ['private identity field',{...consent(),legalName:'PRIVATE_SENTINEL'}],
])test(`submission refuses ${name} before allocating a record`,async()=>{
  const {intake}=make();
  await assert.rejects(intake.submit('fixture-alice',makeLikenessFixture(),value),{code:'likeness_consent_required'});
  assert.deepEqual(intake.list('fixture-alice'),[]);
  const audit=intake.audit('fixture-alice');
  assert.deepEqual(audit.map(e=>e.action),['consent_refused']);
  assert.equal(JSON.stringify(audit).includes('PRIVATE_SENTINEL'),false);
});

test('caller mutation of the consent object after submission cannot widen display scope',async()=>{
  const h=make(),given=consent(false);
  const pending=h.intake.submit('fixture-alice',makeLikenessFixture(),given);
  given.display=true;
  const {id}=await pending;
  h.reviewer.approve('fixture-alice',id);
  assert.throws(()=>h.intake.publish('fixture-alice',id),{code:'likeness_display_consent_required'});
});

test('processing-only consent can be moderated but never published until display is granted and re-reviewed',async()=>{
  const h=make(),id=await approved(h,'fixture-alice',false);
  assert.throws(()=>h.intake.publish('fixture-alice',id),{code:'likeness_display_consent_required'});
  assert.equal(h.intake.grantDisplay('fixture-alice',id).state,'quarantined');
  assert.throws(()=>h.intake.publish('fixture-alice',id),{code:'likeness_not_approved'});
  h.reviewer.approve('fixture-alice',id);
  assert.equal(h.intake.resolve('fixture-alice',h.intake.publish('fixture-alice',id)).kind,'fixture');
});

test('display withdrawal falls back immediately and old signatures stay dead after a later re-grant',async()=>{
  const h=make(),id=await approved(h);
  const first=h.intake.publish('fixture-alice',id);
  assert.deepEqual(h.intake.withdrawDisplay('fixture-alice',id),{id,state:'quarantined',display:false,expiresAt:h.intake.read('fixture-alice',id).expiresAt});
  assert.deepEqual(h.intake.resolve('fixture-alice',first),{kind:'fallback',appearanceId:'sable-human'});
  assert.throws(()=>h.intake.publish('fixture-alice',id),{code:'likeness_display_consent_required'});
  h.intake.grantDisplay('fixture-alice',id);
  assert.throws(()=>h.intake.publish('fixture-alice',id),{code:'likeness_not_approved'});
  h.reviewer.approve('fixture-alice',id);
  const second=h.intake.publish('fixture-alice',id);
  assert.notEqual(second.signature,first.signature);
  assert.equal(h.intake.resolve('fixture-alice',second).kind,'fixture');
  assert.equal(h.intake.resolve('fixture-alice',first).kind,'fallback');
  assert.equal(h.intake.resolve('fixture-alice',{...first,grant:second.grant}).kind,'fallback');
});

test('foreign owners cannot change another owner consent or read their audit',async()=>{
  const h=make(),id=await approved(h);
  for(const action of [h.intake.withdrawDisplay,h.intake.grantDisplay])assert.throws(()=>action('fixture-bob',id),{code:'likeness_unavailable'});
  assert.deepEqual(h.intake.audit('fixture-bob'),[]);
  assert.ok(h.intake.audit('fixture-alice').length>0);
  assert.throws(()=>h.intake.audit('alice'),{code:'likeness_owner_invalid'});
});

test('one owner cycling or hoarding submissions cannot deny another owner',async()=>{
  const {intake}=make();
  for(let i=0;i<80;i++) {const r=await intake.submit('fixture-mallory',makeLikenessFixture(),consent());intake.delete('fixture-mallory',r.id);}
  for(let i=0;i<4;i++)await intake.submit('fixture-mallory',makeLikenessFixture(),consent());
  await assert.rejects(intake.submit('fixture-mallory',makeLikenessFixture(),consent()),{code:'likeness_owner_quota'});
  assert.equal((await intake.submit('fixture-bob',makeLikenessFixture(),consent())).state,'quarantined');
});

test('live records stay globally bounded across many owners and deleted ids stay unavailable',async()=>{
  const {intake}=make();let first;
  for(let o=0;o<16;o++)for(let i=0;i<4;i++) {const r=await intake.submit(`fixture-owner-${o}`,makeLikenessFixture(),consent());first??=r.id;}
  await assert.rejects(intake.submit('fixture-late',makeLikenessFixture(),consent()),{code:'likeness_capacity'});
  intake.delete('fixture-owner-0',first);
  assert.throws(()=>intake.read('fixture-owner-0',first),{code:'likeness_unavailable'});
  assert.equal((await intake.submit('fixture-late',makeLikenessFixture(),consent())).state,'quarantined');
});

test('owner audit records lifecycle actors without content, digests, signatures or consent details',async()=>{
  let time=1000;
  const h=createLikenessQuarantine({...options,now:()=>time});
  const id=await approved(h);
  const revision=h.intake.publish('fixture-alice',id);
  h.intake.withdrawDisplay('fixture-alice',id);
  h.intake.delete('fixture-alice',id);
  const rejected=await h.intake.submit('fixture-alice',makeLikenessFixture(),consent());
  h.reviewer.reject('fixture-alice',rejected.id);
  await assert.rejects(h.intake.submit('fixture-alice',Buffer.alloc(40),consent()),/GLB/);
  const expiring=await h.intake.submit('fixture-alice',makeLikenessFixture(),consent());
  time+=3600000;
  h.intake.list('fixture-alice');
  const audit=h.intake.audit('fixture-alice');
  assert.deepEqual(audit.map(e=>[e.action,e.actor,e.id]),[
    ['submitted','owner',id],['quarantined','system',id],['approved','reviewer',id],['published','owner',id],
    ['display_withdrawn','owner',id],['deleted','owner',id],
    ['submitted','owner',rejected.id],['quarantined','system',rejected.id],['rejected','reviewer',rejected.id],
    ['invalid_asset','owner',null],
    ['submitted','owner',expiring.id],['quarantined','system',expiring.id],['expired','system',expiring.id],
  ]);
  assert.ok(audit.every(e=>Object.keys(e).sort().join()==='action,actor,at,id'&&Number.isFinite(e.at)));
  const text=JSON.stringify(audit);
  for(const forbidden of [revision.sha256,revision.signature,LIKENESS_CONSENT_POLICY,'glTF','selfLikeness'])assert.equal(text.includes(forbidden),false);
  audit[0].action='forged';
  assert.equal(h.intake.audit('fixture-alice')[0].action,'submitted');
});

test('owner audit is bounded per owner and keeps the newest deletion receipt',async()=>{
  const {intake}=make();
  for(let i=0;i<20;i++) {const r=await intake.submit('fixture-alice',makeLikenessFixture(),consent());intake.delete('fixture-alice',r.id);}
  const audit=intake.audit('fixture-alice');
  assert.equal(audit.length,32);
  assert.equal(audit.at(-1).action,'deleted');
});

test('revoked owner recovers through a fresh consented submission while the revoked revision stays dead',async()=>{
  const h=make(),id=await approved(h);
  const old=h.intake.publish('fixture-alice',id);
  h.intake.revoke('fixture-alice',id);
  const next=await approved(h);
  assert.notEqual(next,id);
  const fresh=h.intake.publish('fixture-alice',next);
  assert.equal(h.intake.resolve('fixture-alice',fresh).kind,'fixture');
  assert.equal(h.intake.resolve('fixture-alice',old).kind,'fallback');
  assert.deepEqual(h.intake.list('fixture-alice').map(r=>r.id),[next]);
});
