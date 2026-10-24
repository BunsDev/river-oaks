import { generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { inspectLikenessFixture, likenessDigest } from './character-likeness-validation.js';

export const LIKENESS_CONSENT_POLICY='fixture-consent-v1';
const LIVE_LIMIT=64,OWNER_LIMIT=4,AUDIT_LIMIT=32,AUDIT_OWNERS=128;
const failure=code=>{throw Object.assign(new Error(code),{code});};
const validOwner=id=>typeof id==='string'&&/^fixture-[a-z0-9-]{1,64}$/.test(id);
const fallback=()=>({kind:'fallback',appearanceId:'sable-human'});
const production=env=>env.NODE_ENV==='production'||env.VERCEL_ENV==='production'||env.CONTEXT==='production';
// Fixture attestation shape only. It proves ordering and binding; it never
// verifies age, identity or legal consent, and carries no personal fields.
const validConsent=c=>!!c&&typeof c==='object'&&!Array.isArray(c)&&Object.keys(c).sort().join()==='adult,display,policy,processing,selfLikeness'&&c.policy===LIKENESS_CONSENT_POLICY&&c.adult===true&&c.selfLikeness===true&&c.processing===true&&typeof c.display==='boolean';

// No route or app factory imports this module. Callers of the trusted harness
// factory retain reviewer separately; owner-facing operations cannot approve.
export function createLikenessQuarantine({enabled=false,environment=process.env,now=Date.now}={}) {
  if(enabled&&(production(process.env)||production(environment)))failure('likeness_production_forbidden');
  if(enabled&& !['test','development'].includes(environment.NODE_ENV))failure('likeness_environment_forbidden');
  // Only live records are retained; terminal records leave immediately, so ids
  // become indistinguishable from unknown ones and cannot exhaust capacity.
  const records=new Map(),audits=new Map();
  const keys=enabled?generateKeyPairSync('ed25519'):null;
  const gate=()=>{if(enabled!==true)failure('likeness_disabled');};
  // Owner-private, bounded, process-local receipts: actions only, never content.
  const log=(owner,action,actor,id=null)=>{
    const entries=audits.get(owner)??[];audits.delete(owner);audits.set(owner,entries);
    entries.push({at:now(),action,actor,id});if(entries.length>AUDIT_LIMIT)entries.shift();
    if(audits.size>AUDIT_OWNERS)audits.delete(audits.keys().next().value);
  };
  const erase=(record,state,actor)=>{clearTimeout(record.timer);record.timer=null;record.state=state;record.generation++;record.bytes=null;record.revision=null;record.consent=null;record.approval=null;records.delete(record.id);log(record.owner,state,actor,record.id);};
  const sweep=()=>{for(const record of [...records.values()])if(now()>=record.expiresAt)erase(record,'expired','system');};
  const get=(owner,id)=>{
    gate();sweep();const record=records.get(id);
    if(!validOwner(owner)||!record||record.owner!==owner)failure('likeness_unavailable');
    return record;
  };
  const summary=r=>({id:r.id,state:r.state,display:r.consent.display,expiresAt:r.expiresAt});
  const payload=r=>JSON.stringify({revision:r.id,fixture:'synthetic-human-v1',sha256:r.digest,policy:'fixture-v1',grant:r.grant});
  // Any consent change invalidates moderation and the signed revision; the new
  // grant generation is signed, so earlier revisions can never resolve again.
  const setDisplay=(owner,id,display,action)=>{
    const r=get(owner,id);if(r.consent.display===display)return summary(r);
    r.consent.display=display;r.grant++;r.approval=null;r.revision=null;
    if(['approved','published'].includes(r.state))r.state='quarantined';
    log(owner,action,'owner',id);return summary(r);
  };
  const intake=Object.freeze({
    async submit(owner,bytes,consent) {
      gate();sweep();if(!validOwner(owner))failure('likeness_owner_invalid');
      if(!validConsent(consent)){log(owner,'consent_refused','owner');failure('likeness_consent_required');}
      if(records.size>=LIVE_LIMIT)failure('likeness_capacity');
      if([...records.values()].filter(r=>r.owner===owner).length>=OWNER_LIMIT)failure('likeness_owner_quota');
      if(!Buffer.isBuffer(bytes)||bytes.length>65536){log(owner,'invalid_asset','owner');failure('fixture size');}
      const copy=Buffer.from(bytes);
      // Validate synchronously before retaining bytes or allocating a record.
      try{inspectLikenessFixture(copy);}catch(error){log(owner,'invalid_asset','owner');throw error;}
      const r={id:randomUUID(),owner,bytes:copy,digest:likenessDigest(copy),consent:{...consent},grant:0,approval:null,state:'validating',generation:0,expiresAt:now()+3600000,revision:null};
      records.set(r.id,r);const generation=r.generation;log(owner,'submitted','owner',r.id);
      r.timer=setTimeout(()=>erase(r,'expired','system'),3600000);r.timer.unref?.();
      await nextTurn();
      // A delete/revoke in this turn must defeat the pending completion.
      get(owner,r.id);if(r.generation!==generation||r.state!=='validating')failure('likeness_unavailable');
      r.state='quarantined';log(owner,'quarantined','system',r.id);return summary(r);
    },
    list(owner) {gate();sweep();if(!validOwner(owner))failure('likeness_owner_invalid');return [...records.values()].filter(r=>r.owner===owner).map(summary);},
    read(owner,id) {return summary(get(owner,id));},
    audit(owner) {gate();if(!validOwner(owner))failure('likeness_owner_invalid');sweep();return structuredClone(audits.get(owner)??[]);},
    delete(owner,id) {erase(get(owner,id),'deleted','owner');},
    revoke(owner,id) {erase(get(owner,id),'revoked','owner');},
    withdrawDisplay(owner,id) {return setDisplay(owner,id,false,'display_withdrawn');},
    grantDisplay(owner,id) {return setDisplay(owner,id,true,'display_granted');},
    publish(owner,id) {
      const r=get(owner,id);if(r.state==='published')return structuredClone(r.revision);
      if(r.consent.display!==true)failure('likeness_display_consent_required');
      if(r.state!=='approved'||r.approval?.digest!==r.digest||r.approval.grant!==r.grant)failure('likeness_not_approved');
      inspectLikenessFixture(r.bytes);
      r.revision={...JSON.parse(payload(r)),signature:sign(null,Buffer.from(payload(r)),keys.privateKey).toString('base64')};
      r.state='published';log(owner,'published','owner',id);return structuredClone(r.revision);
    },
    resolve(owner,revision) {
      try {
        const r=get(owner,revision?.revision);
        if(r.state!=='published'||!r.bytes||r.consent.display!==true||!revision||Object.keys(revision).sort().join(',')!=='fixture,grant,policy,revision,sha256,signature')return fallback();
        const {signature,...body}=revision;
        const canonical=JSON.parse(payload(r));
        if(Object.keys(canonical).some(key=>body[key]!==canonical[key])||typeof signature!=='string'||!verify(null,Buffer.from(payload(r)),keys.publicKey,Buffer.from(signature,'base64')))return fallback();
        if(likenessDigest(r.bytes)!==r.digest)return fallback();
        return {kind:'fixture',bytes:Buffer.from(r.bytes),revision:structuredClone(r.revision)};
      } catch {return fallback();}
    },
  });
  const reviewer=Object.freeze({
    approve(owner,id) {const r=get(owner,id);if(r.state!=='quarantined')failure('likeness_not_quarantined');r.state='approved';r.approval={digest:r.digest,grant:r.grant};log(owner,'approved','reviewer',id);},
    reject(owner,id) {erase(get(owner,id),'rejected','reviewer');},
  });
  return Object.freeze({intake,reviewer});
}
