import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Temporary self-contained build for the CT Club walk-around viewer. Root is the
// viewer's own app/ folder so the output is just the game page; the club code is
// imported from ../src (ct-club/src). Output -> ct-club/dist.
export default defineConfig({
  root: fileURLToPath(new URL('./app/', import.meta.url)),
  base: './',
  server: { host: '127.0.0.1', open: false },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    minify: 'oxc',
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
