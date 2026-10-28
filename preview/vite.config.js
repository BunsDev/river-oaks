import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { sharedTownDevServer } from '../server/vite-town.js';
import { bridgeDevServer } from './vite-bridge.js';
import { buildInputs, buildOutDir, buildTarget } from './build-target.js';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

// Problem reports name the build they came from: the package version and the
// commit (Vercel provides it; local builds ask git).
const commit = process.env.VERCEL_GIT_COMMIT_SHA || (() => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); } catch { return 'unknown'; } })();
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
// `web` (default) builds the deployed site; `play` builds the play entry alone for a
// packaged host (preview/build-target.js). The build records which one it is.
const target = buildTarget();

const townPort = Number(process.env.RIVER_OAKS_DEV_TOWN_PORT ?? 8787);
if (!Number.isInteger(townPort) || townPort < 1 || townPort > 65535) throw new Error('RIVER_OAKS_DEV_TOWN_PORT must be a TCP port.');
const townHttp = `http://127.0.0.1:${townPort}`;

// VITE_* flags come from the repo-root .env files, the same files the shared town
// reads, rather than Vite's default of preview/. Acceptance runs read none, so a
// developer's local flags never change a journey; they pass flags in the environment.
const envDir = process.env.RIVER_OAKS_ACCEPTANCE_FIXTURE === '1' ? false : fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [sharedTownDevServer({ port: townPort }), bridgeDevServer()],
  define: { __RIVER_OAKS_BUILD__: JSON.stringify({ version, commit, target }) },
  root: fileURLToPath(new URL('.', import.meta.url)),
  envDir,
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
      '/api/blocks': townHttp,
      '/api/account': townHttp,
      '/api/events': townHttp,
      '/api/profile': townHttp,
      '/api/workos': townHttp,
      '/api/character': townHttp,
      '/api/office-desk': townHttp,
      '/api/cycling': townHttp,
      '/api/moderation': townHttp,
      '/api/waitlist': townHttp,
      '/api/debug-reports': townHttp,
      '/api/voice': townHttp,
      '/multiplayer': { target: `ws://127.0.0.1:${townPort}`, ws: true },
    },
  },
  build: {
    outDir: buildOutDir(target),
    emptyOutDir: true,
    rolldownOptions: { input: buildInputs(target, new URL('./', import.meta.url)), output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules\/three/ }, { name: 'livekit', test: /node_modules\/(livekit-client|@livekit)/ }] } } },
  },
});
