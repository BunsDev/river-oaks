// Decode check for a local candidate film (#365, generalised for #501): hashes and durations against
// sources.candidate.json, then real decode in headless Chromium (Metal ANGLE) over HTTP: duration, presented
// frames while playing, decoded audio bytes, seeks through the film at one size, the caption track's cues
// against the transcript, and a poster at the film's size.
//   node <this file> <worktree> <candidate-dir>
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const [worktree, dir] = process.argv.slice(2).map(p => resolve(p));
const { chromium } = await import(pathToFileURL(join(worktree, 'node_modules/playwright/index.mjs')).href);
const { holdBrowserLock } = await import(pathToFileURL(join(worktree, 'scripts/browser-lock.mjs')).href);
const manifest = JSON.parse(readFileSync(join(dir, 'sources.candidate.json'), 'utf8'));
const checks = [], fail = message => { throw new Error(message); };
for (const file of manifest.files) {
  const bytes = readFileSync(join(dir, basename(file.path)));
  if (bytes.length !== file.bytes) fail(`${file.path}: ${bytes.length} bytes, manifest ${file.bytes}`);
  if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) fail(`${file.path}: sha256 differs`);
}
checks.push(`${manifest.files.length} files match the manifest's bytes and SHA-256`);

const TYPES = { '.webm': 'video/webm', '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.jpg': 'image/jpeg', '.html': 'text/html' };
const server = createServer((req, res) => {
  const name = basename(decodeURIComponent(new URL(req.url, 'http://x').pathname)) || 'index.html';
  if (name === 'index.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end('<!doctype html><title>decode</title>'); }
  const path = join(dir, name); if (!existsSync(path)) { res.writeHead(404); return res.end(); }
  const body = readFileSync(path), range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? '');
  const type = TYPES[name.slice(name.lastIndexOf('.'))] ?? 'application/octet-stream';
  if (!range) { res.writeHead(200, { 'content-type': type, 'content-length': body.length, 'accept-ranges': 'bytes' }); return res.end(body); }
  const start = Number(range[1]), end = range[2] ? Number(range[2]) : body.length - 1;
  res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${body.length}`, 'content-length': end - start + 1, 'accept-ranges': 'bytes' });
  res.end(body.subarray(start, end + 1));
});
await new Promise(ok => server.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${server.address().port}`;
const release = await holdBrowserLock('IPIC short candidate decode check (#365)');
let browser;
const result = { checks, media: [] };
try {
  browser = await chromium.launch({ headless: true, args: ['--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage();
  page.on('crash', () => console.error('page crashed')); page.on('console', m => console.error('console:', m.text())); browser.on('disconnected', () => console.error('browser disconnected'));
  await page.goto(`${origin}/index.html`);
  const vtt = manifest.files.find(f => f.path.endsWith('.vtt')), poster = manifest.files.find(f => f.path.endsWith('.jpg'));
  for (const file of manifest.files.filter(f => f.durationMs)) {
    const name = basename(file.path); console.error('checking', name);
    const out = await page.evaluate(async ([name, type, vttName]) => {
      const video = document.createElement('video'); video.muted = true; video.playsInline = true; video.crossOrigin = 'anonymous';
      const track = document.createElement('track'); track.kind = 'captions'; track.srclang = 'en'; track.src = vttName; track.default = true; video.append(track);
      document.body.append(video);
      const canPlay = video.canPlayType(type); const fail = message => { throw new Error(message); };
      const once = (target, event) => new Promise((ok, no) => { target.addEventListener(event, ok, { once: true }); video.addEventListener('error', () => no(new Error(`media error ${video.error?.code}`)), { once: true }); setTimeout(() => no(new Error(`${name}: no ${event} within 30 s (readyState ${video.readyState}, track ${track.readyState})`)), 30000); });
      video.src = name; console.log('src set'); await once(video, 'loadedmetadata'); console.log('metadata', video.duration);
      track.track.mode = 'hidden'; console.log('track state', track.readyState); if (track.readyState !== 2) await once(track, 'load'); console.log('track loaded', track.track.cues?.length);
      const cues = [...track.track.cues].map(c => ({ start: c.startTime, end: c.endTime, text: c.text }));
      let frames = 0; const count = () => { frames += 1; video.requestVideoFrameCallback(count); }; video.requestVideoFrameCallback(count);
      await video.play(); console.log('playing'); await new Promise(ok => setTimeout(ok, 3000)); video.pause();
      const played = { currentTime: video.currentTime, frames, audioBytes: video.webkitAudioDecodedByteCount ?? null, quality: video.getVideoPlaybackQuality?.() && { total: video.getVideoPlaybackQuality().totalVideoFrames, dropped: video.getVideoPlaybackQuality().droppedVideoFrames } };
      const seeks = [];
      for (const at of [0.2, 0.5, 0.85].map(f => video.duration * f).concat(video.duration - 0.5)) {
        video.currentTime = at; await once(video, 'seeked'); console.log('seeked', at);
        if (video.readyState < 2) fail(`${name}: no current frame after seeking to ${at} (readyState ${video.readyState})`); const frame = video.currentTime; // rVFC does not fire for a paused seek in headless Chromium; draw the current frame instead.
        const canvas = new OffscreenCanvas(64, 36), ctx = canvas.getContext('2d'); ctx.drawImage(video, 0, 0, 64, 36);
        const data = ctx.getImageData(0, 0, 64, 36).data; let sum = 0; for (let i = 0; i < data.length; i += 4) sum += data[i] + data[i + 1] + data[i + 2];
        seeks.push({ at: Math.round(at * 100) / 100, mediaTime: Math.round(frame * 1000) / 1000, meanRgb: Math.round(sum / (data.length / 4) / 3), size: [video.videoWidth, video.videoHeight] });
      }
      const result = { canPlay, durationMs: Math.round(video.duration * 1000), cues, played, seeks };
      video.remove(); return result;
    }, [name, file.type, basename(vtt.path)]);
    if (!out.canPlay) fail(`${name}: canPlayType('${file.type}') is empty`);
    if (Math.abs(out.durationMs - file.durationMs) > 60) fail(`${name}: decoded ${out.durationMs} ms, manifest ${file.durationMs} ms`);
    if (out.played.currentTime < 2 || out.played.frames < 24) fail(`${name}: played ${out.played.currentTime}s, ${out.played.frames} frames presented`);
    const size = out.seeks[0].size;
    if (out.seeks.some(s => s.size.join() !== size.join() || s.meanRgb < 8)) fail(`${name}: a seek decoded a black or mis-sized frame: ${JSON.stringify(out.seeks)}`);
    if (result.media.length && result.media[0].seeks[0].size.join() !== size.join()) fail(`${name}: decodes at ${size}, the other encode at ${result.media[0].seeks[0].size}`);
    if (JSON.stringify(out.cues.map(c => c.text)) !== JSON.stringify(manifest.transcript)) fail(`${name}: caption cues differ from the transcript`);
    if (out.cues.some(c => c.end > out.durationMs / 1000)) fail(`${name}: a cue ends after the film`);
    checks.push(`${name}: plays as ${file.type} (${out.canPlay}), decodes ${out.durationMs} ms (manifest ${file.durationMs}), ${out.played.frames} frames presented in 3 s, ${out.played.audioBytes ?? 'unknown'} audio bytes decoded, ${out.seeks.length} seeks decoded at ${size.join('×')}, ${out.cues.length} cues equal the transcript`);
    result.media.push({ name, ...out, cues: out.cues.length });
  }
  const image = await page.evaluate(async src => { const img = new Image(); img.src = src; await img.decode(); return [img.naturalWidth, img.naturalHeight]; }, basename(poster.path));
  if (image.join() !== result.media[0].seeks[0].size.join()) fail(`poster decodes at ${image}, the film at ${result.media[0].seeks[0].size}`);
  checks.push(`poster decodes at ${image.join('×')}`);
  result.browser = await browser.version();
  result.renderer = await page.evaluate(() => { const gl = document.createElement('canvas').getContext('webgl'); const ext = gl?.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : null; });
  result.status = 'passed';
} catch (error) { result.status = 'failed'; result.error = error.message; process.exitCode = 1; }
finally { await browser?.close(); server.close(); release(); }
result.checkedAt = new Date().toISOString();
writeFileSync(join(dir, 'decode-check.json'), JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ status: result.status, error: result.error, checks }, null, 2));
