// The header witness for the bundled-origin experiment: a loopback server that
// answers every request, and every WebSocket upgrade, with the request headers it
// received, so the results show exactly what the WebView sent from each origin.
// Cookies are reported by name only. It allows any origin (CORS, with
// credentials) so a cross-origin page can read the answer; the fixture town,
// which enforces the real policy, gives the real verdicts.
import { createServer } from 'node:http';
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

export async function startWitness({ host = '127.0.0.1', port = 0 } = {}) {
  const records = [];
  const server = createServer((req, res) => {
    const seen = describeRequest(req);
    records.push(seen);
    const allowedOrigins = new Set([`http://${host}:${server.address()?.port}`]);
    const requestOrigin = typeof req.headers.origin === 'string' ? req.headers.origin : null;
    const originAllowed = requestOrigin !== null && allowedOrigins.has(requestOrigin);
    const headers = {
      'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      'Access-Control-Allow-Headers': 'content-type, x-csrf-token', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
    if (originAllowed) {
      headers['Access-Control-Allow-Origin'] = requestOrigin;
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    if (req.method === 'OPTIONS') { res.writeHead(204, headers); res.end(); return; }
    res.writeHead(200, headers);
    res.end(JSON.stringify(seen));
  });
  const sockets = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const seen = describeRequest(req);
    records.push(seen);
    sockets.handleUpgrade(req, socket, head, ws => { ws.send(JSON.stringify(seen)); ws.close(1000, 'echoed'); });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, host, resolve); });
  const origin = `http://${host}:${server.address().port}`;
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
