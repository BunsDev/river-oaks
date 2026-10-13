// The cycling leaderboard read, shared by the dev town and the hosted gateway:
// the top riders by lifetime metres, as miles to one decimal, and the caller's
// own rank. The top list is cached briefly per instance so a crowd opening the
// sheet costs one store read; the caller's row is always live. Names are the
// public roster names the store kept at flush time; user ids never leave.
const METERS_PER_MILE=1609.344;
const miles=meters=>Math.round(meters/METERS_PER_MILE*10)/10;

export function createCyclingLeaderboard({store,now=Date.now,limit=20,ttlMs=10000}={}) {
  let cached=null,cachedAt=-Infinity;
  const top=async()=>{
    const time=now();
    if(!cached || time-cachedAt>=ttlMs){cached=(await store.top(limit)).map((row,index)=>({rank:index+1,name:row.name,miles:miles(row.meters)}));cachedAt=time;}
    return cached;
  };
  return {
    async read(identity) {
      if(!store)return {status:503,value:{error:'The leaderboard is unavailable.'}};
      const [rows,mine]=await Promise.all([top(),store.rank(identity.userId)]);
      return {status:200,value:{top:rows,me:mine?{rank:mine.rank,miles:miles(mine.meters)}:null,limit}};
    },
  };
}
