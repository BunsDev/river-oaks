import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { sharedTownDevServer } from '../server/vite-town.js';

const townPort = Number(process.env.RIVER_OAKS_DEV_TOWN_PORT ?? 8787);
if (!Number.isInteger(townPort) || townPort < 1 || townPort > 65535) throw new Error('RIVER_OAKS_DEV_TOWN_PORT must be a TCP port.');
const townHttp = `http://127.0.0.1:${townPort}`;

export default defineConfig({
  plugins: [sharedTownDevServer({ port: townPort })],
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
      '/api/profile': townHttp,
      '/api/moderation': townHttp,
      '/api/waitlist': townHttp,
      '/multiplayer': { target: `ws://127.0.0.1:${townPort}`, ws: true },
      '/v1': 'http://127.0.0.1:8765',
      '/health': 'http://127.0.0.1:8765',
    },
  },
  build: {
    outDir: '../dist/preview',
    emptyOutDir: true,
    rolldownOptions: { output: { codeSplitting: { groups: [{ name: 'three', test: /node_modules\/three/ }] } } },
  },
});
