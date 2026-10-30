// One Redis-coordinated world process for the browser writer-takeover journey
// (preview/e2e/crime-takeover-runner.js). Two of these share one town through the
// isolated Redis the runner names; the runner's proxy decides which one the page
// reaches. Identities are the browser fixture's (server/tests/browser-fixture.js):
// provider-free, loopback only. Production uses server/start.js and WorkOS.
import Redis from 'ioredis';
import { createWorldGateway } from '../world-gateway.js';
import { createRedisSecurity } from '../redis-security.js';
import { approvedWaitlist } from './waitlist-fixture.js';
import { loadDistrictData } from '../district-data.js';
import { configuredDistrictRevision } from '../../preview/src/garden-campus-district.js';

const port = Number(process.env.PORT), origin = process.env.RIVER_OAKS_TEST_ORIGIN, namespace = process.env.RIVER_OAKS_TAKEOVER_NAMESPACE, label = process.env.RIVER_OAKS_TAKEOVER_LABEL ?? 'world';
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a TCP port');
if (!origin || !namespace || !process.env.REDIS_URL) throw new Error('RIVER_OAKS_TEST_ORIGIN, RIVER_OAKS_TAKEOVER_NAMESPACE and REDIS_URL are required');
if (!/^river-oaks:takeover-test:/.test(namespace)) throw new Error('The takeover namespace must start with river-oaks:takeover-test:');

const OWNER = 'user_01M40Y914S1H4EJCEHH91DKTAY';
const identity = req => {
  const fixtureId = req.headers.cookie?.match(/(?:^|; )fixture_session=(alice|bob|guest|owner)/)?.[1];
  const userId = fixtureId === 'owner' ? OWNER : fixtureId;
  const name = { owner: 'Jevica', alice: 'alice', bob: 'bob', guest: 'guest' }[fixtureId];
  return userId ? { userId, name, sessionId: `${userId}-takeover`, csrfToken: 'fixture-' + fixtureId, expiresAt: Date.now() + 3600000 } : null;
};
const auth = { authenticate: async req => identity(req), isSessionActive: async () => true, close() {}, async handle(req, res) {
  if (!req.url.startsWith('/auth/')) return false;
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  const user = identity(req);
  if (req.url === '/auth/session') { res.end(JSON.stringify(user ? { authenticated: true, user: { id: user.userId, name: user.name }, csrfToken: user.csrfToken } : { authenticated: false })); return true; }
  res.statusCode = 404; res.end('{}'); return true;
} };

const data = await loadDistrictData({ districtRevision: configuredDistrictRevision(process.env.RIVER_OAKS_DISTRICT_REVISION) });
const clients = [];
const redisFor = () => { const redis = new Redis(process.env.REDIS_URL); clients.push(redis); return redis; };
const security = createRedisSecurity({ redis: redisFor(), prefix: `{${namespace}}` });
const app = createWorldGateway({ redis: redisFor(), namespace, worldData: data, auth, security, waitlist: approvedWaitlist, origin, isAdmin: id => id === OWNER });
await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(port, '127.0.0.1', resolve); });
console.log(JSON.stringify({ event: 'takeover_world_listening', label, port, pid: process.pid }));
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close().catch(() => {}); security.close(); for (const redis of clients) await redis.quit().catch(() => {}); process.exit(0); });
