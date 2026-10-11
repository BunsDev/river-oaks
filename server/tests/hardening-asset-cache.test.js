// Hardening (bandwidth billing and load time): public models and textures may
// be cached by browsers, so a visit does not re-download them every time. Gated
// game code and data stay private and uncached.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const config = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url)));
// The /assets rules use a literal prefix followed by one regex group, which is
// how Vercel's path-to-regexp sources read here.
const rules = config.headers.filter(rule => rule.source.startsWith('/assets/') && rule.headers.some(header => header.key === 'Cache-Control'))
  .map(rule => ({pattern: new RegExp(`^/assets/${rule.source.slice('/assets/'.length)}$`), cache: rule.headers.find(header => header.key === 'Cache-Control').value}));
const cacheFor = path => { const matches = rules.filter(rule => rule.pattern.test(path));assert.equal(matches.length, 1, `${path} matches ${matches.length} cache rules`);return matches[0].cache; };

test('public binaries are browser-cacheable; game code, data and manifests are not', () => {
  for (const path of ['/assets/characters/jevica.glb', '/assets/landscape/sky.hdr', '/assets/materials/brick.jpg', '/assets/login/card.png'])
    assert.equal(cacheFor(path), 'public, max-age=3600, stale-while-revalidate=86400', path);
  for (const path of ['/assets/main-abc123.js', '/assets/index-abc123.js', '/assets/studio-abc123.css', '/assets/characters/sources.json', '/assets/landscape/README.md'])
    assert.equal(cacheFor(path), 'private, no-store', path);
  assert.equal(config.headers.find(rule => rule.source === '/data/(.*)').headers.find(header => header.key === 'Cache-Control').value, 'private, no-store');
});
