import { readFile } from 'node:fs/promises';
import Redis from 'ioredis';
import { createRedisAuth } from './redis-auth.js';
import { createRedisRoom } from './redis-room.js';
import { createRedisSecurity } from './redis-security.js';
import { createDistributedServer } from './distributed-app.js';
import { createRedisLandmarks } from './landmarks.js';
import { vercelClientAddress } from './vercel-routing.js';
import { DEFAULT_WORLD_ID, validateWorldId } from '../preview/src/world-contract.js';
import { roomPrefixFor, accountPrefixFor } from './world-keys.js';

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
  const prefix = `{${namespace}}`, roomPrefix = roomPrefixFor(namespace,worldId);
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
    // Account bookmarks outlive a town checkpoint version while previews keep
    // their own namespace and cannot read production accounts.
    const accountPrefix = accountPrefixFor(namespace,worldId);
    const landmarks = createRedisLandmarks({ redis, prefix: accountPrefix });
    let game;
    const auth = createRedisAuth({ redis, prefix, origin,
      apiKey: env.WORKOS_API_KEY, clientId: env.WORKOS_CLIENT_ID, cookiePassword: env.WORKOS_COOKIE_PASSWORD,
      onLogout: (userId, sessionId) => game.disconnectUser(userId, sessionId),
    });
    const room = createRedisRoom({ redis, prefix:roomPrefix, worldId, worldData, authorize: async identity =>
      await auth.isSessionActive(identity.userId, identity.sessionId)
        && !(await security.isBanned(identity.userId)) });
    game = createDistributedServer({ auth, room, security, landmarks, origin,
      moderators: (env.MODERATOR_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean),
      trustedProxyIPs: (env.TRUSTED_PROXY_IPS ?? '').split(',').map(ip => ip.trim()).filter(Boolean),
      ...(env.VERCEL === '1' ? { address: vercelClientAddress } : {}),
    });
    return { worldId, server: game.server, async close() {
      await game.close(); await room.close(); security.close(); redis.disconnect();
    } };
  } catch {
    redis.disconnect();
    throw new Error('Shared backend configuration is invalid');
  }
}
