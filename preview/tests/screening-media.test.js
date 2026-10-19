import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { SCREENING_MEDIA } from '../src/screening-contract.js';
import { keyframeTimes } from '../../scripts/media-keyframes.mjs';

// Every allowlisted film is bundled exactly as its manifest records (#365, #367): the server takes
// durationMs only from the allowlist, so it must match the files, and captions carry the film.
const root = new URL('../../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('preview/public/assets/ipic/screening/sources.json', root), 'utf8'));
const local = src => `preview/public${src}`;
// A cue's text is every line after its timing line; NOTE, STYLE and REGION blocks are not cues.
const cueText = vtt => vtt.replace(/^\uFEFF/, '').split(/\r?\n\r?\n+/).slice(1).map(block => block.split(/\r?\n/))
  .filter(lines => !/^(NOTE|STYLE|REGION)\b/.test(lines[0])).map(lines => lines.slice(lines.findIndex(line => line.includes('-->')) + 1).join(' ').trim()).filter(Boolean);

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

test('the second short records who approved which files, and what it carries', () => {
  const entry = manifest.media.find(item => item.id === 'ipic-two-seats-v1');
  assert.equal(entry.fixture, false);
  assert.match(entry.approval, /Approved by Val Alexander on 2026-10-19 \(#501\)/);
  assert.deepEqual(entry.audio, { dialogue: true, music: true });
  assert.equal(entry.approvedItems.length, 5);
  assert.ok(entry.approvedItems.every(item => /Approved by Val Alexander on 2026-10-19/.test(item)));
  // The approval names these exact files: each approved prefix matches the committed file's SHA-256.
  for (const [suffix, prefix] of [['.webm', '24f08a74'], ['.mp4', '85b1079e'], ['.en.vtt', '2a6b54e0'], ['-poster.jpg', '2e53991c']]) {
    const file = entry.files.find(item => item.path.endsWith(`ipic-two-seats-v1${suffix}`));
    assert.ok(file && file.sha256.startsWith(prefix) && entry.approval.includes(prefix), `${suffix}: the approved bytes`);
  }
  assert.doesNotMatch(JSON.stringify(entry), /Pending/, 'no pending approval is left in the record');
});

test('the caption parser reads cue text only, whatever the cue ids and comment blocks', () => {
  const vtt = 'WEBVTT\n\nNOTE written for the cut\n\n1\n00:00:00.200 --> 00:00:05.000\n1999\n\nintro\n00:00:05.000 --> 00:00:07.000\nTwo lines,\none cue.\n';
  assert.deepEqual(cueText(vtt), ['1999', 'Two lines, one cue.']);
});

// A seek decodes from the keyframe before its target. The approved short was first published with
// keyframes up to 6 s apart, so a loaded viewer's seek froze the film for over a second; an A/B
// (2026-10-16) with a keyframe every second removed every post-convergence spike.
test('the keyframe reader agrees with ffprobe on the bundled fixture', () => {
  const read = name => keyframeTimes(readFileSync(new URL(`preview/public/assets/ipic/screening/${name}`, root)), name.split('.').pop());
  assert.deepEqual([read('fixture-v1.webm').length, read('fixture-v1.mp4').length], [6, 3]);
  assert.equal(read('fixture-v1.webm')[0], 0);
});

test('every approved film has a keyframe at least every second in each format', () => {
  for (const entry of manifest.media.filter(item => !item.fixture)) {
    for (const file of entry.files.filter(f => /\.(webm|mp4)$/.test(f.path))) {
      const times = keyframeTimes(readFileSync(new URL(file.path, root)), file.path.split('.').pop());
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      assert.ok(times[0] < 1 && Math.max(...gaps) <= 1050, `${file.path}: ${times.length} keyframes, widest gap ${Math.round(Math.max(...gaps))} ms`);
    }
  }
});
