import { packager } from '@electron/packager';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = await mkdtemp(join(tmpdir(), 'river-oaks-package-'));
try {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await mkdir(join(stage, 'desktop'));
  for (const file of ['main.js', 'runtime.js']) await cp(join(root, 'desktop', file), join(stage, 'desktop', file));
  await cp(join(root, 'dist/preview'), join(stage, 'dist/preview'), { recursive: true });
  await writeFile(join(stage, 'package.json'), JSON.stringify({ name: 'river-oaks', productName: 'River Oaks', version: pkg.version, type: 'module', main: 'desktop/main.js' }));
  const paths = await packager({ dir: stage, out: join(root, 'dist/desktop'), name: 'River Oaks', executableName: 'River Oaks', appBundleId: 'works.jev.river-oaks', appCategoryType: 'public.app-category.adventure-games', electronVersion: pkg.devDependencies.electron, platform: process.platform, arch: process.arch, asar: true, overwrite: true, prune: false });
  console.log(paths.join('\n'));
} finally { await rm(stage, { recursive: true, force: true }); }
