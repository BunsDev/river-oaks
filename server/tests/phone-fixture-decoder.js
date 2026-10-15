// Private phone-fixture controls for investigating iOS image decoding. None of
// these scripts or endpoints is installed in a production build.
const reportScript = `(() => { const started = performance.now(); for (const delay of [5000, 25000]) setTimeout(() => { const progress = document.querySelector('#viewport')?.dataset.assetProgress; const loading = document.querySelector('#loading'); let graphics = null; try { graphics = globalThis.__riverRenderAudit?.graphics() ?? null; } catch {} const report = { mode: document.documentElement.dataset.phoneAvatarDecoder === 'html-images' ? 'avatar-html' : document.documentElement.dataset.phoneDecoder === 'html-images' ? 'global-html' : 'normal', elapsedMs: Math.round(performance.now() - started), asset: progress ? JSON.parse(progress) : null, loading: loading ? { shown: !loading.hidden, error: loading.classList.contains('error'), title: loading.querySelector('h2')?.textContent?.slice(0, 80) ?? null, message: loading.querySelector('p')?.textContent?.slice(0, 200) ?? null } : null, graphics: graphics ? { renderer: String(graphics.renderer).slice(0, 120), viewport: graphics.viewport, render: { calls: graphics.render?.calls ?? null }, memory: { textures: graphics.memory?.textures ?? null } } : null }; void fetch('/__phone_readiness', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(report) }).catch(() => {}); }, delay); })();`;
export function phoneDecoderProbePlugin() {
  const reports = [];
  return {
    name: 'phone-fixture-html-image-decoder',
    configureServer(server) {
      server.middlewares.use('/__phone_readiness', (req, res) => {
        if (req.method === 'GET') {
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify(reports));
          return;
        }
        if (req.method !== 'POST') { res.writeHead(405).end(); return; }
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}`) { res.writeHead(403).end(); return; }
        let body = '';
        req.on('data', chunk => { body += chunk; if (body.length > 4096) req.destroy(); });
        req.on('end', () => {
          try {
            const report = JSON.parse(body);
            if (!['normal', 'avatar-html', 'global-html'].includes(report.mode)) throw new Error('invalid mode');
            const finite = value => Number.isFinite(value) ? Math.max(0, Math.round(value)) : null;
            reports.push({ mode: report.mode, elapsedMs: finite(report.elapsedMs),
              asset: report.asset && { loaded: finite(report.asset.loaded), total: finite(report.asset.total), failed: finite(report.asset.failed), done: report.asset.done === true },
              loading: report.loading && { shown: report.loading.shown === true, error: report.loading.error === true, title: String(report.loading.title ?? '').slice(0, 80), message: String(report.loading.message ?? '').slice(0, 200) },
              graphics: report.graphics && { renderer: String(report.graphics.renderer ?? '').slice(0, 120), viewport: report.graphics.viewport?.slice(0, 2).map(finite) ?? null,
                render: { calls: finite(report.graphics.render?.calls) }, memory: { textures: finite(report.graphics.memory?.textures) } } });
            if (reports.length > 20) reports.shift();
            res.writeHead(204).end();
          } catch { res.writeHead(400).end(); }
        });
      });
    },
    transformIndexHtml: {
      order: 'pre',
      handler(_html, context) {
        if (!context.filename.endsWith('/index.html')) return;
        const url = new URL(context.originalUrl ?? context.path, 'http://phone-fixture.invalid');
        const tags = [];
        if (url.searchParams.get('phone-avatar-decoder') === 'html') tags.push({
          tag: 'script',
          attrs: { id: 'phone-avatar-decoder-control' },
          injectTo: 'head-prepend',
          children: "globalThis.__riverPhoneAvatarHtmlImages = true; document.documentElement.dataset.phoneAvatarDecoder = 'html-images';",
        });
        else if (url.searchParams.get('phone-decoder') === 'html') tags.push({
          tag: 'script',
          attrs: { id: 'phone-decoder-control' },
          injectTo: 'head-prepend',
          children: "globalThis.createImageBitmap = undefined; document.documentElement.dataset.phoneDecoder = 'html-images';",
        });
        if (url.searchParams.get('phone-report') === '1') tags.push({ tag: 'script', attrs: { id: 'phone-readiness-report' }, injectTo: 'head-prepend', children: reportScript });
        return tags;
      },
    },
  };
}
