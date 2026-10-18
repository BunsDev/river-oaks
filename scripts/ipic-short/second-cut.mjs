// Cuts and mixes the second short (#501, "Two Seats, One Screen") into its delivery files, with
// sources.candidate.json for scripts/ipic-short/intake-check.mjs. Approval is pending until Val approves
// these exact bytes; nothing here commits, registers or publishes the film.
//   node scripts/ipic-short/second-cut.mjs <capture-dir> <voices-dir> <score.wav> <out-dir>
// The capture is second-capture.mjs's raw.webm and shots.json; the voices are second-voices.py's; the score is
// second-score.mjs's. The mix ducks the music under speech and is normalised to about -18 LUFS, -1.5 dBTP.
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { takeProblems } from './shot-health.mjs';

const [capture, voicesDir, scoreWav, out] = process.argv.slice(2).map(p => resolve(p));
const here = dirname(fileURLToPath(import.meta.url));
const script = JSON.parse(readFileSync(join(here, 'second-short.json'), 'utf8'));
const { shots: captured, browser, renderer, recordedAt, sourceRevision } = JSON.parse(readFileSync(join(capture, 'shots.json'), 'utf8'));
// Only a healthy take is cut (shot-health.mjs): one recorded while the town dropped or the page stalled is refused.
const unusable = takeProblems(captured);
if (unusable.length) { console.error(`This take cannot be cut: ${unusable.join('; ')}`); process.exit(1); }
const { lines, model } = JSON.parse(readFileSync(join(voicesDir, 'voices.json'), 'utf8'));
const id = script.id, run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 26 }).toString();
mkdirSync(out, { recursive: true });

// The edit: each shot keeps the last `seconds` of its captured window (the lead-in settles the camera).
let at = 0;
const parts = script.shots.map(shot => { const take = captured.find(s => s.id === shot.id); const part = { ...shot, from: Math.max(take.start, take.end - shot.seconds), to: take.end, cutAt: at }; at += part.to - part.from; return part; });
const total = at, startOf = shotId => parts.find(p => p.id === shotId).cutAt;
const video = parts.map((p, i) => `[0:v]trim=start=${p.from.toFixed(3)}:end=${p.to.toFixed(3)},setpts=PTS-STARTPTS,fps=24,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black[v${i}]`).join(';')
  + `;${parts.map((_, i) => `[v${i}]`).join('')}concat=n=${parts.length}:v=1:a=0[v]`;

// The mix: dialogue at its cue times, the score ducked under it, then loudness-normalised in two passes.
// MUSIC_WEIGHT is the bed's level against the voices before ducking; speech should stay about 10 dB clear.
const MUSIC_WEIGHT = Number(process.env.MUSIC_WEIGHT ?? 0.45);
const placed = lines.map(line => ({ ...line, time: startOf(line.shot) + line.at }));
const inputs = ['-i', scoreWav, ...placed.flatMap(line => ['-i', join(voicesDir, line.file)])];
const dialogue = placed.map((line, i) => `[${i + 1}:a]aresample=48000,pan=stereo|c0=c0|c1=c0,adelay=${Math.round(line.time * 1000)}|${Math.round(line.time * 1000)}[d${i}]`).join(';');
const mixGraph = `[0:a]atrim=0:${total.toFixed(3)},asetpts=PTS-STARTPTS[music];${dialogue};${placed.map((_, i) => `[d${i}]`).join('')}amix=inputs=${placed.length}:normalize=0:duration=longest,apad=whole_dur=${total.toFixed(3)}[talk];`
  + `[talk]asplit=2[talkmix][talkkey];[music][talkkey]sidechaincompress=threshold=0.015:ratio=6:attack=20:release=600:makeup=1[ducked];`
  + `[talkmix][ducked]amix=inputs=2:normalize=0:weights=1 ${MUSIC_WEIGHT}:duration=first,atrim=0:${total.toFixed(3)}[mix]`;
const mixed = join(out, 'mix.wav');
run('ffmpeg', ['-hide_banner', '-y', ...inputs, '-filter_complex', mixGraph, '-map', '[mix]', '-ar', '48000', '-ac', '2', mixed]);
// loudnorm reports its measurement as JSON on stderr.
const report = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', mixed, '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11:print_format=json', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
const measured = JSON.parse(report.slice(report.lastIndexOf('{'), report.lastIndexOf('}') + 1));
const final = join(out, 'final.wav');
run('ffmpeg', ['-hide_banner', '-y', '-i', mixed, '-af', `loudnorm=I=-18:TP=-1.5:LRA=11:measured_I=${measured.input_i}:measured_TP=${measured.input_tp}:measured_LRA=${measured.input_lra}:measured_thresh=${measured.input_thresh}:offset=${measured.target_offset}:linear=true`, '-ar', '48000', '-ac', '2', final]);

// Two-pass encodes, a keyframe every second (#472), as cut.mjs makes the first short's.
const common = ['-y', '-i', join(capture, 'raw.webm'), '-i', final, '-filter_complex', video, '-map', '[v]', '-map', '1:a', '-t', total.toFixed(3)];
const log = join(out, 'pass'), twoPass = (v, a, file) => {
  run('ffmpeg', [...common, ...v, '-pass', '1', '-passlogfile', log, '-an', '-f', 'null', '/dev/null']);
  run('ffmpeg', [...common, ...v, '-pass', '2', '-passlogfile', log, ...a, file]);
};
const KEYFRAMES = ['-g', '24', '-keyint_min', '24'];
twoPass(['-c:v', 'libvpx-vp9', '-b:v', '1500k', '-row-mt', '1', '-deadline', 'good', ...KEYFRAMES], ['-c:a', 'libopus', '-b:a', '128k'], join(out, `${id}.webm`));
twoPass(['-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-b:v', '2000k', ...KEYFRAMES, '-sc_threshold', '0'], ['-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart'], join(out, `${id}.mp4`));
for (const name of readdirSync(out)) if (name.startsWith('pass')) rmSync(join(out, name));

// Captions: speakers named in plain text, sounds in brackets (docs/screening-media-intake.md); no overlaps.
const events = script.cues.map(cue => ({ time: startOf(cue.shot) + cue.at, text: cue.line ? `${cue.speaker}: ${cue.line}` : cue.sound,
  length: cue.line ? placed.find(line => line.text === cue.line).durationS + 0.5 : 2.6 })).sort((a, b) => a.time - b.time);
const stamp = s => new Date(s * 1000).toISOString().slice(11, 23);
const cues = events.map((event, i) => ({ start: event.time, end: Math.min(event.time + event.length, (events[i + 1]?.time ?? total) - 0.05, total - 0.1), text: event.text }));
writeFileSync(join(out, `${id}.en.vtt`), `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n')}`);
writeFileSync(join(out, `${id}.transcript.txt`), `${script.title}\n\n${cues.map(c => c.text).join('\n')}\n`);
const poster = startOf('two-shot') + 6;
run('ffmpeg', ['-y', '-ss', poster.toFixed(2), '-i', join(out, `${id}.mp4`), '-frames:v', '1', '-q:v', '3', join(out, `${id}-poster.jpg`)]);

const probe = file => Number(JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file])).format.duration);
const TYPES = { webm: 'video/webm; codecs="vp9, opus"', mp4: 'video/mp4; codecs="avc1.4D401F, mp4a.40.2"', vtt: 'text/vtt', jpg: 'image/jpeg' };
const files = [`${id}.webm`, `${id}.mp4`, `${id}.en.vtt`, `${id}-poster.jpg`].map(name => {
  const bytes = readFileSync(join(out, name));
  return { path: `preview/public/assets/ipic/screening/${name}`, type: TYPES[name.split('.').pop()], bytes: statSync(join(out, name)).size, sha256: createHash('sha256').update(bytes).digest('hex'),
    ...(/\.(webm|mp4)$/.test(name) ? { durationMs: Math.round(probe(join(out, name)) * 1000) } : {}) };
});
const voices = Object.entries(script.characters).map(([name, c]) => `${name}: ${c.voice}`).join(', ');
writeFileSync(join(out, 'sources.candidate.json'), `${JSON.stringify({
  id, label: script.title, fixture: false, audio: { dialogue: true, music: true },
  provenance: `Runtime capture of River Oaks only, from commit ${sourceRevision}: headless Chromium ${browser} with Metal ANGLE (${renderer}), recorded ${recordedAt} by scripts/ipic-short/second-capture.mjs and cut and mixed by scripts/ipic-short/second-cut.mjs. Inside the IPIC auditorium only. Dialogue rendered locally with ${model} (${voices}); music synthesised by scripts/ipic-short/second-score.mjs. No external footage, recordings, samples or paid services.`,
  license: 'Pending Val\'s approval: the project\'s own runtime capture, original synthesised music, and synthetic Kokoro voices (Apache-2.0 model weights).',
  approval: 'Pending (#501). Not allowlisted, not committed, not published.',
  components: {
    footage: { source: `In-game runtime capture (${captured.length} shots, auditorium only), scripts/ipic-short/second-capture.mjs at ${sourceRevision}`, permission: 'The project\'s own runtime; the auditorium interior as committed. What it shows needs Val\'s approval.' },
    voices: { source: `${model}: ${voices}`, permission: 'Apache-2.0 model weights, local inference; synthetic voices, not any person\'s' },
    music: { source: 'scripts/ipic-short/second-score.mjs (original, synthesised; F major, 84 bpm)', permission: 'The project\'s own composition' },
    likeness: { source: `Committed characters worn by the browser fixture accounts: ${Object.entries(script.characters).map(([name, cast]) => `${name}: ${cast.appearance}`).join('; ')}. Fictional characters`, permission: 'Pending Val\'s approval of each likeness shown' },
    credits: ['Footage, edit and score: River Oaks runtime and scripts/ipic-short', `Voices: Kokoro-82M (${voices})`],
  },
  transcript: cues.map(c => c.text), files,
}, null, 2)}\n`);
console.log(JSON.stringify({ totalS: +total.toFixed(2), loudness: { inputI: measured.input_i, inputTP: measured.input_tp }, cues: cues.length, files: files.map(f => [f.path.split('/').pop(), f.bytes, f.durationMs ?? null]) }, null, 2));
