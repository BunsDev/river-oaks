import { createChauffeurRoute } from './chauffeur.js';
import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { createRedisAuth } from './redis-auth.js';
import { createRedisSecurity } from './redis-security.js';
import { createRedisWaitlist } from './waitlist.js';
import { createWorldGateway } from './world-gateway.js';
import { vercelClientAddress } from './vercel-routing.js';
import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';

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
  const worldData = JSON.parse(await readFile(new URL('../preview/public/data/district.json', import.meta.url)));
  worldData.vegetation = JSON.parse(await readFile(new URL('../preview/public/data/district-vegetation.json', import.meta.url)));
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
    let gateway;
    const auth = createRedisAuth({ redis, prefix, origin,
      apiKey: env.WORKOS_API_KEY, clientId: env.WORKOS_CLIENT_ID, cookiePassword: env.WORKOS_COOKIE_PASSWORD,
      githubToken: env.GITHUB_TOKEN || null, returnPath: env.AUTH_RETURN_PATH,
      onLogout: (userId, sessionId) => gateway.disconnectUser(userId, sessionId),
    });
    const handleRequest = createChauffeurRoute({auth,security,waitlist,origin,apiKey:env.TYPESAFE_API_KEY,model:env.JEV_AUTO_MODEL});
    gateway = createWorldGateway({handleRequest,redis,namespace,worldData,auth,security,waitlist,waitlistAdmins:admins,origin,configuredWorldId:worldId,
      moderators: (env.MODERATOR_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean),
      trustedProxyIPs: (env.TRUSTED_PROXY_IPS ?? '').split(',').map(ip => ip.trim()).filter(Boolean),
      ...(env.VERCEL === '1' ? { address: vercelClientAddress } : {}),
    });
    return { worldId, server: gateway.server, catalog:gateway.catalog, async close() {
      await gateway.close(); auth.close(); security.close(); redis.disconnect();
    } };
  } catch {
    redis.disconnect();
    throw new Error('Shared backend configuration is invalid');
  }
}
