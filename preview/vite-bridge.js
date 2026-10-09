import { request } from 'node:http';

// The Python bridge is optional in browser development. Keep its HTTP failure
// explicit without Vite printing a stack trace for every settings request.
export function bridgeDevServer({ port = 8765, timeoutMs = 30000 } = {}) {
  let unavailable = false;
  return {
    name: 'river-oaks-optional-bridge',
    apply: 'serve',
    configureServer(vite) {
      vite.middlewares.use((req, res, next) => {
        const path = req.url?.split('?')[0];
        if (path !== '/health' && path !== '/v1' && !path?.startsWith('/v1/')) return next();
        const upstream = request({
          hostname: '127.0.0.1', port, path: req.url, method: req.method,
          headers: { ...req.headers, host: `127.0.0.1:${port}` },
        }, response => {
          unavailable = false;
          res.writeHead(response.statusCode, response.headers);
          response.on('error', () => res.destroy());
          response.pipe(res);
        });
        upstream.on('error', () => {
          if (res.destroyed) return;
          if (!unavailable) {
            unavailable = true;
            vite.config.logger.warn(`  ➜  Optional decision/voice bridge unavailable on 127.0.0.1:${port}. Start it with: uv run river-oaks serve`, { timestamp: false });
          }
          if (res.headersSent) { res.destroy(); return; }
          res.writeHead(503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ error: 'bridge_unavailable', message: 'Start the local decision bridge and try again.' }));
        });
        upstream.setTimeout(timeoutMs, () => upstream.destroy(new Error('Bridge timeout')));
        req.once('aborted', () => upstream.destroy());
        res.once('close', () => upstream.destroy());
        req.pipe(upstream);
      });
    },
  };
}
