// Loopback-only acceptance: two independent backends, one isolated Redis town.
// No fixture identity handler is imported by production server entry points.
import { readFile } from 'node:fs/promises';
import { createServer, request } from 'node:http';
import { randomUUID } from 'node:crypto';
import Redis from 'ioredis';
// The fixture supplies its own town and identities, and tests the sign-in gate.
process.env.VITE_MULTIPLAYER='required';process.env.RIVER_OAKS_DEV_TOWN='off';
import { createServer as createViteServer } from 'vite';
import { createRedisRoom } from '../redis-room.js';
import { createRedisSecurity } from '../redis-security.js';
import { createDistributedServer } from '../distributed-app.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { createRedisLandmarks } from '../landmarks.js';
import { createRedisSocial } from '../social.js';
if (!process.env.REDIS_URL) throw new Error('Redis browser verification requires REDIS_URL');
const origin = 'http://127.0.0.1:5180', prefix = `{river-oaks:test:${randomUUID()}}`;
const redis = new Redis(process.env.REDIS_URL, { maxRetriesPerRequest: 1, autoResendUnfulfilledCommands: false });
redis.on('error', () => {});
const worldData = JSON.parse(await readFile(new URL('../../preview/public/data/district.json', import.meta.url)));
worldData.vegetation = JSON.parse(await readFile(new URL('../../preview/public/data/district-vegetation.json', import.meta.url)));
const revoked = new Set(), nodes = [];
const identity = req => {
  const userId = req.headers.cookie?.match(/(?:^|; )fixture_session=(alice|bob)/)?.[1];
  return userId && !revoked.has(userId) ? { userId, name: userId, sessionId: userId,
    csrfToken: 'fixture-' + userId, expiresAt: Date.now() + 3600_000 } : null;
};
for (const port of [8788, 8789]) {
  const security = createRedisSecurity({ redis, prefix });
  const room = createRedisRoom({ redis, prefix, worldData, isAdmin:id=>id==='alice', authorize: async user => !revoked.has(user.userId) && !(await security.isBanned(user.userId)) });
  let app;
  const auth = { authenticate: async req => identity(req), async handle(req, res) {
    if (!req.url.startsWith('/auth/')) return false;
    res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
    const user = identity(req);
    if (req.url === '/auth/session') { res.end(JSON.stringify(user ? { authenticated: true, user: { id: user.userId, name: user.name }, csrfToken: user.csrfToken } : { authenticated: false })); return true; }
    if (req.url === '/auth/logout' && req.method === 'POST' && user && req.headers.origin === origin && req.headers['x-csrf-token'] === user.csrfToken) {
      revoked.add(user.userId); await app.disconnectUser(user.userId, user.sessionId);
      res.setHeader('Set-Cookie', 'fixture_session=; Path=/; Max-Age=0'); res.end(JSON.stringify({ url: '/' })); return true;
    }
    res.statusCode = 404; res.end('{}'); return true;
  } };
  app = createDistributedServer({ auth, room, security, waitlist: approvedWaitlist, landmarks:createRedisLandmarks({redis,prefix}), social:createRedisSocial({redis,prefix}), origin });
  await new Promise(resolve => app.server.listen(port, '127.0.0.1', resolve));
  nodes.push({ app, room });
}
const connections = { alice: 0, bob: 0 };
const gateway = createServer((req, res) => {
  if (req.url === '/__fixture') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ connections, separateBackends: true })); return; }
  const upstream = request({ hostname: '127.0.0.1', port: 8788, path: req.url, method: req.method, headers: req.headers }, response => {
    res.writeHead(response.statusCode, response.headers); response.pipe(res);
  });
  upstream.on('error', () => { res.writeHead(503); res.end(); }); req.pipe(upstream);
});
gateway.on('upgrade', (req, socket, head) => {
  const bob = req.headers.cookie?.includes('fixture_session=bob');
  const upstream = request({ hostname: '127.0.0.1', port: bob ? 8789 : 8788, path: req.url, headers: req.headers });
  socket.on('error', () => {});
  upstream.on('upgrade', (response, remote, remoteHead) => {
    connections[bob ? 'bob' : 'alice']++;
    remote.on('error', () => socket.destroy());
    socket.write(`HTTP/1.1 ${response.statusCode} ${response.statusMessage}\r\n` + Object.entries(response.headers).map(([key, value]) => `${key}: ${value}\r\n`).join('') + '\r\n');
    if (remoteHead.length) socket.write(remoteHead);
    if (head.length) remote.write(head);
    remote.pipe(socket); socket.pipe(remote);
    socket.on('close', () => remote.destroy());
  });
  upstream.on('response', response => { socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\n\r\n`); response.resume(); });
  upstream.on('error', () => socket.destroy()); upstream.end();
});
await new Promise(resolve => gateway.listen(8790, '127.0.0.1', resolve));
const vite = await createViteServer({ configFile: 'preview/vite.config.js', server: { host: '127.0.0.1', port: 5180, strictPort: true,
  proxy: { '/auth': 'http://127.0.0.1:8790', '/api/multiplayer': 'http://127.0.0.1:8790', '/api/landmarks': 'http://127.0.0.1:8790', '/api/social': 'http://127.0.0.1:8790', '/api/waitlist': 'http://127.0.0.1:8790', '/api/moderation': 'http://127.0.0.1:8790', '/multiplayer': { target: 'ws://127.0.0.1:8790', ws: true } } } });
await vite.listen();
console.log('Redis browser fixture ready: Alice and Bob use separate backends, private test namespace.');
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
  await vite.close();
  for (const node of nodes) await node.app.close();
  for (const node of nodes) await node.room.close();
  gateway.closeAllConnections(); gateway.close();
  const keys = await redis.keys(prefix + ':*'); if (keys.length) await redis.del(...keys);
  await redis.quit(); process.exit(0);
});
