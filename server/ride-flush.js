// Transport-side ride banking. The world keeps a rider's accepted bicycle
// metres until drained; this holds every drained ride until the cycling store
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
  const merge=rides=>{
    for(const ride of rides) {
      if(!(ride?.meters>0))continue;
      const entry=pending.get(ride.userId);
      if(entry){entry.meters=round(entry.meters+ride.meters);entry.name=ride.name;}
      else pending.set(ride.userId,{userId:ride.userId,name:ride.name,meters:round(ride.meters)});
    }
  };
  const drain=()=>{const current=world();if(current)merge(current.drainRides());};
  async function run() {
    const batch=[...pending.values()];pending.clear();
    const failed=[];let error=null,dropped=0;
    for(const ride of batch) {
      try {if(await store.add(ride.userId,ride.meters,ride.name)===null)dropped++;}
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
  return {merge,drain,send,flush,settle,pending:()=>[...pending.values()].map(ride=>({...ride})),get inFlight(){return inFlight;}};
}
