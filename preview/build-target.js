// Which site the preview Vite config builds. The default `web` target is the
// deployed site: the sign-in entry and the studio, with the landing page and
// the access-entry check added by `pnpm run build`. The `play` target is the
// play entry alone, written to its own directory, for a packaged host (#286:
// an iOS app bundle) that must carry no landing page, studio, dev proxy,
// Electron, Python or runtime state. Nothing here reads the environment at
// import time, so the config and the tests pass the environment in.
import { fileURLToPath } from 'node:url';

export const BUILD_TARGET_ENV = 'RIVER_OAKS_BUILD_TARGET';
export const BUILD_TARGETS = Object.freeze(['web', 'play']);

export function buildTarget(env = process.env) {
  const value = env[BUILD_TARGET_ENV];
  if (value === undefined || value === '') return 'web';
  if (BUILD_TARGETS.includes(value)) return value;
  throw new Error(`${BUILD_TARGET_ENV} must be one of ${BUILD_TARGETS.join(', ')}, not ${JSON.stringify(value)}.`);
}

// Rolldown inputs: the play target has only the play entry.
export function buildInputs(target, root = new URL('./', import.meta.url)) {
  const page = name => fileURLToPath(new URL(`./${name}.html`, root));
  if (target === 'play') return { index: page('index') };
  if (target === 'web') return { index: page('index'), studio: page('studio') };
  throw new Error(`Unknown build target ${JSON.stringify(target)}.`);
}

// Output directories, relative to preview/ as Vite resolves them.
export function buildOutDir(target) {
  if (target === 'play') return '../dist/play';
  if (target === 'web') return '../dist/preview';
  throw new Error(`Unknown build target ${JSON.stringify(target)}.`);
}
