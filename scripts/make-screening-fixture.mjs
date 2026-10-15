#!/usr/bin/env node
// Regenerate the IPIC screening fixture (#367): a 30 s synthetic test pattern with a
// running counter and one beep a second, inside a thin black border, in WebM (VP9/Opus) and MP4 (H.264/AAC), plus
// its captions. Local ffmpeg only; no provider, no source footage, no likeness. The
// fixture stands in for #365's approved short in tests and is labelled as such.
//
//   node scripts/make-screening-fixture.mjs           # write files and sources.json
//   node scripts/make-screening-fixture.mjs --check   # verify every bundled film's hashes and durations
//
// Encoders are not bit-reproducible across ffmpeg builds, so --check verifies the committed
// bytes against sources.json and probes their duration; it does not re-encode.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'preview/public/assets/ipic/screening');
// Long enough for a late join, convergence and a pause in one journey.
const DURATION_S = 30;
// A 4 px black border: the player pillarboxes the film on IPIC's wide screen with clamped
// texture edges, so the border becomes the black bars.
const video = `testsrc=size=632x352:rate=24:duration=${DURATION_S},pad=640:360:4:4:black`;
const audio = `sine=frequency=660:beep_factor=4:sample_rate=48000:duration=${DURATION_S}`;
const outputs = [
  { file: 'fixture-v1.webm', type: 'video/webm; codecs="vp9, opus"', args: ['-c:v', 'libvpx-vp9', '-b:v', '160k', '-deadline', 'good', '-row-mt', '1', '-c:a', 'libopus', '-b:a', '48k'] },
  { file: 'fixture-v1.mp4', type: 'video/mp4; codecs="avc1.42E01E, mp4a.40.2"', args: ['-c:v', 'libx264', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p', '-b:v', '200k', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart'] },
];
// Captions carry the meaning without audio; the transcript repeats them.
const CUES = [
  [0, 10, 'Fixture clip: a test pattern for shared playback.'],
  [10, 20, 'A tone sounds once each second.'],
  [20, 30, 'This is not the IPIC screening short.'],
];
const stamp = s => `00:00:${String(s).padStart(2, '0')}.000`;
const vtt = `WEBVTT\n\n${CUES.map(([a, b, text], i) => `${i + 1}\n${stamp(a)} --> ${stamp(b)}\n${text}\n`).join('\n')}`;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const probe = path => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], { encoding: 'utf8' }).trim());

// sources.json lists every bundled film; this script owns only the fixture's entry.
const manifestPath = join(dir, 'sources.json');
if (process.argv.includes('--check')) {
  const { media } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  const files = media.flatMap(entry => entry.files);
  for (const item of files) {
    const bytes = readFileSync(join(root, item.path));
    if (sha256(bytes) !== item.sha256 || bytes.length !== item.bytes) throw new Error(`${item.path} does not match sources.json`);
    if (item.durationMs !== undefined && Math.abs(probe(join(root, item.path)) * 1000 - item.durationMs) > 60) throw new Error(`${item.path} duration differs from ${item.durationMs} ms`);
  }
  process.stdout.write(`screening media: ${files.length} files of ${media.length} films match sources.json\n`);
} else {
  mkdirSync(dir, { recursive: true });
  const files = [];
  for (const output of outputs) {
    const path = join(dir, output.file);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', video, '-f', 'lavfi', '-i', audio, ...output.args, '-t', String(DURATION_S), '-map_metadata', '-1', path]);
    const bytes = readFileSync(path);
    files.push({ path: relative(root, path), type: output.type, bytes: bytes.length, sha256: sha256(bytes), durationMs: Math.round(probe(path) * 1000) });
  }
  writeFileSync(join(dir, 'fixture-v1.en.vtt'), vtt);
  const captions = readFileSync(join(dir, 'fixture-v1.en.vtt'));
  files.push({ path: relative(root, join(dir, 'fixture-v1.en.vtt')), type: 'text/vtt', bytes: captions.length, sha256: sha256(captions) });
  const ffmpeg = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0];
  const fixture = {
    id: 'ipic-fixture-v1', label: 'Fixture clip (test pattern)', fixture: true,
    provenance: `Synthetic, generated locally by scripts/make-screening-fixture.mjs with ${ffmpeg}: lavfi testsrc and a sine beep. No source footage, voices, music, artwork or likeness.`,
    license: 'Original synthetic test signal; no third-party content.', approval: 'Test fixture only. Not the approved short (#365).',
    transcript: CUES.map(([, , text]) => text), files,
  };
  // Keep every other film's entry (the approved short) exactly as it is.
  // Only a missing manifest is a first run; a malformed one stops here rather than drop other films.
  // (The manifest before #365 was the fixture's entry alone.)
  let media = [];
  try {
    const saved = JSON.parse(readFileSync(manifestPath, 'utf8'));
    media = Array.isArray(saved.media) ? saved.media : saved.id ? [saved] : null;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (!Array.isArray(media)) throw new Error(`${relative(root, manifestPath)} has no media list`);
  media = media.some(entry => entry.id === fixture.id) ? media.map(entry => (entry.id === fixture.id ? fixture : entry)) : [...media, fixture];
  writeFileSync(manifestPath, `${JSON.stringify({ media }, null, 2)}\n`);
  process.stdout.write(`wrote ${files.length} files to ${relative(root, dir)}\n`);
}
