import { generateKeyPairSync, randomUUID, sign, verify } from 'node:crypto';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { inspectLikenessFixture, likenessDigest } from './character-likeness-validation.js';

const failure=code=>{throw Object.assign(new Error(code),{code});};
const validOwner=id=>typeof id==='string'&&/^fixture-[a-z0-9-]{1,64}$/.test(id);
const fallback=()=>({kind:'fallback',appearanceId:'sable-human'});
const production=env=>env.NODE_ENV==='production'||env.VERCEL_ENV==='production'||env.CONTEXT==='production';

// No route or app factory imports this module. Callers of the trusted harness
// factory retain reviewer separately; owner-facing operations cannot approve.
export function createLikenessQuarantine({enabled=false,environment=process.env,now=Date.now}={}) {
  if(enabled&&(production(process.env)||production(environment)))failure('likeness_production_forbidden');
  if(enabled&& !['test','development'].includes(environment.NODE_ENV))failure('likeness_environment_forbidden');
  const records=new Map();
  const keys=enabled?generateKeyPairSync('ed25519'):null;
  const gate=()=>{if(enabled!==true)failure('likeness_disabled');};
  const erase=(record,state)=>{clearTimeout(record.timer);record.timer=null;record.state=state;record.generation++;record.bytes=null;record.revision=null;};
  const sweep=()=>{for(const record of records.values())if(record.bytes&&now()>=record.expiresAt)erase(record,'expired');};
  const get=(owner,id)=>{
    gate();sweep();const record=records.get(id);
    if(!validOwner(owner)||!record||record.owner!==owner||['deleted','revoked','expired'].includes(record.state))failure('likeness_unavailable');
    return record;
  };
  const summary=r=>({id:r.id,state:r.state,expiresAt:r.expiresAt});
  const payload=r=>JSON.stringify({revision:r.id,fixture:'synthetic-human-v1',sha256:r.digest,policy:'fixture-v1'});
  const intake=Object.freeze({
    async submit(owner,bytes) {
      gate();sweep();if(!validOwner(owner))failure('likeness_owner_invalid');
      if(records.size>=64)failure('likeness_capacity');
      if(!Buffer.isBuffer(bytes)||bytes.length>65536)failure('fixture size');
      const copy=Buffer.from(bytes);
      // Validate synchronously before retaining bytes or allocating a record.
      inspectLikenessFixture(copy);
      const r={id:randomUUID(),owner,bytes:copy,digest:likenessDigest(copy),state:'validating',generation:0,expiresAt:now()+3600000,revision:null};
      records.set(r.id,r);const generation=r.generation;
      r.timer=setTimeout(()=>erase(r,'expired'),3600000);r.timer.unref?.();
      await nextTurn();
      // A delete/revoke in this turn must defeat the pending completion.
      get(owner,r.id);if(r.generation!==generation||r.state!=='validating')failure('likeness_unavailable');
      r.state='quarantined';return summary(r);
    },
    list(owner) {gate();sweep();if(!validOwner(owner))failure('likeness_owner_invalid');return [...records.values()].filter(r=>r.owner===owner&&!['deleted','revoked','expired'].includes(r.state)).map(summary);},
    read(owner,id) {return summary(get(owner,id));},
    delete(owner,id) {erase(get(owner,id),'deleted');},
    revoke(owner,id) {erase(get(owner,id),'revoked');},
    publish(owner,id) {
      const r=get(owner,id);if(r.state==='published')return structuredClone(r.revision);
      if(r.state!=='approved')failure('likeness_not_approved');
      inspectLikenessFixture(r.bytes);
      r.revision={...JSON.parse(payload(r)),signature:sign(null,Buffer.from(payload(r)),keys.privateKey).toString('base64')};
      r.state='published';return structuredClone(r.revision);
    },
    resolve(owner,revision) {
      try {
        const r=get(owner,revision?.revision);
        if(r.state!=='published'||!r.bytes||!revision||Object.keys(revision).sort().join(',')!=='fixture,policy,revision,sha256,signature')return fallback();
        const {signature,...body}=revision;
        const canonical=JSON.parse(payload(r));
        if(Object.keys(canonical).some(key=>body[key]!==canonical[key])||typeof signature!=='string'||!verify(null,Buffer.from(payload(r)),keys.publicKey,Buffer.from(signature,'base64')))return fallback();
        if(likenessDigest(r.bytes)!==r.digest)return fallback();
        return {kind:'fixture',bytes:Buffer.from(r.bytes),revision:structuredClone(r.revision)};
      } catch {return fallback();}
    },
  });
  const reviewer=Object.freeze({
    approve(owner,id) {const r=get(owner,id);if(r.state!=='quarantined')failure('likeness_not_quarantined');r.state='approved';},
    reject(owner,id) {erase(get(owner,id),'revoked');},
  });
  return Object.freeze({intake,reviewer});
}
