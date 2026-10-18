#!/usr/bin/env node
// Test-only films for the IPIC screen's switching and matte checks (#498): borderless synthetic
// frames at four decoded sizes and aspects, each with a 6 px edge in its own pure colour, a mid
// grey field and a white and a black box, so a capture shows whether the whole film is on the
// screen, unstretched, with black mattes the screen draws itself; plus one file that is not a film,
// for decoder fallback. They live under preview/e2e/fixtures/screening, which the Vite dev server
// serves and production builds do not; they are never in SCREENING_MEDIA.
//
//   node scripts/make-screening-test-sources.mjs           # write the files and manifest.json
//   node scripts/make-screening-test-sources.mjs --check   # verify the committed bytes and durations
//
// Encoders are not bit-reproducible across ffmpeg builds, so --check verifies the committed bytes
// against the manifest and probes each film; it does not re-encode.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'preview/e2e/fixtures/screening');
const DURATION_S = 4;
const FILMS = [
  { id: 'test-edge-4x3', width: 640, height: 480, edge: 'red' },
  { id: 'test-edge-16x9', width: 1280, height: 720, edge: 'blue' },
  { id: 'test-edge-239', width: 1280, height: 536, edge: 'lime' },
  { id: 'test-edge-4x1', width: 1440, height: 360, edge: 'magenta' },
];
// Boxes sit at fixed fractions of the frame: white at (0.25..0.40, 0.375..0.625), black at (0.60..0.75, same).
const frame = ({ width: w, height: h, edge }) => [
  `color=c=0x808080:s=${w}x${h}:r=24:d=${DURATION_S}`,
  `drawbox=x=0:y=0:w=iw:h=ih:color=${edge}:t=6`,
  `drawbox=x=${w * 0.25}:y=${h * 0.375}:w=${w * 0.15}:h=${h * 0.25}:color=white:t=fill`,
  `drawbox=x=${w * 0.6}:y=${h * 0.375}:w=${w * 0.15}:h=${h * 0.25}:color=black:t=fill`,
].join(',');
const MP4 = 'video/mp4; codecs="avc1.42E01E"';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const probe = path => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', path], { encoding: 'utf8' }));
const manifestPath = join(dir, 'manifest.json');

if (process.argv.includes('--check')) {
  const { films, broken } = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const item of [...films.flatMap(film => film.files.map(file => ({ ...file, film }))), broken]) {
    const bytes = readFileSync(join(root, item.path));
    if (sha256(bytes) !== item.sha256 || bytes.length !== item.bytes) throw new Error(`${item.path} does not match manifest.json`);
    if (!item.film) continue;
    const info = probe(join(root, item.path)), stream = info.streams[0];
    if (stream.width !== item.film.width || stream.height !== item.film.height) throw new Error(`${item.path} is ${stream.width}x${stream.height}`);
    if (Math.abs(Number(info.format.duration) * 1000 - item.durationMs) > 60) throw new Error(`${item.path} duration differs from ${item.durationMs} ms`);
  }
  process.stdout.write(`screening test sources: ${films.length} films and one non-film match manifest.json\n`);
} else {
  mkdirSync(dir, { recursive: true });
  const ffmpeg = execFileSync('ffmpeg', ['-version'], { encoding: 'utf8' }).split('\n')[0];
  const films = FILMS.map(film => {
    const path = join(dir, `${film.id}.mp4`);
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', frame(film), '-c:v', 'libx264', '-profile:v', 'baseline', '-pix_fmt', 'yuv420p',
      '-g', '24', '-keyint_min', '24', '-crf', '18', '-movflags', '+faststart', '-map_metadata', '-1', '-t', String(DURATION_S), path]);
    const bytes = readFileSync(path);
    return { ...film, files: [{ path: relative(root, path), src: `/${relative(join(root, 'preview'), path)}`, type: MP4, bytes: bytes.length, sha256: sha256(bytes), durationMs: Math.round(Number(probe(path).format.duration) * 1000) }] };
  });
  // Not a film: bytes no decoder accepts, offered as WebM so the browser tries it first.
  const notFilm = Buffer.from('IPIC test source: deliberately not a video. '.repeat(48));
  const brokenPath = join(dir, 'test-not-a-film.webm');
  writeFileSync(brokenPath, notFilm);
  const broken = { path: relative(root, brokenPath), src: `/${relative(join(root, 'preview'), brokenPath)}`, type: 'video/webm; codecs="vp9"', bytes: notFilm.length, sha256: sha256(notFilm) };
  const manifest = {
    purpose: 'Test-only sources for the IPIC screen (#498). Never in SCREENING_MEDIA, never public catalog films.',
    provenance: `Synthetic, generated locally by scripts/make-screening-test-sources.mjs with ${ffmpeg}: lavfi color and drawbox. No footage, audio, artwork or likeness.`,
    license: 'Original synthetic test signal; no third-party content.',
    layout: 'mid grey field (#808080); 6 px edge in the film’s colour; white box at x 0.25–0.40, black box at x 0.60–0.75, both at y 0.375–0.625 of the frame',
    films, broken,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`wrote ${films.length} test films and one non-film to ${relative(root, dir)}\n`);
}
