import { createRedisCharacterStore } from './character-store.js';
import { accountPrefixFor } from './world-keys.js';
import { createWorkOSDeletionHandler } from './workos-deletion.js';
import { createChauffeurRoute, chauffeurDailyLimit } from './chauffeur.js';
import Redis from 'ioredis';
import { loadDistrictData } from './district-data.js';
import { createRedisAuth } from './redis-auth.js';
import { magicOptions } from './magic-auth.js';
import { createRedisSecurity } from './redis-security.js';
import { createRedisWaitlist } from './waitlist.js';
import { createWorldGateway } from './world-gateway.js';
import { parseScreeningHosts } from './screenings.js';
import { configuredOfficeLayout } from './offices.js';
import { configuredDistrictRevision } from '../preview/src/garden-campus-district.js';
import { parseCampusOperators } from './campus-leases.js';
import { vercelClientAddress } from './vercel-routing.js';
import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';
import { configureVoice, createRedisVoiceLeases } from './voice.js';

export async function createRedisBackend(env = process.env) {
  const origin = env.PUBLIC_ORIGIN;
  const url = new URL(origin);
  if (url.origin !== origin || (url.protocol !== 'https:' && !(url.protocol === 'http:'
    && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)))) throw new Error('Invalid public origin');
  if (!env.REDIS_URL || !/^rediss?:$/.test(new URL(env.REDIS_URL).protocol)) throw new Error('Redis is not configured');
  // Every deployment of production must share this namespace; previews must opt
  // into their own namespace and never inherit the production town accidentally.
  const namespace = env.REDIS_NAMESPACE ?? (env.VERCEL_ENV === 'production' ? 'river-oaks:production:v1' : null);
  if (!namespace || !/^[A-Za-z0-9:_-]{1,120}$/.test(namespace)) throw new Error('Redis namespace is not configured');
  if (env.VERCEL_ENV && env.VERCEL_ENV !== 'production' && namespace.startsWith('river-oaks:production:')) throw new Error('Preview cannot use the production town');
  const worldId = validateWorldId(env.WORLD_ID ?? DEFAULT_WORLD_ID);
  const prefix = `{${namespace}}`;
  // The district revision; unset or unknown keeps the garage (the default and the rollback, #507).
  const districtRevision = configuredDistrictRevision(env.RIVER_OAKS_DISTRICT_REVISION, { onInvalid: () => console.warn(JSON.stringify({ event: 'district_revision_ignored' })) });
  const worldData = await loadDistrictData({ districtRevision });
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true, connectTimeout: 3000, commandTimeout: 3000,
    maxRetriesPerRequest: 1, autoResendUnfulfilledCommands: false,
    enableOfflineQueue: false, retryStrategy: attempts => Math.min(attempts * 250, 3000),
  });
  // Redis errors can contain connection details. Endpoints expose a generic 503.
  redis.on('error', () => {});
  try { await redis.connect(); } catch { redis.disconnect(); throw new Error('Shared storage unavailable'); }
  try {
    const security = createRedisSecurity({ redis, prefix });
    const admins = (env.WAITLIST_ADMIN_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean);
    const accessNamespace = env.WAITLIST_NAMESPACE ?? (env.VERCEL_ENV === 'production' ? 'river-oaks:production:access:v1' : `${namespace}:access`);
    if (!/^[A-Za-z0-9:_-]{1,120}$/.test(accessNamespace)
      || env.VERCEL_ENV && env.VERCEL_ENV !== 'production' && accessNamespace === 'river-oaks:production:access:v1') throw new Error('Invalid waitlist namespace');
    const waitlist = createRedisWaitlist({ redis, prefix: `{${accessNamespace}}`, admins });
    const characters=createRedisCharacterStore({redis,prefix:accountPrefixFor(namespace)});
    let gateway;
    const auth = createRedisAuth({ redis, prefix, origin, accountActive: async id => !(await characters.get(id)).deleted,
      apiKey: env.WORKOS_API_KEY, clientId: env.WORKOS_CLIENT_ID, cookiePassword: env.WORKOS_COOKIE_PASSWORD,
      githubToken: env.GITHUB_TOKEN || null, returnPath: env.AUTH_RETURN_PATH,
      onLogout: (userId, sessionId) => gateway.disconnectUser(userId, sessionId), magic: magicOptions(env, origin),
      usernameOf: userId => waitlist.usernameOf(userId),
    });
    // Redis counts the daily budget in UTC-day windows across every gateway.
    const chauffeurRequest = createChauffeurRoute({auth,security,waitlist,origin,apiKey:env.TYPESAFE_API_KEY,model:env.JEV_AUTO_MODEL,dailyLimit:chauffeurDailyLimit(env)});
    const deletionRequest=createWorkOSDeletionHandler({secret:env.WORKOS_WEBHOOK_SECRET||null,
      onDelete:async id=>{await characters.deleteAccount(id);await auth.revokeUser(id);}});
    const handleRequest=async(req,res)=>await deletionRequest(req,res)||await chauffeurRequest(req,res);
    // Shared voice rooms and the daily join budget count across every gateway of this namespace.
    // A long-lived gateway sweeps orphaned voice participants on a timer; on
    // Vercel the per-minute cron (/api/voice-sweep) does it.
    const voice = configureVoice({ env, namespace, allow: (...args) => security.allow(...args), leases: createRedisVoiceLeases({ redis, prefix }), sweepMs: env.VERCEL !== '1' ? 30_000 : 0 });
    gateway = createWorldGateway({handleRequest,redis,namespace,worldData,auth,security,waitlist,waitlistAdmins:admins,origin,configuredWorldId:worldId,voice,voiceCronSecret:env.CRON_SECRET||null,
      moderators: (env.MODERATOR_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean),
      trustedProxyIPs: (env.TRUSTED_PROXY_IPS ?? '').split(',').map(ip => ip.trim()).filter(Boolean),
      ...(env.VERCEL === '1' ? { address: vercelClientAddress } : {}),
      characterMetricsEnabled:env.RIVER_OAKS_CHARACTER_STUDIO_METRICS==='1',
      characterStudioEnabled: env.RIVER_OAKS_CHARACTER_STUDIO === '1',
      workplaceEnabled: env.RIVER_OAKS_WORKPLACE === '1',
      // Venue hosts are explicit grants; none configured means no one can control a screening.
      // Jevica's office layout; unset or unknown keeps the legacy room (the default and the rollback).
      officeLayout: configuredOfficeLayout(env.RIVER_OAKS_OFFICE_LAYOUT, { onInvalid: () => console.warn(JSON.stringify({ event: 'office_layout_ignored' })) }),
      screeningHosts: parseScreeningHosts(env.RIVER_OAKS_SCREENING_HOSTS, { onInvalid: () => console.warn(JSON.stringify({ event: 'screening_host_grant_ignored' })) }),
      // Garden campus lease operators are explicit account ids; none configured keeps leasing closed.
      campusOperators: parseCampusOperators(env.RIVER_OAKS_CAMPUS_OPERATOR_IDS, { onInvalid: () => console.warn(JSON.stringify({ event: 'campus_operator_ignored' })) }),
      workplaceSweep: env.VERCEL !== '1',
      // Vercel Cron sends it as a Bearer token; without it the sweep route stays closed.
      workplaceCronSecret: env.CRON_SECRET || null,
      // Signs the static-asset pass; the middleware verifies it with the same secret.
      assetGateSecret: env.WORKOS_COOKIE_PASSWORD,
    });
    return { worldId, server: gateway.server, catalog:gateway.catalog, async close() {
      await gateway.close(); voice?.close(); auth.close(); security.close(); redis.disconnect();
    } };
  } catch {
    redis.disconnect();
    throw new Error('Shared backend configuration is invalid');
  }
}
