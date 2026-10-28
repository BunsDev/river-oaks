#!/usr/bin/env node
// The manifest of a play-only build (RIVER_OAKS_BUILD_TARGET=play, dist/play):
// every file with its size, SHA-256 and how the deployed site treats the same
// path: whether the asset gate (server/game-assets.js, middleware.js) serves it
// only to an approved account, and which Cache-Control vercel.json gives it.
// A packaged host (#286) ships these files inside an app bundle, so the
// manifest is what an archive inspection compares against, and what the asset
// classification (docs/ios-bundle-assets.md) is derived from.
//
// `--check` refuses a bundle that carries anything a packaged play client must
// not: the landing page, the studio, Electron or Python sources, runtime state,
// environment files, or a dev proxy target baked into a chunk.
//
//   node scripts/play-bundle-manifest.mjs [dir] [--out <file>] [--check]
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, posix, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { protectedGameAsset } from '../server/game-assets.js';

const repository = fileURLToPath(new URL('../', import.meta.url));

// vercel.json's Cache-Control rules, in order; a later matching rule overrides an
// earlier one, as the platform applies them. Sources are path patterns whose
// groups are regular expressions, so they are tested as anchored regular expressions.
export function cacheRules(config = JSON.parse(readFileSync(join(repository, 'vercel.json'), 'utf8'))) {
  const rules = [];
  for (const entry of config.headers ?? []) {
    const header = (entry.headers ?? []).find(h => h.key.toLowerCase() === 'cache-control');
    if (header) rules.push({ source: new RegExp(`^${entry.source}$`), value: header.value });
  }
  return rules;
}

export function cachePolicy(path, rules) {
  let value = null;
  for (const rule of rules) if (rule.source.test(path)) value = rule.value;
  return value;
}

// How the deployed site serves a bundle path. `gated` follows the asset gate
// exactly; `cache` is vercel.json's Cache-Control for it, or null when no rule
// names it (HTML and fonts: the platform default, revalidated).
export function classifyPath(path, rules = cacheRules()) {
  return { gated: protectedGameAsset(path), cache: cachePolicy(path, rules) };
}

// Paths a packaged play client must not carry.
const EXCLUDED = [
  { reason: 'landing page', test: path => path.startsWith('/landing-page/') },
  { reason: 'studio', test: path => path === '/studio.html' || path === '/studio' || /^\/assets\/studio-[a-z0-9_-]+\.(?:js|css)$/i.test(path) },
  { reason: 'Electron', test: path => path.startsWith('/desktop/') || /electron/i.test(path) },
  { reason: 'Python', test: path => /\.py$/i.test(path) || path.startsWith('/src/river_oaks/') },
  { reason: 'runtime state', test: path => path.startsWith('/.runtime/') },
  { reason: 'environment file', test: path => /^\/(?:.*\/)?\.env(?:\.|$)/.test(path) },
  { reason: 'server source', test: path => path.startsWith('/server/') || path.startsWith('/api/') },
  { reason: 'source map', test: path => /\.map$/i.test(path) },
];
export function excludedReason(path) {
  return EXCLUDED.find(rule => rule.test(path))?.reason ?? null;
}

// Dev-only targets that must not survive into a packaged client. The Vite dev
// proxy forwards /api and /multiplayer to the shared town on this port; a built
// client reaches the deployed origin by relative URLs instead.
const DEV_TARGETS = ['127.0.0.1:8787', 'localhost:8787', 'RIVER_OAKS_DEV_TOWN_PORT', 'ws://127.0.0.1:'];
export function devTargetsIn(text) {
  return DEV_TARGETS.filter(target => text.includes(target));
}

const TEXT = /\.(?:js|mjs|css|html|json|vtt|txt|md|svg)$/i;

function walk(dir, base = dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, base, out);
    else if (entry.isFile()) out.push('/' + relative(base, full).split('\\').join('/'));
  }
  return out;
}

export function buildManifest(dir, { rules = cacheRules() } = {}) {
  const root = resolve(dir);
  const files = [], problems = [];
  for (const path of walk(root)) {
    const bytes = readFileSync(join(root, path));
    const { gated, cache } = classifyPath(path, rules);
    files.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), gated, cache });
    const reason = excludedReason(path);
    if (reason) problems.push({ path, problem: reason });
    if (TEXT.test(path)) for (const target of devTargetsIn(bytes.toString('utf8'))) problems.push({ path, problem: `dev target ${target}` });
  }
  if (!files.some(f => f.path === '/index.html')) problems.push({ path: '/index.html', problem: 'missing play entry' });
  if (!files.some(f => /^\/assets\/index-[a-z0-9_-]+\.js$/i.test(f.path))) problems.push({ path: '/assets/index-*.js', problem: 'missing access entry chunk' });
  const totals = { files: files.length, bytes: 0, gated: { files: 0, bytes: 0 }, cache: {} };
  for (const file of files) {
    totals.bytes += file.bytes;
    if (file.gated) { totals.gated.files++; totals.gated.bytes += file.bytes; }
    const key = file.cache ?? 'default';
    totals.cache[key] ??= { files: 0, bytes: 0 };
    totals.cache[key].files++; totals.cache[key].bytes += file.bytes;
  }
  return { target: 'play', files, totals, problems };
}

export function main(argv = process.argv.slice(2)) {
  let dir = join(repository, 'dist', 'play'), out = join(repository, 'dist', 'play-manifest.json'), check = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--out') out = resolve(argv[++i]);
    else if (argv[i] === '--check') check = true;
    else if (argv[i].startsWith('--')) throw new Error(`Unknown option ${argv[i]}`);
    else dir = resolve(argv[i]);
  }
  const manifest = buildManifest(dir);
  writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
  const mib = bytes => (bytes / 1048576).toFixed(1);
  console.log(`Play bundle: ${manifest.totals.files} files, ${mib(manifest.totals.bytes)} MiB; gated on the deployed site: ${manifest.totals.gated.files} files, ${mib(manifest.totals.gated.bytes)} MiB. Manifest: ${posix.normalize(out)}`);
  if (check && manifest.problems.length) {
    console.error(`The play bundle carries files a packaged client must not:\n${manifest.problems.map(p => `  ${p.path}: ${p.problem}`).join('\n')}`);
    return 1;
  }
  return 0;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) process.exit(main());
