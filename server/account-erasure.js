// One account's erasure across everything the server keeps for it (#292). The
// account is shut out first: the character tombstone refuses it a new session,
// then its sessions end and its sockets close, so nothing writes new records
// while the rest are erased. Every step is idempotent. A run with any failed
// step reports failure and is retried whole, by WorkOS (the webhook answers
// 503) or by the caller; it is never reported as done early. `steps` run
// together; `after` runs once they settle, for stores a world can still write
// to while it forgets the account (banked ride metres, the stored look).
// docs/privacy-data-inventory.md lists what each step erases and what is kept.
const validId=value=>typeof value==='string'&&value.length>0&&value.length<=200&&!/[\u0000-\u001f\u007f]/.test(value);
const stage=group=>Object.entries(group??{}).filter(([,step])=>typeof step==='function');

export function createAccountErasure({tombstone,revoke,steps,after}) {
  if(typeof tombstone!=='function'||typeof revoke!=='function'||!steps||typeof steps!=='object'||(after!==undefined&&(!after||typeof after!=='object')))
    throw new TypeError('Invalid account erasure');
  const stages=[stage(steps),stage(after)];
  const running=new Map();
  async function run(userId) {
    await tombstone(userId);
    await revoke(userId);
    const failed=[];
    for(const entries of stages) {
      const results=await Promise.allSettled(entries.map(([,step])=>Promise.resolve().then(()=>step(userId))));
      failed.push(...entries.filter((_,index)=>results[index].status==='rejected').map(([name])=>name));
    }
    if(failed.length){
      // Step names only: never the account or a store's error text.
      console.warn(JSON.stringify({event:'account_erasure_incomplete',steps:failed}));
      throw new Error('Account erasure incomplete');
    }
  }
  // Concurrent requests for one account, such as overlapping webhook deliveries, share a run.
  return function eraseAccount(userId) {
    if(!validId(userId))return Promise.reject(new TypeError('Invalid account'));
    if(!running.has(userId))running.set(userId,run(userId).finally(()=>running.delete(userId)));
    return running.get(userId);
  };
}
