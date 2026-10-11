import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { sharedTownDevServer } from '../server/vite-town.js';
import { bridgeDevServer } from './vite-bridge.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Problem reports name the build they came from: the package version and the
// commit (Vercel provides it; local builds ask git).
const commit = process.env.VERCEL_GIT_COMMIT_SHA || (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; } })();
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

const townPort = Number(process.env.RIVER_OAKS_DEV_TOWN_PORT ?? 8787);
if (!Number.isInteger(townPort) || townPort < 1 || townPort > 65535) throw new Error('RIVER_OAKS_DEV_TOWN_PORT must be a TCP port.');
const townHttp = `http://127.0.0.1:${townPort}`;

export default defineConfig({
  plugins: [sharedTownDevServer({ port: townPort }), bridgeDevServer()],
  define: { __RIVER_OAKS_BUILD__: JSON.stringify({ version, commit }) },
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/auth': townHttp,
      '/api/multiplayer': townHttp,
      '/api/worlds': townHttp,
      '/api/world-draft': townHttp,
      '/api/world-data': townHttp,
      '/api/landmarks': townHttp,
      '/api/social': townHttp,
      '/api/groups': townHttp,
      '/api/events': townHttp,
      '/api/profile': townHttp,
      '/api/moderation': townHttp,
      '/api/waitlist': townHttp,
      '/api/debug-reports': townHttp,
      '/multiplayer': { target: `ws://127.0.0.1:${townPort}`, ws: true },
    },
  },
  build: {
    outDir: '../dist/preview',
    emptyOutDir: true,
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules\/three/ }] } } },
  },
});
