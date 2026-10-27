#!/usr/bin/env node
// `pnpm run build:play`: the play entry alone, built into dist/play for a packaged
// host (#286), then its manifest and the exclusion check. The target is chosen by
// environment (preview/build-target.js), set here so the script is the same on
// every platform's shell.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUILD_TARGET_ENV } from '../preview/build-target.js';
import { main as manifest } from './play-bundle-manifest.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = spawnSync('pnpm', ['exec', 'vite', 'build', '--config', 'preview/vite.config.js'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, [BUILD_TARGET_ENV]: 'play' },
});
if (vite.status !== 0) process.exit(vite.status ?? 1);
process.exit(manifest(['--check', ...process.argv.slice(2)]));
