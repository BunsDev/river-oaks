import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SCREENING_MEDIA } from '../src/screening-contract.js';

// Every allowlisted film is bundled exactly as its manifest records (#365, #367): the server takes
// durationMs only from the allowlist, so it must match the files, and captions carry the film.
const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('preview/public/assets/ipic/screening/sources.json', root), 'utf8'));
const local = src => `preview/public${src}`;
const cueText = vtt => vtt.split(/\r?\n\r?\n/).slice(1).map(block => block.split(/\r?\n/).filter(line => line && !/^\d+$/.test(line) && !line.includes('-->')).join(' ')).filter(Boolean);

test('every allowlisted film has a manifest entry whose files match their bytes, hashes and types', () => {
  assert.deepEqual(manifest.media.map(entry => entry.id).sort(), Object.keys(SCREENING_MEDIA).sort());
  for (const media of Object.values(SCREENING_MEDIA)) {
    const entry = manifest.media.find(item => item.id === media.id), files = new Map(entry.files.map(file => [file.path, file]));
    for (const source of [...media.sources, { src: media.captions.src, type: 'text/vtt' }]) {
      const file = files.get(local(source.src));
      assert.ok(file, `${media.id}: ${source.src} is in sources.json`);
      assert.equal(file.type, source.type, `${source.src} type`);
      const bytes = readFileSync(new URL(file.path, root));
      assert.equal(bytes.length, file.bytes, `${file.path} bytes`);
      assert.equal(createHash('sha256').update(bytes).digest('hex'), file.sha256, `${file.path} SHA-256`);
      if (file.durationMs !== undefined) assert.ok(Math.abs(file.durationMs - media.durationMs) <= 60, `${file.path} lasts ${file.durationMs} ms, allowlisted ${media.durationMs} ms`);
    }
    assert.deepEqual(cueText(readFileSync(new URL(local(media.captions.src), root), 'utf8')), [...media.transcript], `${media.id}: captions equal the transcript`);
    assert.deepEqual(entry.transcript, [...media.transcript]);
    assert.ok(entry.provenance && entry.license && entry.approval, `${media.id}: provenance, license and approval are recorded`);
  }
});

test('the approved short records who approved it and what it shows', () => {
  const entry = manifest.media.find(item => item.id === 'ipic-original-v1');
  assert.equal(entry.fixture, false);
  assert.match(entry.approval, /Approved by Val Alexander on 2026-10-15/);
  assert.ok(entry.files.some(file => file.path.endsWith('ipic-original-v1-poster.jpg') && file.type === 'image/jpeg'));
  assert.match(entry.provenance, /OpenStreetMap/, 'the ODbL credit stays with the film');
});
