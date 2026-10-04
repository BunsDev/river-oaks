import { createRedisRoom } from './redis-room.js';
import { createRedisLandmarks } from './landmarks.js';
import { createDistributedServer } from './distributed-app.js';
import { createRedisWorldCatalog } from './world-catalog.js';
import { roomPrefixFor, accountPrefixFor, populationKeyFor } from './world-keys.js';
import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';
import { createWorldRouter } from './world-router.js';
import { createRedisSocial } from './social.js';
import { createRedisProfiles } from './profiles.js';

/** Routes a single HTTP origin to persistent world rooms with shared auth. */
export function createWorldGateway({redis,namespace,worldData,auth,security,waitlist,waitlistAdmins=[],origin,configuredWorldId=DEFAULT_WORLD_ID,
  moderators=[],trustedProxyIPs=[],address,isAdmin}={}) {
  if (!waitlist) throw new Error('Waitlist is required');
  validateWorldId(configuredWorldId);
  const prefix=`{${namespace}}`,catalog=createRedisWorldCatalog({redis,prefix}),social=createRedisSocial({redis,prefix}),profiles=createRedisProfiles({redis,prefix});
  const worlds=new Map(),pending=new Map();
  const sharedAuth={handle:(...args)=>auth.handle(...args),authenticate:(...args)=>auth.authenticate(...args),close:()=>{}};
  const worldDirectory=async()=>{
    const entries=await catalog.list();
    const counts=await Promise.all(entries.map(entry=>redis.get(populationKeyFor(namespace,entry.id))));
    return entries.map((entry,index)=>{
      const visitors=counts[index]===null?0:Number(counts[index]);
      if(!Number.isSafeInteger(visitors)||visitors<0||visitors>4096)throw new Error('Invalid world population');
      return {...entry,visitors};
    });
  };
  let closed=false;
  async function worldFor(id) {
    if(closed)return null;
    if(worlds.has(id))return worlds.get(id);
    if(pending.has(id))return pending.get(id);
    const load=(async()=>{
      const meta=await catalog.get(id);
      if(!meta && id!==configuredWorldId)return null;
      const data=meta?.template==='region-v1'?await catalog.getRegion(id)
        :id===DEFAULT_WORLD_ID?worldData:{...worldData,title:meta?.title??worldData.title};
      const room=createRedisRoom({redis,prefix:roomPrefixFor(namespace,id),worldId:id,
        worldData:data,regionCatalog:meta?.template==='region-v1'?catalog:null,regionSha256:meta?.regionSha256,
        ...(isAdmin?{isAdmin}:{}),
        authorize:async identity=>await auth.isSessionActive(identity.userId,identity.sessionId)
          && await waitlist.isApproved(identity.userId) && !(await security.isBanned(identity.userId))});
      const landmarks=createRedisLandmarks({redis,prefix:accountPrefixFor(namespace,id)});
      const game=createDistributedServer({auth:sharedAuth,room,worldTitle:meta?.title??data.title,security,waitlist,waitlistAdmins,landmarks,social,profiles,worldDirectory,origin,moderators,trustedProxyIPs,
        ...(address?{address}:{}),...(isAdmin?{isAdmin}:{}),...(id===configuredWorldId?{worldCatalog:catalog}:{}),
        ...(id===configuredWorldId?{onApplyRegion:async (regionId,expectedDraftVersion,actorId)=>{
          const target=await worldFor(regionId);
          if(!target || target.meta?.template!=='region-v1')return {ok:false,error:'missing'};
          return target.room.request({type:'revise',actorId,expectedDraftVersion});
        }}:{}),
        onBan:async userId=>{
          await Promise.all([...worlds.values()].filter(world=>world.id!==id).map(world=>world.game.disconnectUser(userId)));
        }});
      const entry={id,meta,room,game};worlds.set(id,entry);
      return entry;
    })().finally(()=>pending.delete(id));
    pending.set(id,load);
    return load;
  }
  const router=createWorldRouter({worldFor,configuredWorldId});
  return {server:router.server,catalog,worldFor,async disconnectUser(userId,sessionId) {
    await Promise.all([...worlds.values()].map(({game})=>game.disconnectUser(userId,sessionId)));
  },async close() {
    closed=true;
    await Promise.allSettled([...pending.values()]);
    for(const {game,room} of worlds.values()){await game.close();await room.close();}
    await router.close();
  }};
}
