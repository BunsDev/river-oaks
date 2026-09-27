import { createServer } from 'node:http';
import { createRedisBackend } from '../server/redis-backend.js';
import { normalizeVercelRoute } from '../server/vercel-routing.js';

let backend, initializing, retryAt = 0;
async function getBackend() {
  if (backend) return backend;
  if (Date.now() < retryAt) throw new Error('Backend unavailable');
  if (!initializing) initializing = createRedisBackend().then(value => { backend = value; return value; })
    .catch(() => { retryAt = Date.now() + 10_000; throw new Error('Backend unavailable'); })
    .finally(() => { initializing = null; });
  return initializing;
}
const server = createServer(async (req, res) => {
  req.url = normalizeVercelRoute(req.url);
  try { (await getBackend()).server.emit('request', req, res); }
  catch {
    res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'auth_unavailable' }));
  }
});
server.on('upgrade', async (req, socket, head) => {
  socket.on('error', () => {});
  req.url = normalizeVercelRoute(req.url);
  try { (await getBackend()).server.emit('upgrade', req, socket, head); }
  catch { socket.end('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); }
});
server.requestTimeout = 15_000; server.headersTimeout = 10_000;
export default server;
