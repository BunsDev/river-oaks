// Intake check for a new IPIC screening film (#501): a second short with dialogue and music.
//   node scripts/ipic-short/intake-check.mjs <candidate-dir>
// The directory holds the candidate's files and sources.candidate.json, an entry shaped like one in
// preview/public/assets/ipic/screening/sources.json plus the fields below. The check never encodes,
// uploads or publishes anything. It reads the files with ffprobe and ffmpeg (loudness), checks
// keyframes and MP4 fast start without a decoder, and writes intake-check.json beside them.
// A browser decode check (scripts/ipic-short/decode-check.mjs) is a separate step.
//
// The candidate's state is the weakest that applies:
//   draft                  a check failed, or a required record is missing
//   engineering-candidate  every file check passes; approval of these exact bytes is still missing
//   approved               Val's recorded approval names every file's SHA-256 and every check passes
// "published" is never decided here: registering the film in SCREENING_MEDIA and deploying it are
// separate, authorized steps (docs/screening-media-intake.md).
//
// Extra manifest fields (see docs/screening-media-intake.md):
//   audio: { dialogue: true, music: true }               what the film claims to carry
//   components: { footage, voices, music, likeness, credits }   provenance and permission per part
//   approvedFiles: { "<path>": "<sha256>", … }           the bytes Val approved, filled in only by that approval
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { keyframeTimes } from '../media-keyframes.mjs';

// Loudness targets for a short shown in a room with voice chat: speech-led programme loudness
// around -16 to -23 LUFS integrated, true peak no higher than -1 dBTP (no clipping in the encode).
export const AUDIO_RULES = Object.freeze({ silentBelowLufs: -50, quietBelowLufs: -27, loudAboveLufs: -12, maxTruePeakDbtp: -1, channels: 2, sampleRate: 48000 });
export const KEYFRAME_GAP_MS = 1050;
export const DURATION_TOLERANCE_MS = 60;
export const COMPONENTS = Object.freeze(['footage', 'voices', 'music', 'likeness', 'credits']);

// Cues as the panel and preview/tests/screening-media.test.js read them: text lines joined by a space.
export function parseVtt(text) {
  const time = value => { const parts = value.trim().split(':').map(Number); return parts.reduce((total, part) => total * 60 + part, 0); };
  return text.replace(/^\uFEFF/, '').split(/\r?\n\r?\n+/).slice(1).map(block => block.split(/\r?\n/))
    .filter(lines => !/^(NOTE|STYLE|REGION)\b/.test(lines[0]))
    .map(lines => { const at = lines.findIndex(line => line.includes('-->')); if (at < 0) return null;
      const [start, end] = lines[at].split('-->').map(part => time(part.trim().split(/\s+/)[0]));
      return { start, end, text: lines.slice(at + 1).join(' ').trim() }; })
    .filter(cue => cue?.text);
}

// The panel shows cue.text as plain text, so markup (<v>, <c>, <i>) would show literally. Speakers
// are named as "Name: words"; meaningful sounds and music go in square brackets or with ♪.
export function captionProblems(cues, { durationMs, transcript, audio = {} }) {
  const problems = [];
  if (!cues.length) problems.push('no caption cues');
  cues.forEach((cue, i) => {
    if (!(cue.end > cue.start)) problems.push(`cue ${i + 1} ends before it starts`);
    if (cue.end * 1000 > durationMs + DURATION_TOLERANCE_MS) problems.push(`cue ${i + 1} ends after the film`);
    if (i && cue.start < cues[i - 1].end - 0.001) problems.push(`cue ${i + 1} overlaps cue ${i}`);
    if (/<[^>]+>/.test(cue.text)) problems.push(`cue ${i + 1} has markup the panel would show literally`);
  });
  const speech = cues.filter(cue => /^[\p{Lu}][\p{L} .’'-]{0,30}:\s/u.test(cue.text)), sounds = cues.filter(cue => /\[[^\]]+\]|♪/.test(cue.text));
  if (audio.dialogue && !speech.length) problems.push('the film claims dialogue, but no cue names a speaker ("Name: …")');
  if (audio.music && !cues.some(cue => /♪|\[[^\]]*music[^\]]*\]/i.test(cue.text))) problems.push('the film claims music, but no cue describes it ("[music …]" or ♪)');
  if (!audio.dialogue && speech.length) problems.push('cues name speakers, but the manifest does not claim dialogue');
  if (JSON.stringify(cues.map(cue => cue.text)) !== JSON.stringify(transcript ?? [])) problems.push('caption cues differ from the transcript');
  return { problems, speakerCues: speech.length, soundCues: sounds.length };
}

// ffmpeg's ebur128 summary: integrated loudness (LUFS) and true peak (dBTP).
export function parseLoudness(stderr) {
  const summary = stderr.slice(stderr.lastIndexOf('Summary:'));
  const integrated = Number(/I:\s+(-?[\d.]+|-inf) LUFS/.exec(summary)?.[1]?.replace('-inf', '-Infinity'));
  const truePeak = Number(/Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(summary)?.[1]?.replace('-inf', '-Infinity'));
  return { integratedLufs: integrated, truePeakDbtp: truePeak };
}
export function audioProblems({ integratedLufs, truePeakDbtp, channels, sampleRate }, audio = {}) {
  const problems = [], notes = [];
  if (channels !== AUDIO_RULES.channels) problems.push(`${channels} audio channels; the screening mix is stereo`);
  if (sampleRate !== AUDIO_RULES.sampleRate) problems.push(`${sampleRate} Hz; expected ${AUDIO_RULES.sampleRate}`);
  const silent = !(integratedLufs >= AUDIO_RULES.silentBelowLufs);
  if ((audio.dialogue || audio.music) && silent) problems.push(`integrated loudness ${integratedLufs} LUFS: the track is silent, but the film claims ${audio.dialogue ? 'dialogue' : 'music'}`);
  if (truePeakDbtp > AUDIO_RULES.maxTruePeakDbtp) problems.push(`true peak ${truePeakDbtp} dBTP is above ${AUDIO_RULES.maxTruePeakDbtp} dBTP (clipping risk)`);
  if (!silent && integratedLufs < AUDIO_RULES.quietBelowLufs) notes.push(`integrated ${integratedLufs} LUFS is quiet for speech; listen before approving`);
  if (integratedLufs > AUDIO_RULES.loudAboveLufs) notes.push(`integrated ${integratedLufs} LUFS is loud next to voice chat; listen before approving`);
  return { problems, notes };
}

// Provenance per component, and Val's approval of these exact bytes.
export function recordProblems(manifest, files) {
  const problems = [];
  if (manifest.fixture !== false) problems.push('fixture must be false for a film people choose');
  if (!/^ipic-[a-z0-9-]+-v\d+$/.test(manifest.id ?? '')) problems.push(`id ${manifest.id} is not a new versioned ipic-…-vN id`);
  if (['ipic-original-v1', 'ipic-fixture-v1'].includes(manifest.id)) problems.push(`id ${manifest.id} already names another film`);
  for (const part of COMPONENTS) if (!manifest.components?.[part]) problems.push(`no ${part} record`);
  for (const part of COMPONENTS.filter(name => name !== 'credits')) {
    const record = manifest.components?.[part];
    if (record && !(record.source && record.permission)) problems.push(`${part} record needs a source and a permission`);
  }
  const approved = manifest.approvedFiles ?? null;
  const unapproved = files.filter(file => approved?.[file.path] !== file.sha256).map(file => file.path);
  return { problems, approved: Boolean(approved) && unapproved.length === 0, unapproved };
}

// MP4 fast start: the moov box precedes mdat, so playback can start before the whole file arrives.
export function mp4FastStart(buf) {
  for (let p = 0; p + 8 <= buf.length;) {
    let size = buf.readUInt32BE(p); const type = buf.toString('latin1', p + 4, p + 8);
    if (type === 'moov') return true;
    if (type === 'mdat') return false;
    if (size === 1) size = Number(buf.readBigUInt64BE(p + 8)); else if (size === 0) return false;
    p += size;
  }
  return false;
}
export const keyframeGaps = times => ({ first: times[0], widest: Math.max(0, ...times.slice(1).map((t, i) => t - times[i])) });

function probe(path) {
  return JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,profile,width,height,r_frame_rate,channels,sample_rate:format=duration', '-of', 'json', path], { encoding: 'utf8' }));
}
// ebur128 reports on stderr.
function loudnessOf(path) {
  const run = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', path, '-map', '0:a:0', '-af', 'ebur128=peak=true', '-f', 'null', '-'], { encoding: 'utf8' });
  return parseLoudness(run.stderr ?? '');
}

export function checkCandidate(dir) {
  const manifest = JSON.parse(readFileSync(join(dir, 'sources.candidate.json'), 'utf8'));
  const checks = [], problems = [], notes = [], media = [];
  const files = manifest.files ?? [];
  for (const file of files) {
    const path = join(dir, basename(file.path));
    if (!existsSync(path)) { problems.push(`${file.path}: missing`); continue; }
    const bytes = readFileSync(path), sha = createHash('sha256').update(bytes).digest('hex');
    if (bytes.length !== file.bytes || sha !== file.sha256) problems.push(`${file.path}: bytes or SHA-256 differ from the manifest`);
  }
  if (!problems.length) checks.push(`${files.length} files match the manifest's bytes and SHA-256`);
  const videos = files.filter(file => /\.(webm|mp4)$/.test(file.path));
  const kinds = videos.map(file => file.path.split('.').pop()).sort().join();
  if (kinds !== 'mp4,webm') problems.push(`expected one MP4 and one WebM of the same cut, found ${kinds || 'none'}`);
  for (const file of videos) {
    const path = join(dir, basename(file.path)); if (!existsSync(path)) continue;
    const kind = file.path.split('.').pop(), info = probe(path), buf = readFileSync(path);
    const video = info.streams.find(s => s.codec_type === 'video'), audioStream = info.streams.find(s => s.codec_type === 'audio');
    const want = kind === 'mp4' ? ['h264', 'aac'] : ['vp9', 'opus'];
    if (video?.codec_name !== want[0] || audioStream?.codec_name !== want[1]) problems.push(`${file.path}: ${video?.codec_name}/${audioStream?.codec_name}, expected ${want.join('/')}`);
    const durationMs = Math.round(Number(info.format.duration) * 1000);
    if (!(Math.abs(durationMs - file.durationMs) <= DURATION_TOLERANCE_MS)) problems.push(`${file.path}: lasts ${durationMs} ms, manifest ${file.durationMs}`);
    const gaps = keyframeGaps(keyframeTimes(buf, kind));
    if (!(gaps.first < 1000 && gaps.widest <= KEYFRAME_GAP_MS)) problems.push(`${file.path}: keyframes start at ${gaps.first} ms and are up to ${Math.round(gaps.widest)} ms apart (a keyframe every second is required)`);
    if (kind === 'mp4' && !mp4FastStart(buf)) problems.push(`${file.path}: moov after mdat; encode with -movflags +faststart`);
    const level = audioStream ? loudnessOf(path) : { integratedLufs: -Infinity, truePeakDbtp: -Infinity };
    const sound = audioProblems({ ...level, channels: audioStream?.channels, sampleRate: Number(audioStream?.sample_rate) }, manifest.audio);
    problems.push(...sound.problems.map(text => `${file.path}: ${text}`)); notes.push(...sound.notes.map(text => `${file.path}: ${text}`));
    media.push({ path: file.path, kind, width: video?.width, height: video?.height, frameRate: video?.r_frame_rate, profile: video?.profile, durationMs, audio: { codec: audioStream?.codec_name, channels: audioStream?.channels, sampleRate: Number(audioStream?.sample_rate), ...level }, keyframes: gaps });
  }
  if (media.length === 2) {
    const [a, b] = media;
    if (a.width !== b.width || a.height !== b.height || a.frameRate !== b.frameRate) problems.push(`the encodes differ in size or frame rate: ${a.width}x${a.height}@${a.frameRate} and ${b.width}x${b.height}@${b.frameRate}`);
    if (Math.abs(a.durationMs - b.durationMs) > DURATION_TOLERANCE_MS) problems.push(`the encodes differ in length: ${a.durationMs} and ${b.durationMs} ms`);
  }
  const vtt = files.find(file => file.path.endsWith('.vtt'));
  let captions = null;
  if (!vtt) problems.push('no WebVTT captions');
  else if (existsSync(join(dir, basename(vtt.path)))) {
    captions = captionProblems(parseVtt(readFileSync(join(dir, basename(vtt.path)), 'utf8')), { durationMs: media[0]?.durationMs ?? 0, transcript: manifest.transcript, audio: manifest.audio });
    problems.push(...captions.problems);
  }
  if (!files.some(file => /\.jpe?g$/.test(file.path))) problems.push('no poster');
  if (!manifest.audio?.dialogue || !manifest.audio?.music) problems.push('#501 needs a film with dialogue and music: manifest audio must claim both');
  const records = recordProblems(manifest, files);
  problems.push(...records.problems);
  const state = problems.length ? 'draft' : records.approved ? 'approved' : 'engineering-candidate';
  if (!problems.length) checks.push('codecs, durations, keyframes, fast start, stereo loudness, captions and records pass');
  if (!records.approved) notes.push(`awaiting Val's approval of the exact bytes: ${records.unapproved.join(', ') || 'no approvedFiles record'}`);
  return { id: manifest.id, state, checks, problems, notes, media, captions: captions && { speakerCues: captions.speakerCues, soundCues: captions.soundCues } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? '.');
  const result = { ...checkCandidate(dir), checkedAt: new Date().toISOString(), tools: execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0] };
  writeFileSync(join(dir, 'intake-check.json'), `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify({ id: result.id, state: result.state, problems: result.problems, notes: result.notes }, null, 2));
  process.exitCode = result.state === 'draft' ? 1 : 0;
}
