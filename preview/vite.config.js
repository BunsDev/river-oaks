import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
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
