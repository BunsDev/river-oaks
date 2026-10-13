import { buildWorldDesignPack } from '../scripts/studio-skill-pack.js';
import { packager } from '@electron/packager';
import { flipFuses } from '@electron/fuses';
import { DESKTOP_FUSES } from './fuses.js';
import { DESKTOP_FILES } from './package-files.js';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = await mkdtemp(join(tmpdir(), 'river-oaks-package-'));
try {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await mkdir(join(stage, 'desktop'));
  for (const file of DESKTOP_FILES) await cp(join(root, 'desktop', file), join(stage, 'desktop', file));
  await mkdir(join(stage, 'scripts'));
  await cp(join(root, 'scripts/studio-skill-pack.js'), join(stage, 'scripts/studio-skill-pack.js'));
  await writeFile(join(stage, 'desktop/world-design-pack.json'), JSON.stringify(await buildWorldDesignPack(root)));
  await writeFile(join(stage, 'package.json'), JSON.stringify({ name: 'river-oaks', productName: 'TypeSafe Place', version: pkg.version, type: 'module', main: 'desktop/main.js' }));
  const paths = await packager({ dir: stage, out: join(root, 'dist/desktop'), name: 'TypeSafe Place', executableName: 'TypeSafe Place', appBundleId: 'works.jev.river-oaks', appCategoryType: 'public.app-category.adventure-games',
    // macOS shows this when the game first asks for the microphone (shared voice, only after Unmute).
    extendInfo: { NSMicrophoneUsageDescription: 'TypeSafe Place uses your microphone for voice chat with nearby residents, only after you choose to unmute.' }, electronVersion: pkg.devDependencies.electron, platform: process.platform, arch: process.arch, asar: true, overwrite: true, prune: false });
  // The packaged app launches only the explicitly configured designer executable; its
  // renderer is sandboxed. Turning off the Node entry points stops another local
  // program from running code as River Oaks (and inheriting its microphone or
  // other macOS permissions) via ELECTRON_RUN_AS_NODE, NODE_OPTIONS or
  // --inspect, and the app only runs from its integrity-checked asar.
  for (const path of paths) {
    const binary = process.platform === 'darwin' ? join(path, 'TypeSafe Place.app') : join(path, process.platform === 'win32' ? 'TypeSafe Place.exe' : 'TypeSafe Place');
    await flipFuses(binary, { ...DESKTOP_FUSES, resetAdHocDarwinSignature: process.platform === 'darwin' && process.arch === 'arm64' });
  }
  console.log(paths.join('\n'));
} finally { await rm(stage, { recursive: true, force: true }); }
