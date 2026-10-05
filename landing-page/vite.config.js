import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [{
    name: 'landing-dev-routes',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url, 'http://127.0.0.1');
        if (url.pathname === '/') {
          res.writeHead(302, { Location: `/landing-page/${url.search}` });
          res.end();
          return;
        }
        if (url.pathname !== '/play' && url.pathname !== '/play/') return next();
        res.writeHead(302, { Location: `http://127.0.0.1:5173/${url.search}` });
        res.end();
      });
    },
  }],
  server: { host: '127.0.0.1', port: 5181, strictPort: true },
});
