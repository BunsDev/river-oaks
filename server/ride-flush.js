// Transport-side leaderboard banking. The world keeps each account's accepted
// totals per board ({userId, name, board, amount}: metres ridden, walked or
// driven, seconds played) until drained; this holds every drained ride until the cycling store
// has accepted it, so a store outage delays metres rather than losing them.
// A flush drains the world (unless the caller merges by hand), then adds each
// pending ride: success removes it, a thrown error keeps it for the next
// flush, and a null result (the store's rider cap) drops it. Only one flush
// runs at a time; a call made while one is running merges and returns it.
const round=value=>Math.round(value*1000)/1000;

export function createRideFlush({world,store,warn=()=>{}}) {
  if(typeof world!=='function' || typeof store?.add!=='function')throw new Error('Invalid ride flush');
  const pending=new Map();
  let inFlight=null;
  const keyOf=ride=>`${ride.board}\u0000${ride.userId}`;
  const merge=rides=>{
    for(const ride of rides) {
      if(!(ride?.amount>0))continue;
      const board=ride.board??'cycling',entry=pending.get(keyOf({...ride,board}));
      if(entry){entry.amount=round(entry.amount+ride.amount);entry.name=ride.name;}
      else pending.set(keyOf({...ride,board}),{userId:ride.userId,name:ride.name,board,amount:round(ride.amount)});
    }
  };
  const drain=()=>{const current=world();if(current)merge(current.drainRides());};
  async function run() {
    const batch=[...pending.values()];pending.clear();
    const failed=[];let error=null,dropped=0;
    for(const ride of batch) {
      try {if(await store.add(ride.userId,ride.amount,ride.name,ride.board)===null)dropped++;}
      catch(caught){failed.push(ride);error=caught;}
    }
    merge(failed);
    if(failed.length)warn({event:'cycling_flush_failed',riders:failed.length,error:error instanceof Error?error.message:String(error)});
    if(dropped)warn({event:'cycling_riders_dropped',riders:dropped});
  }
  // Adds only: what is pending now. A running flush is shared, not queued.
  const send=()=>{
    if(inFlight)return inFlight;
    if(!pending.size)return Promise.resolve();
    inFlight=run().finally(()=>{inFlight=null;});
    return inFlight;
  };
  const flush=()=>{drain();return send();};
  // Shutdown: let the running flush finish, then send whatever it left behind.
  const settle=async()=>{await inFlight;await send();};
  // Account erasure: the account's totals on every board leave the queue. A running flush may still
  // bank them, so this waits for it and drops whatever it handed back.
  const drop=userId=>{for(const [key,ride] of pending)if(ride.userId===userId)pending.delete(key);};
  const forget=async userId=>{drop(userId);await inFlight;drop(userId);};
  return {merge,drain,send,flush,settle,forget,pending:()=>[...pending.values()].map(ride=>({...ride})),get inFlight(){return inFlight;}};
}
