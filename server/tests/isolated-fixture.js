// Cross-origin isolation for timing fixtures: a page under /e2e/fixtures/ loaded
// with ?isolate=1 gets COOP/COEP from the server, so the browser gets 5 us timers
// on a real navigation. Fulfilling the document from the test instead leaves it
// without loopback's address space, and Chromium's local-network check then
// blocks Vite's WebSocket.
export const ISOLATION_HEADERS = Object.freeze({'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp'});

export function isolatesFixture(url) {
  const {pathname, searchParams} = new URL(url, 'http://fixture.invalid');
  return /^\/e2e\/fixtures\/[\w-]+\.html$/.test(pathname) && searchParams.get('isolate') === '1';
}

export function isolatedFixturePlugin() {
  return {
    name: 'isolated-timing-fixture',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (isolatesFixture(req.url)) for (const [name, value] of Object.entries(ISOLATION_HEADERS)) res.setHeader(name, value);
        next();
      });
    },
  };
}
