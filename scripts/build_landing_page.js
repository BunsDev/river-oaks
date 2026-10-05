import { cp, mkdir } from 'node:fs/promises';

const game = new URL('../dist/preview/play/', import.meta.url);
await mkdir(game, { recursive: true });
await cp(new URL('../dist/preview/index.html', import.meta.url), new URL('index.html', game));
const target = new URL('../dist/preview/landing-page/', import.meta.url);
await mkdir(target, { recursive: true });
for (const file of ['index.html', 'styles.css', 'entry.js', 'assets']) {
  await cp(new URL(`../landing-page/${file}`, import.meta.url), new URL(file, target), { recursive: true });
}

await cp(new URL('index.html', target), new URL('../dist/preview/index.html', import.meta.url));
