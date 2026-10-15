// Cuts a capture into #365's delivery formats, with sources.candidate.json (approval pending until
// Val approves; candidate 1's approved entry is in preview/public/assets/ipic/screening/sources.json).
//   node <this file> <capture-dir> <source-commit>
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [dir, commit] = [resolve(process.argv[2]), process.argv[3]];
const { shots, browser, renderer, recordedAt } = JSON.parse(readFileSync(join(dir, 'shots.json'), 'utf8'));
const id = 'ipic-original-v1', raw = join(dir, 'raw.webm'), run = (cmd, args) => execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] }).toString();
// Keep the end of each shot (the arrival and the desk run longer), so waits and loads are trimmed away.
const KEEP = { arrival: 9, office: 7.5, desk: 8 };
const parts = shots.map(s => ({ ...s, from: Math.max(s.start, s.end - (KEEP[s.id] ?? 6.5)), to: s.end }));
const filter = parts.map((p, i) => `[0:v]trim=start=${p.from.toFixed(3)}:end=${p.to.toFixed(3)},setpts=PTS-STARTPTS,fps=24,scale=1272:712:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:black[v${i}]`).join(';')
  + `;${parts.map((_, i) => `[v${i}]`).join('')}concat=n=${parts.length}:v=1:a=0[v]`;
const total = parts.reduce((sum, p) => sum + (p.to - p.from), 0);
const common = ['-y', '-i', raw, '-f', 'lavfi', '-t', total.toFixed(3), '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000', '-filter_complex', filter, '-map', '[v]', '-map', '1:a', '-shortest'];
// Two-pass so each file lands near #365's budget (about 1.5 Mbps VP9, 2 Mbps H.264).
const log = join(dir, 'pass'), twoPass = (video, audio, out) => {
  run('ffmpeg', [...common, ...video, '-pass', '1', '-passlogfile', log, '-an', '-f', 'null', '/dev/null']);
  run('ffmpeg', [...common, ...video, '-pass', '2', '-passlogfile', log, ...audio, out]);
};
twoPass(['-c:v', 'libvpx-vp9', '-b:v', '1500k', '-row-mt', '1', '-deadline', 'good'], ['-c:a', 'libopus', '-b:a', '96k'], join(dir, `${id}.webm`));
twoPass(['-c:v', 'libx264', '-profile:v', 'main', '-pix_fmt', 'yuv420p', '-b:v', '2000k'], ['-c:a', 'aac', '-b:a', '128k', '-movflags', '+faststart'], join(dir, `${id}.mp4`));
for (const name of readdirSync(dir)) if (name.startsWith('pass')) rmSync(join(dir, name));
// Captions and transcript follow the cut's own timeline.
let at = 0; const cue = s => new Date(s * 1000).toISOString().slice(11, 23);
const cues = parts.map(p => { const start = at; at += p.to - p.from; return { start, end: at, text: p.caption }; });
writeFileSync(join(dir, `${id}.en.vtt`), `WEBVTT\n\n${cues.map((c, i) => `${i + 1}\n${cue(c.start + 0.2)} --> ${cue(c.end - 0.2)}\n${c.text}\n`).join('\n')}`);
writeFileSync(join(dir, `${id}.transcript.txt`), `${cues.map(c => c.text).join('\n')}\n\n(No speech. The soundtrack is silent; captions carry the film.)\n`);
const poster = cues[Math.min(2, cues.length - 1)];
run('ffmpeg', ['-y', '-ss', ((poster.start + poster.end) / 2).toFixed(2), '-i', join(dir, `${id}.mp4`), '-frames:v', '1', '-q:v', '3', join(dir, `${id}-poster.jpg`)]);
const probe = file => Number(JSON.parse(run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file])).format.duration);
const TYPES = { webm: 'video/webm; codecs="vp9, opus"', mp4: 'video/mp4; codecs="avc1.4D401F, mp4a.40.2"', vtt: 'text/vtt', jpg: 'image/jpeg' };
const files = [`${id}.webm`, `${id}.mp4`, `${id}.en.vtt`, `${id}-poster.jpg`].map(name => {
  const bytes = readFileSync(join(dir, name));
  return { path: `preview/public/assets/ipic/screening/${name}`, type: TYPES[name.split('.').pop()], bytes: statSync(join(dir, name)).size, sha256: createHash('sha256').update(bytes).digest('hex'),
    ...(name.endsWith('.webm') || name.endsWith('.mp4') ? { durationMs: Math.round(probe(join(dir, name)) * 1000) } : {}) };
});
writeFileSync(join(dir, 'sources.candidate.json'), JSON.stringify({
  id, label: 'River Oaks: an evening at the office and IPIC (candidate)', fixture: false,
  provenance: `Runtime capture of River Oaks only, from commit ${commit}: headless Chromium ${browser} with Metal ANGLE (${renderer}), recorded ${recordedAt} by scripts/ipic-short/capture.mjs and cut by scripts/ipic-short/cut.mjs. The default (legacy) office layout, synthetic fixture identities, an idle IPIC screen. No external images, music, voices, generated footage or new likenesses; characters appear as committed at that revision. Characters: Jevica is preview/public/assets/characters/jevica.glb (sha256 722b96e2…, CC0-1.0, MakeHuman system assets, marked fictional_generic_appearance) in the committed Jevica costume; the seated friend and the IPIC staff are the committed CC0 resident avatars. Street geometry is derived from OpenStreetMap; the game's "© OpenStreetMap contributors · ODbL · Artistic interpretation" credit stays in frame in the street shots and must stay in any recut. The audio is a silent stereo track (ffmpeg anullsrc). Captions were written for this cut.`,
  license: 'Unresolved: the footage is the project\'s own runtime, but use of Jevica\'s in-game appearance in public media needs Val\'s approval.',
  approval: 'Pending (#365). Not allowlisted, not committed, not published.',
  rightsReview: ["Lounge shot (about 34–39 s): the floral wall is a texture cut from venue photo IMG_9761.jpg (preview/src/ipic-interior.js:232), and the repeated \"I'm Busy for the rest of my Life.\" wall text reproduces the venue's own lettering (ipic-interior.js:162). A supplied venue photo is not blanket permission for its artwork (#365), so clear these or recut the shot.", "Reception and return shots: real marks on the signage (\"RIVER OAKS DISTRICT\", \"IPIC & THE TUCK ROOM\") and photographed street frontages. The game already shows them in place; showing them in public media is a separate decision.", "Jevica's in-game appearance in public media (Val)."],
  transcript: cues.map(c => c.text), files }, null, 2) + '\n');
console.log(JSON.stringify({ totalS: total.toFixed(2), cues: cues.length, files }, null, 2));
