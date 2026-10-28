import {createCharacterMetrics} from './character-metrics.js';
import { createRedisCharacterStore } from './character-store.js';
import { createRedisOfficeDesk } from './office-desk.js';
import { createClientAddress, rateLimitKey } from './client-address.js';
import { createRateLimiter } from './rate-limit.js';
import { createRedisRoom } from './redis-room.js';
import { createRedisLandmarks } from './landmarks.js';
import { createWorldLandmarks } from './world-landmarks.js';
import { createDistributedServer } from './distributed-app.js';
import { APPROVED_SPACES_OFF, createRedisWorldCatalog } from './world-catalog.js';
import { roomPrefixFor, accountPrefixFor, populationKeyFor } from './world-keys.js';
import { DEFAULT_WORLD_ID, validateWorldId, worldProtocolVersion } from '../preview/src/world-contract.js';
import { createWorldRouter } from './world-router.js';
import { createRedisSocial } from './social.js';
import { createRedisBlocks } from './blocks.js';
import { isJevicaAdmin } from './admin.js';
import { createRedisGroups } from './groups.js';
import { createRedisProfiles } from './profiles.js';
import { createRedisEvents } from './events.js';
import { createWorkplace, createRedisWorkplaceStore } from './workplace.js';
import { createRedisDebugReports } from './debug-reports.js';
import { createRedisAvatarPreferences, legacyDefaultAppearance } from './avatar-preferences.js';
import { createRedisDesignLibrary } from './design-library.js';
import { createRedisPresence } from './presence.js';
import { createRedisCyclingMiles } from './cycling-miles.js';
import { eraseEach } from './account-erasure.js';

/** Routes a single HTTP origin to persistent world rooms with shared auth. */
export function createWorldGateway({redis,namespace,worldData,auth,security,waitlist,waitlistAdmins=[],origin,configuredWorldId=DEFAULT_WORLD_ID,
  characterStudioEnabled=true,characterMetrics=null,characterMetricsEnabled=false,moderators=[],trustedProxyIPs=[],address,isAdmin,handleRequest,approvedSpacesEnabled=false,workplaceEnabled=false,workplaceSweep=false,workplaceCronSecret=null,assetGateSecret=null,voice=null,voiceCronSecret=null,screeningHosts=[],officeLayout,campusOperators=[],districtEpoch=0,connectionLifetime,rotateNoticeMs,contentFilter}={}) {
  if (!waitlist) throw new Error('Waitlist is required');
  validateWorldId(configuredWorldId);
  // Default off: approvedSpacesEnabled (RIVER_OAKS_APPROVED_SPACES=1) lets regions place approved furnished spaces (#420).
  const prefix=`{${namespace}}`,catalog=createRedisWorldCatalog({redis,prefix,...(approvedSpacesEnabled?{}:{approvedSpaces:APPROVED_SPACES_OFF})}),social=createRedisSocial({redis,prefix}),blocks=createRedisBlocks({redis,prefix}),groups=createRedisGroups({redis,prefix}),profiles=createRedisProfiles({redis,prefix}),events=createRedisEvents({redis,prefix}),debugReports=createRedisDebugReports({redis,prefix}),presence=createRedisPresence({redis,prefix});
  // Default off: RIVER_OAKS_WORKPLACE=1 enables the fixture-only workplace (#214).
  const workplace=workplaceEnabled?createWorkplace({store:createRedisWorkplaceStore({redis,prefix}),
    allowed:async id=>!(await security.isBanned(id))&&await waitlist.isApproved(id),
    // A long-lived gateway sweeps for tasks orphaned by another instance; on Vercel the
    // per-minute cron drain (/api/workplace-sweep) and owner reads advance them.
    sweepMs:workplaceSweep?5000:0}):null;
  const officeDesk=createRedisOfficeDesk({redis,prefix});
  const designLibrary=createRedisDesignLibrary({redis,prefix:accountPrefixFor(namespace)});
  // Lifetime cycling metres are one account total across every world.
  const cyclingMiles=createRedisCyclingMiles({redis,prefix:accountPrefixFor(namespace)});
  const characters=createRedisCharacterStore({redis,prefix:accountPrefixFor(namespace)});
  const storedAppearance=createRedisAvatarPreferences({redis,prefix});
  const avatarPreferences={...storedAppearance,async initialize(userId,local) {
    const existing=await storedAppearance.get(userId);
    if(existing)return existing;
    const legacy=await legacyDefaultAppearance(redis,`${roomPrefixFor(namespace,DEFAULT_WORLD_ID)}:state`,userId);
    return storedAppearance.initialize(userId,legacy??local);
  }};
  const worlds=new Map(),pending=new Map(),landmarkStores=new Map();
  const landmarkStoreFor=id=>{
    if(!landmarkStores.has(id))landmarkStores.set(id,createRedisLandmarks({redis,prefix:accountPrefixFor(namespace,id)}));
    return landmarkStores.get(id);
  };
  const sharedAuth={handle:(...args)=>auth.handle(...args),authenticate:(...args)=>auth.authenticate(...args),
    isSessionActive:(...args)=>auth.isSessionActive(...args),close:()=>{}};
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
        avatarPreferences,characters,voice,cyclingMiles,screeningHosts,campusOperators,...(officeLayout?{officeLayout}:{}),districtEpoch,
        ...(isAdmin?{isAdmin}:{}),
        authorize:async identity=>await auth.isSessionActive(identity.userId,identity.sessionId)
          && await waitlist.isApproved(identity.userId) && !(await security.isBanned(identity.userId))});
      const landmarks=createWorldLandmarks({catalog,storeFor:landmarkStoreFor,worldId:id,worldTitle:meta?.title??data.title});
      const game=createDistributedServer({characterMetrics:metrics,characterStudioEnabled,assetGateSecret,auth:sharedAuth,room,protocolVersion:worldProtocolVersion(data),worldTitle:meta?.title??data.title,security,waitlist,waitlistAdmins,debugReports,landmarks,social,blocks,onBlocked:separateEverywhere,groups,profiles,characters,events,workplace,officeDesk,workplaceCronSecret,presence,designLibrary,cyclingMiles,worldDirectory,origin,moderators,trustedProxyIPs,voice,voiceCronSecret,
        ...(address?{address}:{}),...(isAdmin?{isAdmin}:{}),...(contentFilter!==undefined?{contentFilter}:{}),...(connectionLifetime?{connectionLifetime}:{}),...(rotateNoticeMs?{rotateNoticeMs}:{}),...(id===configuredWorldId?{worldCatalog:catalog}:{}),
        ...(id===configuredWorldId?{onApplyRegion:async (regionId,expectedDraftVersion,actorId)=>{
          const target=await worldFor(regionId);
          if(!target || target.meta?.template!=='region-v1')return {ok:false,error:'missing'};
          return target.room.request({type:'revise',actorId,expectedDraftVersion});
        }}:{}),
        // One world per account (see distributed-app): remove them from the previous world, wherever it runs.
        onMove:async(userId,fromWorldId)=>{const previous=await worldFor(fromWorldId).catch(()=>null);await previous?.game.disconnectUser(userId);},
        onBan:async userId=>{
          await Promise.all([...worlds.values()].filter(world=>world.id!==id).map(world=>world.game.disconnectUser(userId)));
        }});
      const entry={id,meta,room,game};worlds.set(id,entry);
      return entry;
    })().finally(()=>pending.delete(id));
    pending.set(id,load);
    return load;
  }
  // The same per-address budget the worlds apply, run once at the front door.
  const routerAddress=address??createClientAddress(trustedProxyIPs),localGate=createRateLimiter(1000,60_000);
  const admit=req=>{const ip=rateLimitKey(routerAddress(req));return localGate(ip)&&security.allow('access',ip,1000,60_000);};
  const router=createWorldRouter({worldFor,configuredWorldId,handleRequest,admit});
  const metrics=characterMetrics??createCharacterMetrics({enabled:characterMetricsEnabled});
  // Account erasure (#292): what this gateway keeps for an account, one named step per
  // store. Every world in the catalog is reached, loaded here or not.
  const worldIds=async()=>[...new Set([configuredWorldId,...(await catalog.list()).map(entry=>entry.id)])];
  // Account erasure (#292). Only a world loaded here or with a durable checkpoint can
  // hold the account; one that cannot load fails the step, so the run is retried, and
  // every other world still forgets the account meanwhile.
  const storedWorld=async id=>await redis.exists(`${roomPrefixFor(namespace,id)}:state`)===1;
  // Player blocking (#292): a block reaches sockets in every world loaded here, and other
  // gateways' sockets within five seconds. A greeting or game invitation needs both
  // residents in the world where the block is made, which is loaded here. Office and home
  // invitations come from Jevica and last, so a block between her and a resident reaches
  // every world that is loaded here or has a checkpoint. A world that fails is logged and
  // skipped; the block itself stands, and new invitations are refused either way.
  const admin=isAdmin??isJevicaAdmin;
  // Worlds are reached together, so the request waits for the slowest one, not the sum.
  async function separateEverywhere(a,b,blocked){
    const everywhere=blocked&&admin(a)!==admin(b);
    // Between two residents: the worlds loaded here, and for a block the default world, which
    // serves the campus, where guest access outlasts either of them being there.
    await Promise.all((everywhere?await worldIds():[...new Set([...(blocked?[DEFAULT_WORLD_ID]:[]),...worlds.keys()])]).map(async id=>{
      try {
        if(!worlds.has(id)&&!await storedWorld(id))return;
        const world=await worldFor(id);if(!world)throw new Error('World unavailable');
        await world.game.separateAccounts(a,b,blocked);
      } catch {console.warn(JSON.stringify({event:'block_separation_incomplete',worldId:id}));}
    }));
  }
  const accountSteps={
    worlds:async userId=>eraseEach(await worldIds(),async id=>{
      if(!worlds.has(id)&&!await storedWorld(id))return;
      const world=await worldFor(id);if(!world)throw new Error('World unavailable');
      await world.game.forgetAccount(userId);
    }),
    landmarks:async userId=>eraseEach(await worldIds(),id=>landmarkStoreFor(id).eraseUser(userId)),
    social:userId=>social.eraseUser(userId),blocks:userId=>blocks.eraseUser(userId),groups:userId=>groups.eraseUser(userId),profiles:userId=>profiles.eraseUser(userId),
    events:userId=>events.eraseUser(userId),presence:userId=>presence.eraseUser(userId),debugReports:userId=>debugReports.eraseUser(userId),
    officeDesk:userId=>officeDesk.eraseUser(userId),designLibrary:userId=>designLibrary.eraseUser(userId),
    workplace:async userId=>{if(workplace&&(await workplace.erase({userId}))?.ok===false)throw new Error('Workplace erasure busy');},
  };
  // A world can still bank ride metres or store a look while it forgets the account.
  const accountAfterSteps={cyclingMiles:userId=>cyclingMiles.eraseUser(userId),avatarPreferences:userId=>storedAppearance.eraseUser(userId)};
  return {server:router.server,catalog,worldFor,accountSteps,accountAfterSteps,separateAccounts:separateEverywhere,async disconnectUser(userId,sessionId) {
    const results=await Promise.all([...worlds.values()].map(({game})=>game.disconnectUser(userId,sessionId)));
    if(results.some(result=>result?.ok!==true))throw new Error('Account disconnect incomplete');
  },async close() {
    try{
    closed=true;workplace?.close();
    await Promise.allSettled([...pending.values()]);
    for(const {game,room} of worlds.values()){await game.close();await room.close();}
    await router.close();
    }finally{if(!characterMetrics)metrics.close();}
  }};
}
