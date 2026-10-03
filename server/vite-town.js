import { loadEnv } from 'vite';
import { fileURLToPath } from 'node:url';

// `npm run dev` also runs the shared town in-process, so multiplayer works
// locally with one command and no WorkOS account. The Vite proxy already sends
// /auth, /api and /multiplayer to port 8787. If a town is already listening
// there (for example `npm run server`), that one is used instead. Set
// RIVER_OAKS_DEV_TOWN_PORT to isolate a second development checkout.
const root = fileURLToPath(new URL('..', import.meta.url));

export function sharedTownDevServer({ port = 8787 } = {}) {
  let town = null;
  return {
    name: 'river-oaks-shared-town',
    apply: 'serve',
    configureServer(vite) {
      const env = { ...loadEnv(vite.config.mode, root, ''), ...process.env };
      // Test fixtures run their own town (RIVER_OAKS_DEV_TOWN=off).
      if ((env.VITE_MULTIPLAYER ?? 'auto') === 'off' || env.VITE_SINGLE_PLAYER === 'true' || env.RIVER_OAKS_DEV_TOWN === 'off') return;
      const log = vite.config.logger;
      vite.httpServer?.once('listening', async () => {
        const address = vite.httpServer.address();
        const origin = `http://127.0.0.1:${address.port}`;
        try {
          const { createTown } = await import('./town.js');
          // WorkOS in development is opt-in: RIVER_OAKS_DEV_AUTH=workos, with this
          // origin's /auth/callback registered in the WorkOS environment.
          const candidate = await createTown({ env, origin, devAuth: env.RIVER_OAKS_DEV_AUTH === 'workos' ? 'workos' : 'local' });
          await new Promise((resolve, reject) => {
            candidate.server.once('error', reject);
            candidate.server.listen(port, '127.0.0.1', resolve);
          });
          town = candidate;
          log.info(`  ➜  Shared town: ${town.auth === 'local' ? 'local development identities, no WorkOS' : 'WorkOS sign-in'} (port ${port})`, { timestamp: false });
        } catch (error) {
          if (error.code === 'EADDRINUSE') log.info(`  ➜  Shared town: using the server already on port ${port}`, { timestamp: false });
          else log.warn(`  ➜  Shared town unavailable, playing solo: ${error.message}`, { timestamp: false });
        }
      });
      vite.httpServer?.once('close', () => { town?.close(); town = null; });
    },
  };
}
