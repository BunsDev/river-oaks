import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { sharedTownDevServer } from '../server/vite-town.js';

export default defineConfig({
  plugins: [sharedTownDevServer()],
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/auth': 'http://127.0.0.1:8787',
      '/api/multiplayer': 'http://127.0.0.1:8787',
      '/api/moderation': 'http://127.0.0.1:8787',
      '/multiplayer': { target: 'ws://127.0.0.1:8787', ws: true },
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
