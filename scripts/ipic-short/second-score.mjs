// The second short's music (#501): an original solo piano with a soft bass line, made entirely by this
// script. Additive piano tones (inharmonic partials with their own decays), a seeded touch of timing and
// velocity, and a small room reverb. No samples, recordings or third-party material.
//   node scripts/ipic-short/second-score.mjs <out.wav> [seconds]
// Deterministic: the same seconds give the same bytes.
import { writeFileSync } from 'node:fs';

const [out, seconds = '62'] = process.argv.slice(2);
const RATE = 48000, LENGTH = Number(seconds), N = Math.ceil(LENGTH * RATE), BPM = 84, BEAT = 60 / BPM, BAR = 4 * BEAT;
const left = new Float32Array(N), right = new Float32Array(N);
let seed = 0x5eed501;
const random = () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const hz = midi => 440 * 2 ** ((midi - 69) / 12);

// One piano note: eight slightly stretched partials, each decaying faster the higher it is.
function piano(midi, at, length, velocity, pan) {
  const f = hz(midi), start = Math.floor(at * RATE), count = Math.min(N - start, Math.floor((length + 1.6) * RATE));
  const partials = Array.from({ length: 8 }, (_, i) => { const k = i + 1; return { w: 2 * Math.PI * f * k * Math.sqrt(1 + 0.00035 * k * k) / RATE, a: velocity / k ** 1.4, d: 1.2 + k * 0.9 + f / 400 }; });
  const release = Math.floor(length * RATE), l = Math.cos(pan * Math.PI / 2), r = Math.sin(pan * Math.PI / 2);
  for (let n = 0; n < count; n++) {
    const t = n / RATE, attack = Math.min(1, n / (0.004 * RATE)), damper = n > release ? Math.exp(-(n - release) / (0.18 * RATE)) : 1;
    let v = 0;
    for (const p of partials) v += p.a * Math.exp(-p.d * t) * Math.sin(p.w * n);
    v *= attack * damper * 0.18;
    left[start + n] += v * l; right[start + n] += v * r;
  }
}
// A soft upright-ish bass: a fundamental, a little second harmonic, a plucked envelope.
function bass(midi, at, length, velocity) {
  const f = hz(midi), start = Math.floor(at * RATE), count = Math.min(N - start, Math.floor((length + 0.4) * RATE));
  for (let n = 0; n < count; n++) {
    const t = n / RATE, env = Math.min(1, n / (0.01 * RATE)) * Math.exp(-2.2 * t) * (t > length ? Math.exp(-(t - length) * 12) : 1);
    const v = velocity * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(4 * Math.PI * f * t)) * 0.22;
    left[start + n] += v * 0.55; right[start + n] += v * 0.45;
  }
}

// F major, eight bars, played round: Fmaj7 Dm7 Gm7 C7 | Fmaj7 Am7 Bbmaj7 C7sus4.
const CHORDS = [
  { root: 41, tones: [65, 69, 72, 76] }, { root: 38, tones: [62, 65, 69, 72] }, { root: 43, tones: [62, 65, 67, 70] }, { root: 36, tones: [60, 64, 67, 70] },
  { root: 41, tones: [65, 69, 72, 76] }, { root: 45, tones: [64, 67, 69, 72] }, { root: 46, tones: [62, 65, 69, 70] }, { root: 36, tones: [60, 65, 67, 70] },
];
// A short melody over the second time round, on beats (bar, beat, midi, beats long).
const MELODY = [[8, 0, 81, 1.5], [8, 2, 79, 1], [8, 3, 77, 1], [9, 0, 76, 2], [9, 2.5, 74, 1.5], [10, 0, 72, 1.5], [10, 2, 74, 1], [10, 3, 77, 1], [11, 0, 76, 3],
  [16, 0, 81, 1.5], [16, 2, 84, 1], [16, 3, 81, 1], [17, 0, 79, 2], [17, 2.5, 77, 1.5], [18, 0, 76, 1.5], [18, 2, 77, 1], [18, 3, 79, 1], [19, 0, 77, 4]];
// Dynamics over the film: a quiet start, the body under dialogue, and a swell once the last line has
// been spoken (from 53 s, the closing shot), before the fade.
const level = time => (time < 4 ? 0.55 + 0.1 * time / 4 : time < 53 ? 0.65 : time < 57 ? 0.65 + 0.35 * (time - 53) / 4 : 1);
const bars = Math.ceil(LENGTH / BAR);
for (let bar = 0; bar < bars; bar++) {
  const chord = CHORDS[bar % CHORDS.length], at = bar * BAR;
  bass(chord.root, at, BEAT * 1.8, level(at)); bass(chord.root + 7, at + 2 * BEAT, BEAT * 1.6, level(at) * 0.8);
  piano(chord.root + 12, at, BAR * 0.95, level(at) * 0.5, 0.3);
  // Right hand: the chord as gentle eighth-note broken chords.
  const pattern = [0, 1, 2, 3, 2, 1, 2, 3];
  pattern.forEach((tone, i) => {
    const t = at + i * BEAT / 2 + (random() - 0.5) * 0.012;
    piano(chord.tones[tone], t, BEAT * 0.9, level(t) * (i % 2 ? 0.32 : 0.42) * (0.92 + 0.16 * random()), 0.62);
  });
}
for (const [bar, beat, midi, beats] of MELODY) { const t = bar * BAR + beat * BEAT; if (t < LENGTH) piano(midi, t, beats * BEAT, level(t) * 0.62, 0.55); }

// A small room: four combs and two all-passes per channel (Schroeder), mixed in lightly.
function room(input, offset) {
  const combs = [1557, 1617, 1491, 1422].map(d => ({ d: d + offset, b: new Float32Array(d + offset), i: 0 })), passes = [225, 556].map(d => ({ d, b: new Float32Array(d), i: 0 }));
  const outBuf = new Float32Array(input.length);
  for (let n = 0; n < input.length; n++) {
    let s = 0;
    for (const c of combs) { const y = c.b[c.i]; c.b[c.i] = input[n] + y * 0.78; c.i = (c.i + 1) % c.d; s += y; }
    for (const p of passes) { const y = p.b[p.i]; const x = s + y * 0.5; p.b[p.i] = x; p.i = (p.i + 1) % p.d; s = y - x * 0.5; }
    outBuf[n] = input[n] + s * 0.07;
  }
  return outBuf;
}
const wetL = room(left, 0), wetR = room(right, 23);
// The last four seconds fade out; then the mix peaks at -3 dBFS (loudness is set in the mix).
let peak = 0;
for (let n = 0; n < N; n++) { const t = n / RATE, fade = t > LENGTH - 4 ? Math.max(0, (LENGTH - t) / 4) ** 2 : 1; wetL[n] *= fade; wetR[n] *= fade; peak = Math.max(peak, Math.abs(wetL[n]), Math.abs(wetR[n])); }
const gain = 10 ** (-3 / 20) / peak, pcm = Buffer.alloc(N * 4);
for (let n = 0; n < N; n++) { pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, wetL[n] * gain)) * 32767), n * 4); pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, wetR[n] * gain)) * 32767), n * 4 + 2); }
const header = Buffer.alloc(44);
header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
header.writeUInt32LE(RATE, 24); header.writeUInt32LE(RATE * 4, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
writeFileSync(out, Buffer.concat([header, pcm]));
console.log(JSON.stringify({ out, seconds: LENGTH, bars, bpm: BPM, peakGainDb: Math.round(20 * Math.log10(gain) * 10) / 10 }));
