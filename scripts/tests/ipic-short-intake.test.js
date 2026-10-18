import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { audioProblems, captionProblems, checkCandidate, mp4FastStart, parseLoudness, parseVtt, recordProblems } from '../ipic-short/intake-check.mjs';

// The intake check for #501's second short. Synthetic candidates are built in a temporary
// directory for the test and never kept; nothing here is a film anyone approved.
const root = new URL('../../', import.meta.url);
const hasFfmpeg = (() => { try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); execFileSync('ffprobe', ['-version'], { stdio: 'ignore' }); return true; } catch { return false; } })();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const COMPONENTS = { footage: { source: 'runtime capture', permission: 'project' }, voices: { source: 'cast', permission: 'consent' }, music: { source: 'composer', permission: 'licence' }, likeness: { source: 'committed avatars', permission: 'approval' }, credits: ['cast'] };

test('captions follow the panel’s rules: plain speaker labels, described sounds, no markup', () => {
  const cues = parseVtt('WEBVTT\n\n1\n00:00:00.500 --> 00:00:02.000\n[Soft piano music]\n\n2\n00:00:02.000 --> 00:00:04.500\nJevica: Two seats,\none screen.\n');
  assert.deepEqual(cues, [{ start: 0.5, end: 2, text: '[Soft piano music]' }, { start: 2, end: 4.5, text: 'Jevica: Two seats, one screen.' }]);
  const ok = captionProblems(cues, { durationMs: 5000, transcript: cues.map(cue => cue.text), audio: { dialogue: true, music: true } });
  assert.deepEqual([ok.problems, ok.speakerCues, ok.soundCues], [[], 1, 1]);
  const marked = parseVtt('WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n<v Jevica>Hello</v>\n');
  assert.match(captionProblems(marked, { durationMs: 2000, transcript: ['<v Jevica>Hello</v>'], audio: { dialogue: true } }).problems.join(), /markup the panel would show literally/);
  const silent = captionProblems([{ start: 0, end: 1, text: 'Westheimer Road.' }], { durationMs: 2000, transcript: ['Westheimer Road.'], audio: { dialogue: true, music: true } }).problems.join('; ');
  assert.match(silent, /no cue names a speaker/);
  assert.match(silent, /no cue describes it/);
  assert.match(captionProblems(cues, { durationMs: 3000, transcript: [], audio: { dialogue: true, music: true } }).problems.join(), /ends after the film.*differ from the transcript|differ from the transcript/);
});

test('loudness: a silent track cannot pass as dialogue or music, and peaks must leave headroom', () => {
  const report = 'blah\n[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -18.4 LUFS\n  True peak:\n    Peak:       -2.1 dBFS\n';
  assert.deepEqual(parseLoudness(report), { integratedLufs: -18.4, truePeakDbtp: -2.1 });
  assert.deepEqual(parseLoudness('Summary:\n I: -inf LUFS\n Peak: -inf dBFS').integratedLufs, -Infinity);
  assert.deepEqual(audioProblems({ integratedLufs: -18.4, truePeakDbtp: -2.1, channels: 2, sampleRate: 48000 }, { dialogue: true, music: true }), { problems: [], notes: [] });
  assert.match(audioProblems({ integratedLufs: -Infinity, truePeakDbtp: -Infinity, channels: 2, sampleRate: 48000 }, { dialogue: true }).problems.join(), /silent, but the film claims dialogue/);
  assert.match(audioProblems({ integratedLufs: -14, truePeakDbtp: 0.3, channels: 1, sampleRate: 44100 }, { music: true }).problems.join('; '), /1 audio channels.*44100 Hz.*clipping/);
});

test('records: a new versioned id, provenance per part, and approval of these exact bytes', () => {
  const files = [{ path: 'a.mp4', sha256: 'aa' }, { path: 'a.vtt', sha256: 'bb' }];
  const base = { id: 'ipic-second-short-v1', fixture: false, components: COMPONENTS };
  assert.deepEqual(recordProblems(base, files), { problems: [], approved: false, unapproved: ['a.mp4', 'a.vtt'] });
  assert.equal(recordProblems({ ...base, approvedFiles: { 'a.mp4': 'aa', 'a.vtt': 'bb' } }, files).approved, true);
  assert.deepEqual(recordProblems({ ...base, approvedFiles: { 'a.mp4': 'aa', 'a.vtt': 'old' } }, files).unapproved, ['a.vtt'], 'a recut needs its own approval');
  const reused = recordProblems({ ...base, id: 'ipic-original-v1', fixture: true, components: { footage: { source: 'x' } } }, files).problems.join('; ');
  for (const text of [/fixture must be false/, /already names another film/, /footage record needs a source and a permission/, /no music record/]) assert.match(reused, text);
});

test('the approved silent short and the fixture are not a second film with dialogue and music', { skip: !hasFfmpeg && 'ffmpeg and ffprobe are not installed' }, () => {
  const sources = JSON.parse(readFileSync(new URL('preview/public/assets/ipic/screening/sources.json', root), 'utf8'));
  for (const entry of sources.media) {
    const dir = mkdtempSync(join(tmpdir(), 'ipic-intake-'));
    try {
      for (const file of entry.files) copyFileSync(new URL(file.path, root), join(dir, file.path.split('/').pop()));
      writeFileSync(join(dir, 'sources.candidate.json'), JSON.stringify({ ...entry, audio: { dialogue: true, music: true }, components: COMPONENTS }));
      const result = checkCandidate(dir);
      assert.equal(result.state, 'draft', entry.id);
      const problems = result.problems.join('; ');
      if (entry.id === 'ipic-original-v1') assert.match(problems, /silent, but the film claims dialogue.*|no cue names a speaker/);
      else assert.match(problems, /fixture must be false/);
      assert.match(problems, /already names another film/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
});

test('a synthetic candidate with stereo sound passes as an engineering candidate, and as approved only with matching hashes', { skip: !hasFfmpeg && 'ffmpeg and ffprobe are not installed' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'ipic-intake-'));
  try {
    const run = args => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    const video = ['-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24:duration=3'];
    const sound = ['-f', 'lavfi', '-i', 'sine=frequency=220:sample_rate=48000:duration=3', '-f', 'lavfi', '-i', 'sine=frequency=330:sample_rate=48000:duration=3', '-filter_complex', '[1][2]join=inputs=2:channel_layout=stereo,volume=-12dB[a]', '-map', '0:v', '-map', '[a]'];
    run([...video, ...sound, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-g', '24', '-c:a', 'aac', '-movflags', '+faststart', '-t', '3', join(dir, 'c.mp4')]);
    run([...video, ...sound, '-c:v', 'libvpx-vp9', '-deadline', 'realtime', '-g', '24', '-c:a', 'libopus', '-t', '3', join(dir, 'c.webm')]);
    run(['-f', 'lavfi', '-i', 'testsrc2=size=640x360', '-frames:v', '1', join(dir, 'c.jpg')]);
    const transcript = ['[Two tones, as music]', 'Test Voice: A synthetic line for the check.'];
    writeFileSync(join(dir, 'c.vtt'), `WEBVTT\n\n00:00:00.100 --> 00:00:01.400\n${transcript[0]}\n\n00:00:01.500 --> 00:00:02.900\n${transcript[1]}\n`);
    const probeMs = name => Math.round(Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', join(dir, name)], { encoding: 'utf8' })) * 1000);
    const files = ['c.webm', 'c.mp4', 'c.vtt', 'c.jpg'].map(name => { const bytes = readFileSync(join(dir, name));
      return { path: `preview/public/assets/ipic/screening/${name}`, type: name, bytes: bytes.length, sha256: sha256(bytes), ...(/\.(webm|mp4)$/.test(name) ? { durationMs: probeMs(name) } : {}) }; });
    const manifest = { id: 'ipic-synthetic-check-v1', label: 'Synthetic intake check', fixture: false, audio: { dialogue: true, music: true }, components: COMPONENTS, transcript, files };
    writeFileSync(join(dir, 'sources.candidate.json'), JSON.stringify(manifest));
    const candidate = checkCandidate(dir);
    assert.deepEqual([candidate.state, candidate.problems], ['engineering-candidate', []], JSON.stringify(candidate.problems));
    assert.equal(candidate.media.length, 2);
    assert.ok(candidate.media.every(item => item.audio.channels === 2 && item.audio.integratedLufs > -50 && item.keyframes.widest <= 1050), JSON.stringify(candidate.media));
    assert.equal(mp4FastStart(readFileSync(join(dir, 'c.mp4'))), true);
    writeFileSync(join(dir, 'sources.candidate.json'), JSON.stringify({ ...manifest, approvedFiles: Object.fromEntries(files.map(file => [file.path, file.sha256])) }));
    assert.equal(checkCandidate(dir).state, 'approved');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
