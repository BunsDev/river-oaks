// Disposable HTTPS front for the existing provider-free browser fixture only.
// It forwards Origin/CSRF/Host verbatim; it never makes custom-scheme access pass.
import { createServer } from 'node:https';
import { request } from 'node:http';
import { startBrowserFixture } from '../../preview/e2e/fixture-server.js';
import { cookieNames } from './witness.mjs';

export async function startHTTPSFixture({ key, cert }) {
  const records = [], sockets = new Set();
  let fixture;
  const observe = req => { const seen = { method: req.method, path: new URL(req.url, 'https://127.0.0.1').pathname, origin: req.headers.origin ?? null, cookieNames: cookieNames(req.headers.cookie), csrfToken: typeof req.headers['x-csrf-token'] === 'string', upgrade: req.headers.upgrade ?? null }; records.push(seen); return seen; };
  const valid = req => fixture && req.headers.host === new URL(origin).host && req.url.startsWith('/') && !req.url.startsWith('//');
  const upstream = req => request({ hostname: '127.0.0.1', port: new URL(fixture.origin).port, method: req.method, path: req.url, headers: req.headers });
  const server = createServer({ key, cert }, (req, res) => {
    if (!valid(req)) { res.writeHead(400); res.end(); return; }
    const seen = observe(req);
    const headers = { 'Content-Type': 'text/html', 'Cache-Control': 'no-store', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; worker-src 'self'" };
    if (req.method === 'GET' && req.url === '/__host-cookie-bootstrap') {
      seen.status = 200;
      res.writeHead(200, { ...headers, 'Set-Cookie': 'fixture_session=bob; Path=/; Secure; HttpOnly; SameSite=Lax' });
      res.end('<!doctype html><title>Test cookie bootstrap</title><p>Fixture identity only.</p>'); return;
    }
    if (req.method === 'GET' && req.url === '/') { seen.status = 200; res.writeHead(200, { 'Content-Type': 'text/html', 'Cache-Control': 'no-store' }); res.end('<!doctype html><title>HTTPS origin fixture</title><p>Synthetic transport control.</p>'); return; }
    const proxy = upstream(req);
    proxy.on('response', response => { seen.status = response.statusCode; res.writeHead(response.statusCode, response.headers); response.pipe(res); });
    proxy.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end(); });
    req.on('aborted', () => proxy.destroy()); res.on('close', () => proxy.destroy()); req.pipe(proxy);
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  server.on('upgrade', (req, socket, head) => {
    if (!valid(req)) { socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); return; }
    const seen = observe(req);
    const proxy = upstream(req);
    proxy.on('upgrade', (response, remote, remoteHead) => {
      seen.status = 101;
      sockets.add(remote); remote.on('close', () => sockets.delete(remote));
      const headers = response.rawHeaders.reduce((out, value, index, all) => index % 2 === 0 ? `${out}${value}: ${all[index + 1]}\r\n` : out, '');
      socket.write(`HTTP/1.1 101 Switching Protocols\r\n${headers}\r\n`);
      if (head.length) remote.write(head); if (remoteHead.length) socket.write(remoteHead);
      remote.on('error', () => socket.destroy()); socket.on('error', () => remote.destroy());
      socket.on('close', () => remote.destroy()); remote.on('close', () => socket.destroy());
      remote.pipe(socket); socket.pipe(remote);
    });
    proxy.on('response', response => { seen.status = response.statusCode; socket.end(`HTTP/1.1 ${response.statusCode} Rejected\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`); response.resume(); });
    proxy.on('error', () => socket.destroy()); proxy.end();
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `https://127.0.0.1:${server.address().port}`;
  const close = async () => {
    for (const socket of sockets) socket.destroy();
    const results = await Promise.allSettled([new Promise(resolve => server.close(resolve)), fixture?.close()]);
    const failed = results.find(result => result.status === 'rejected'); if (failed) throw failed.reason;
  };
  try { fixture = await startBrowserFixture({ env: { RIVER_OAKS_TEST_PUBLIC_ORIGIN: origin, RIVER_OAKS_VOICE_FIXTURE: '0' } }); }
  catch (error) { await close(); throw error; }
  return { origin, records, close };
}
