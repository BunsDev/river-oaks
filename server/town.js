import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAuth } from './auth.js';
import { createDevAuth, devAuthAllowed } from './dev-auth.js';
import { createSharedWorld } from './world.js';
import { createModeration } from './moderation.js';
import { createGameServer } from './app.js';
import { createMemoryLandmarks } from './landmarks.js';
import { createMemoryWorldCatalog } from './world-catalog.js';
import { createWorldRouter } from './world-router.js';
import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';

export function workosConfigured(env) {
  return Boolean(env.WORKOS_API_KEY && env.WORKOS_CLIENT_ID && env.WORKOS_COOKIE_PASSWORD?.length >= 32);
}

// Which sign-in the standalone town uses. `devAuth` is 'local' (development
// identities), 'workos', or 'auto': WorkOS when configured, otherwise local
// identities where that is allowed, otherwise WorkOS failing closed with 503.
export function chooseAuth({ env, origin, devAuth = 'auto' }) {
  if (devAuth === 'workos' || env.RIVER_OAKS_DEV_AUTH === 'workos') return 'workos';
  if (devAuth === 'local' && devAuthAllowed({ origin, env })) return 'local';
  if (devAuth === 'auto' && !workosConfigured(env) && devAuthAllowed({ origin, env })) return 'local';
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
  const data = JSON.parse(await readFile(new URL('../preview/public/data/district.json', import.meta.url), 'utf8'));
  data.vegetation = JSON.parse(await readFile(new URL('../preview/public/data/district-vegetation.json', import.meta.url), 'utf8'));
  const moderation = await createModeration(resolve(env.MODERATION_FILE ?? '.runtime/moderation.json'));
  const mode = chooseAuth({ env, origin, devAuth });
  const games=new Map(),pending=new Map(),catalog=createMemoryWorldCatalog();
  const onLogout = userId => {for(const {game} of games.values())game.disconnectUser(userId);};
  const auth = mode === 'local'
    ? createDevAuth({ origin, onLogout })
    : createAuth({ apiKey: env.WORKOS_API_KEY, clientId: env.WORKOS_CLIENT_ID, cookiePassword: env.WORKOS_COOKIE_PASSWORD, origin, onLogout });
  const sharedAuth={handle:(...args)=>auth.handle(...args),authenticate:(...args)=>auth.authenticate(...args),close:()=>{}};
  async function worldFor(id) {
    if(games.has(id))return games.get(id);
    if(pending.has(id))return pending.get(id);
    const load=(async()=>{
      const meta=await catalog.get(id);
      if(!meta && id!==worldId)return null;
      const worldData=meta?.template==='region-v1'?await catalog.getRegion(id)
        :id===DEFAULT_WORLD_ID?data:{...data,title:meta?.title??data.title};
      const world=createSharedWorld(worldData,mode==='local'?{isAdmin:auth.isAdmin,worldId:id}:{worldId:id});
      const game=createGameServer({auth:sharedAuth,world,landmarks:createMemoryLandmarks(),moderation,origin,staticRoot,
        ...(id===worldId?{worldCatalog:catalog}:{}),...(mode==='local'?{isAdmin:auth.isAdmin}:{}),
        onBan:userId=>{for(const [otherId,other] of games)if(otherId!==id)other.game.disconnectUser(userId,4003,'This account cannot join the town.');},
        moderators:(env.MODERATOR_USER_IDS??'').split(',').map(value=>value.trim()).filter(Boolean),
        trustedProxyIPs:(env.TRUSTED_PROXY_IPS??'').split(',').map(value=>value.trim()).filter(Boolean)});
      const entry={game,world,meta};games.set(id,entry);return entry;
    })().finally(()=>pending.delete(id));
    pending.set(id,load);return load;
  }
  const router=createWorldRouter({worldFor,configuredWorldId:worldId});
  return {server:router.server,auth:mode,origin,worldId,catalog,worldFor,async close(){
    for(const {game} of games.values())await game.close();
    await router.close();auth.close();
  }};
}
