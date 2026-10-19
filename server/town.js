import {createCharacterMetrics} from './character-metrics.js';
import { createWorkOSDeletionHandler } from './workos-deletion.js';
import { createMemoryCharacterStore } from './character-store.js';
import { createMemoryOfficeDesk } from './office-desk.js';
import { createChauffeurRoute, createLocalChauffeurSecurity, chauffeurDailyLimit } from './chauffeur.js';
import { resolve } from 'node:path';
import { loadDistrictData } from './district-data.js';
import { createAuth } from './auth.js';
import { magicOptions } from './magic-auth.js';
import { createDevAuth, devAuthAllowed } from './dev-auth.js';
import { createSharedWorld, migrateWorldCheckpoint } from './world.js';
import { parseScreeningHosts } from './screenings.js';
import { configuredOfficeLayout } from './offices.js';
import { configuredDistrictRevision } from '../preview/src/garden-campus-district.js';
import { parseCampusOperators } from './campus-leases.js';
import { createModeration } from './moderation.js';
import { createGameServer } from './app.js';
import { createFileWaitlist } from './waitlist.js';
import { createMemoryLandmarks } from './landmarks.js';
import { createWorldLandmarks } from './world-landmarks.js';
import { createMemoryWorldCatalog } from './world-catalog.js';
import { createWorldRouter } from './world-router.js';
import { createMemorySocial } from './social.js';
import { createMemoryGroups } from './groups.js';
import { createMemoryProfiles } from './profiles.js';
import { createMemoryEvents } from './events.js';
import { createWorkplace } from './workplace.js';
import { createMemoryDebugReports } from './debug-reports.js';
import { createMemoryCyclingMiles } from './cycling-miles.js';
import { createMemoryAvatarPreferences } from './avatar-preferences.js';
import { createMemoryPresence } from './presence.js';
import { isJevicaAdmin } from './admin.js';
import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';
import { configureVoice, createMemoryVoiceLeases } from './voice.js';

export function workosConfigured(env) {
  return Boolean(env.WORKOS_API_KEY && env.WORKOS_CLIENT_ID && env.WORKOS_COOKIE_PASSWORD?.length >= 32);
}

// Normal development and production both use WorkOS. Explicit fixture mode
// retains isolated loopback identities for browser acceptance only.
export function chooseAuth({ env, origin, devAuth = 'auto' }) {
  if (devAuth === 'workos' || env.RIVER_OAKS_DEV_AUTH === 'workos') return 'workos';
  if (devAuth === 'local' && devAuthAllowed({ origin, env })) return 'local';
  return 'workos';
}

export function validateOrigin(origin) {
  const url = new URL(origin);
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback))) {
    throw new Error('PUBLIC_ORIGIN must be an HTTPS origin, or localhost for development.');
  }
  return origin;
}

export async function createTown({ env = process.env, origin, devAuth = 'auto', staticRoot = resolve('dist/preview') } = {}) {
  validateOrigin(origin);
  const worldId=validateWorldId(env.WORLD_ID??DEFAULT_WORLD_ID);
  // The district revision; unset or unknown keeps the garage (the default and the rollback, #507).
  const districtRevision=configuredDistrictRevision(env.RIVER_OAKS_DISTRICT_REVISION,{onInvalid:()=>console.warn(JSON.stringify({event:'district_revision_ignored'}))});
  const data = await loadDistrictData({ districtRevision });
  const moderation = await createModeration(resolve(env.MODERATION_FILE ?? '.runtime/moderation.json'));
  const mode = chooseAuth({ env, origin, devAuth });
  const admins = (env.WAITLIST_ADMIN_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
  const waitlist = await createFileWaitlist(resolve(env.WAITLIST_FILE ?? '.runtime/waitlist.json'), {
    admins, autoApprove: mode === 'local' && env.RIVER_OAKS_ACCEPTANCE_FIXTURE === '1',
  });

  // Venue hosts are explicit grants; none configured means no one can control a screening.
  const screeningHosts=parseScreeningHosts(env.RIVER_OAKS_SCREENING_HOSTS,{onInvalid:()=>console.warn(JSON.stringify({event:'screening_host_grant_ignored'}))});
  // Jevica's office layout; unset or unknown keeps the legacy room (the default and the rollback).
  const officeLayout=configuredOfficeLayout(env.RIVER_OAKS_OFFICE_LAYOUT,{onInvalid:()=>console.warn(JSON.stringify({event:'office_layout_ignored'}))});
  // Garden campus lease operators are explicit account ids; none configured keeps leasing closed.
  const campusOperators=parseCampusOperators(env.RIVER_OAKS_CAMPUS_OPERATOR_IDS,{onInvalid:()=>console.warn(JSON.stringify({event:'campus_operator_ignored'}))});
  const officeDesk=createMemoryOfficeDesk();
  const games=new Map(),pending=new Map(),debugReports=createMemoryDebugReports(),catalog=createMemoryWorldCatalog(),social=createMemorySocial(),groups=createMemoryGroups(),profiles=createMemoryProfiles(),events=createMemoryEvents(),workplace=env.RIVER_OAKS_WORKPLACE==='1'?createWorkplace({allowed:async id=>!moderation.isBanned(id)&&await waitlist.isApproved(id)}):null,avatarPreferences=createMemoryAvatarPreferences(),characters=createMemoryCharacterStore(),cyclingMiles=createMemoryCyclingMiles(),presence=createMemoryPresence(),landmarkStores=new Map();
  const landmarkStoreFor=id=>{
    if(!landmarkStores.has(id))landmarkStores.set(id,createMemoryLandmarks());
    return landmarkStores.get(id);
  };
  const worldDirectory=async()=>(await catalog.list()).map(entry=>({...entry,visitors:games.get(entry.id)?.game.playerCount??0}));
  const localSecurity=createLocalChauffeurSecurity({isBanned:id=>moderation.isBanned(id)});
  // One voice service for every world of this town; rooms are named per world and interior.
  const voice=configureVoice({env,namespace:'river-oaks:local:v1',allow:(...args)=>localSecurity.allow(...args),leases:createMemoryVoiceLeases(),sweepMs:30_000});
  const onLogout = userId => {for(const {game} of games.values())game.disconnectUser(userId);};
  const auth = mode === 'local'
    ? createDevAuth({ origin, env, onLogout })
    : createAuth({ apiKey: env.WORKOS_API_KEY, clientId: env.WORKOS_CLIENT_ID, cookiePassword: env.WORKOS_COOKIE_PASSWORD, githubToken: env.GITHUB_TOKEN || null, returnPath: env.AUTH_RETURN_PATH, origin, onLogout, accountActive: async id => !(await characters.get(id)).deleted, magic: magicOptions(env, origin),
      usernameOf: userId => waitlist.usernameOf(userId) });
  const sharedAuth={handle:(...args)=>auth.handle(...args),authenticate:(...args)=>auth.authenticate(...args),
    ...(auth.isSessionActive?{isSessionActive:(...args)=>auth.isSessionActive(...args)}:{}),close:()=>{}};
  async function applyRegion(id,expectedDraftVersion,actorId) {
    if(!(mode==='local'?auth.isAdmin(actorId):isJevicaAdmin(actorId)))return {ok:false,error:'admin_only'};
    const entry=await worldFor(id);
    if(!entry || entry.meta?.template!=='region-v1')return {ok:false,error:'missing'};
    const candidate=await catalog.revisionCandidate(id,expectedDraftVersion);
    if(!candidate.ok)return {ok:false,error:candidate.reason};
    const options=mode==='local'?{isAdmin:auth.isAdmin,worldId:id,screeningHosts,officeLayout,campusOperators}:{worldId:id,screeningHosts,officeLayout,campusOperators};
    const migrated=migrateWorldCheckpoint({fromData:await catalog.getRegion(id),toData:candidate.worldData,
      checkpoint:entry.world.checkpoint(),...options});
    if(!migrated.ok)return migrated;
    const next=createSharedWorld(candidate.worldData,options);
    if(!next.restore(migrated.checkpoint).ok)return {ok:false,error:'incompatible_region'};
    const applied=await catalog.applyRevision(candidate);
    if(!applied.ok)return {ok:false,error:applied.reason};
    entry.game.replaceWorld(next,candidate.world.regionSha256);
    entry.world=next;entry.meta=candidate.world;
    return {ok:true,world:candidate.world,disconnectedPlayers:migrated.disconnectedPlayers,clearedWishes:migrated.clearedWishes};
  }
  let closed=false,closing=null;
  async function worldFor(id) {
    if(closed)return null;
    if(games.has(id))return games.get(id);
    if(pending.has(id))return pending.get(id);
    const load=(async()=>{
      const meta=await catalog.get(id);
      if(!meta && id!==worldId)return null;
      const worldData=meta?.template==='region-v1'?await catalog.getRegion(id)
        :id===DEFAULT_WORLD_ID?data:{...data,title:meta?.title??data.title};
      const world=createSharedWorld(worldData,mode==='local'?{isAdmin:auth.isAdmin,worldId:id,screeningHosts,officeLayout,campusOperators}:{worldId:id,screeningHosts,officeLayout,campusOperators});
      const game=createGameServer({characterMetrics,characterStudioEnabled:env.RIVER_OAKS_CHARACTER_STUDIO==='1',auth:sharedAuth,world,worldTitle:meta?.title??worldData.title,waitlist,waitlistAdmins:admins,debugReports,landmarks:createWorldLandmarks({catalog,storeFor:landmarkStoreFor,worldId:id,worldTitle:meta?.title??worldData.title}),social,groups,profiles,events,workplace,officeDesk,avatarPreferences,characters,cyclingMiles,presence,worldDirectory,moderation,origin,staticRoot,
        ...(id===worldId?{worldCatalog:catalog}:{}),...(mode==='local'?{isAdmin:auth.isAdmin}:{}),
        ...(id===worldId?{onApplyRegion:applyRegion}:{}),regionSha256:meta?.regionSha256,
        onBan:userId=>{for(const [otherId,other] of games)if(otherId!==id)other.game.disconnectUser(userId,4003,'This account cannot join the town.');},
        onMove:(userId,fromWorldId)=>games.get(fromWorldId)?.game.disconnectUser(userId,4009,'This account joined another world.'),
        moderators:(env.MODERATOR_USER_IDS??'').split(',').map(value=>value.trim()).filter(Boolean),
        trustedProxyIPs:(env.TRUSTED_PROXY_IPS??'').split(',').map(value=>value.trim()).filter(Boolean),voice});
      const entry={game,world,meta};games.set(id,entry);return entry;
    })().finally(()=>pending.delete(id));
    pending.set(id,load);return load;
  }
  const chauffeurRequest=createChauffeurRoute({auth,waitlist,origin,apiKey:env.TYPESAFE_API_KEY,model:env.JEV_AUTO_MODEL,dailyLimit:chauffeurDailyLimit(env),
    security:localSecurity,...(mode==='local'?{isAdmin:auth.isAdmin}:{})});
  const deletionRequest=createWorkOSDeletionHandler({secret:mode==='workos'?(env.WORKOS_WEBHOOK_SECRET||null):null,
    onDelete:async id=>{await characters.deleteAccount(id);await auth.revokeUser(id);}});
  const handleRequest=async(req,res)=>await deletionRequest(req,res)||await chauffeurRequest(req,res);
  const router=createWorldRouter({worldFor,configuredWorldId:worldId,handleRequest});
  const characterMetrics=createCharacterMetrics({enabled:env.RIVER_OAKS_CHARACTER_STUDIO_METRICS==='1'});
  return {server:router.server,auth:mode,origin,worldId,catalog,worldFor,close(){
    if(closing)return closing;
    closed=true;workplace?.close();voice?.close();
    closing=(async()=>{
      try{
      await Promise.allSettled([...pending.values()]);
      for(const {game} of games.values())await game.close();
      games.clear();landmarkStores.clear();
      await router.close();auth.close();
      }finally{characterMetrics.close();}
    })();
    return closing;
  }};
}
