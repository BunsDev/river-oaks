import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createAuth } from './auth.js';
import { createDevAuth, devAuthAllowed } from './dev-auth.js';
import { createSharedWorld } from './world.js';
import { createModeration } from './moderation.js';
import { createGameServer } from './app.js';

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
  const data = JSON.parse(await readFile(new URL('../preview/public/data/district.json', import.meta.url), 'utf8'));
  data.vegetation = JSON.parse(await readFile(new URL('../preview/public/data/district-vegetation.json', import.meta.url), 'utf8'));
  const moderation = await createModeration(resolve(env.MODERATION_FILE ?? '.runtime/moderation.json'));
  const mode = chooseAuth({ env, origin, devAuth });
  let game;
  const onLogout = userId => game?.disconnectUser(userId);
  const auth = mode === 'local'
    ? createDevAuth({ origin, onLogout })
    : createAuth({ apiKey: env.WORKOS_API_KEY, clientId: env.WORKOS_CLIENT_ID, cookiePassword: env.WORKOS_COOKIE_PASSWORD, origin, onLogout });
  const world = createSharedWorld(data,mode === 'local' ? {isAdmin:auth.isAdmin} : {});
  game = createGameServer({
    auth, world, moderation, origin, staticRoot,
    moderators: (env.MODERATOR_USER_IDS ?? '').split(',').map(id => id.trim()).filter(Boolean),
    trustedProxyIPs: (env.TRUSTED_PROXY_IPS ?? '').split(',').map(ip => ip.trim()).filter(Boolean),
  });
  return { ...game, auth: mode, origin };
}
