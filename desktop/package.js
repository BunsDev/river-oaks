import { buildWorldDesignPack } from '../scripts/studio-skill-pack.js';
import { packager } from '@electron/packager';
import { flipFuses, FuseV1Options } from '@electron/fuses';
import { DESKTOP_FUSES } from './fuses.js';
import { DESKTOP_FILES, DESKTOP_SHARED_FILES } from './package-files.js';
import { packagerOptions, packagedBinary } from './package-options.js';
import { APP_NAME } from './identity.js';
import { cp, mkdir, mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const stage = await mkdtemp(join(tmpdir(), 'river-oaks-package-'));
try {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  await mkdir(join(stage, 'desktop'));
  for (const file of DESKTOP_FILES) await cp(join(root, 'desktop', file), join(stage, 'desktop', file));
  for(const file of DESKTOP_SHARED_FILES){await mkdir(dirname(join(stage,file)),{recursive:true});await cp(join(root,file),join(stage,file));}
  await writeFile(join(stage, 'desktop/world-design-pack.json'), JSON.stringify(await buildWorldDesignPack(root)));
  await writeFile(join(stage, 'package.json'), JSON.stringify({ name: 'river-oaks', productName: APP_NAME, version: pkg.version, type: 'module', main: 'desktop/main.js' }));
  const paths = await packager(await packagerOptions({ root, stage, pkg, platform: process.platform, arch: process.arch }));
  // The packaged app launches only the explicitly configured designer executable; its
  // renderer is sandboxed. Turning off the Node entry points stops another local
  // program from running code as River Oaks (and inheriting its microphone or
  // other macOS permissions) via ELECTRON_RUN_AS_NODE, NODE_OPTIONS or
  // --inspect, and the app only runs from its integrity-checked asar.
  for (const path of paths) {
    const binary = packagedBinary(path, process.platform);
    // THROWAWAY (#371 fuse-drift proof, never merged): RunAsNode on, against desktop/fuses.js.
    await flipFuses(binary, { ...DESKTOP_FUSES, [FuseV1Options.RunAsNode]: true, resetAdHocDarwinSignature: process.platform === 'darwin' && process.arch === 'arm64' });
  }
  console.log(paths.join('\n'));
} finally { await rm(stage, { recursive: true, force: true }); }
