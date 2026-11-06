// The header witness for the bundled-origin experiment: a loopback server that
// answers every request, and every WebSocket upgrade, with the request headers it
// received, so the results show exactly what the WebView sent from each origin.
// Cookies are reported by name only. Explicit fixture origins may read the
// credentialed answer; unknown origins fail closed. The fixture town,
// which enforces the real policy, gives the real verdicts.
import { createServer } from 'node:http';
import { createServer as createTLSServer } from 'node:https';
import { WebSocketServer } from 'ws';

export const cookieNames = header => String(header ?? '').split(';').map(part => part.trim().split('=')[0]).filter(Boolean);

export function describeRequest(req) {
  const { headers } = req;
  return {
    method: req.method, path: req.url, host: headers.host ?? null, origin: headers.origin ?? null,
    cookieNames: cookieNames(headers.cookie), csrfToken: typeof headers['x-csrf-token'] === 'string',
    secFetchSite: headers['sec-fetch-site'] ?? null, secFetchMode: headers['sec-fetch-mode'] ?? null, secFetchDest: headers['sec-fetch-dest'] ?? null,
    referer: headers.referer ?? null, upgrade: headers.upgrade ?? null,
  };
}

export async function startWitness({ host = '127.0.0.1', port = 0, tls, allowedOrigins = [] } = {}) {
  if (host !== '127.0.0.1') throw new Error('Witness must bind explicit loopback');
  if (!Array.isArray(allowedOrigins)) throw new Error('Expected fixture origin list');
  const allowed = new Map(allowedOrigins.map(value => {
    if (value === 'capacitor://localhost') return [value, value];
    const match = typeof value === 'string' && /^https?:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/.exec(value);
    if (!match || Number(match[1]) > 65535) throw new Error('Invalid fixture origin');
    const url = new URL(value);
    return [url.origin, url.origin];
  }));
  const records = [];
  const handle = (req, res) => {
    const seen = describeRequest(req);
    records.push(seen);
    const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    const responseOrigin = requestOrigin === null ? undefined : allowed.get(requestOrigin);
    const originAllowed = responseOrigin !== undefined;
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'content-type, x-csrf-token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (originAllowed) {
      headers['Access-Control-Allow-Origin'] = responseOrigin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    if (requestOrigin !== null && !originAllowed) { res.writeHead(403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify({ error: 'origin-not-allowed' })); return; }
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    res.writeHead(200, headers);
    res.end(JSON.stringify(seen));
  };
  const server = tls ? createTLSServer(tls, handle) : createServer(handle);
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const seen = describeRequest(req);
    records.push(seen);
    if (typeof req.headers.origin !== 'string' || !allowed.has(req.headers.origin)) { socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); return; }
    sockets.handleUpgrade(req, socket, head, ws => { ws.send(JSON.stringify(seen)); ws.close(1000, 'echoed'); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const origin = `${tls ? 'https' : 'http'}://${host}:${server.address().port}`;
  allowed.set(origin, origin);
  return { origin, records, close: () => new Promise(resolve => { sockets.close(); server.close(resolve); }) };
}

// One line per check for the comparison table.
export function summarize(value) {
  if (!value || typeof value !== 'object') return String(value);
  if (value.ok === false) return value.error ? `failed: ${value.error}` : 'failed';
  if ('status' in value) {
    const body = value.body;
    const extra = body && typeof body === 'object' ? [body.origin !== undefined ? `Origin ${body.origin ?? 'absent'}` : null, body.cookieNames ? `cookies [${body.cookieNames.join(', ')}]` : null, body.secFetchSite ? `Sec-Fetch-Site ${body.secFetchSite}` : null, body.authenticated !== undefined ? `authenticated ${body.authenticated}` : null, body.status ? `status ${body.status}` : null, body.error ? `error ${body.error}` : null].filter(Boolean).join('; ') : '';
    return `HTTP ${value.status}${value.issued !== undefined ? `, ticket ${value.issued ? 'issued' : 'refused'}` : ''}${extra ? `: ${extra}` : ''}`;
  }
  if ('open' in value) {
    const echo = value.echo && typeof value.echo === 'object' ? `: Origin ${value.echo.origin ?? 'absent'}; cookies [${(value.echo.cookieNames ?? []).join(', ')}]` : value.echo ? `: ${value.echo}` : '';
    return `${value.open ? 'opened' : 'never opened'}${value.closeCode !== undefined ? ` (close ${value.closeCode})` : ''}${echo}`;
  }
  if (value.noErrorObserved === true && value.startupVerified === false) return `no error observed in ${value.windowMs} ms; worker startup unverified`;
  if ('loaded' in value) return value.loaded ? 'loaded' : 'not loaded';
  if (Object.keys(value).length === 1 && 'ok' in value) return value.ok ? 'ok' : 'failed';
  return JSON.stringify(value);
}

export function comparisonRows(modes) {
  const names = [...new Set(Object.values(modes).flatMap(result => Object.keys(result?.checks ?? {})))];
  return names.map(name => ({ check: name, ...Object.fromEntries(Object.entries(modes).map(([mode, result]) => [mode, summarize(result?.checks?.[name])])) }));
}
