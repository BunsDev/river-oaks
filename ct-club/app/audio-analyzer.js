// CT Club audio frequency analyser — 32 log-spaced bands from 20 Hz to 15 kHz.
// Wraps the audio engine's AnalyserNode and returns band levels (0..1) plus
// bass/mid/treble convenience readings, overall energy, and beat detection.
export function createAudioAnalyzer({ analyser } = {}) {
  const AC = window.AudioContext || window.webkitAudioContext;
  let ctx;
  if (!analyser) {
    if (!AC) return null;
    ctx = new AC();
    const gain = ctx.createGain();
    const a = ctx.createAnalyser();
    a.fftSize = 2048;
    a.smoothingTimeConstant = 0.8;
    gain.connect(a);
    a.connect(ctx.destination);
    analyser = a;
  }
  // Use the analyser's actual AudioContext sample rate (not a hardcoded 44100).
  const audioCtx = analyser.context || ctx;
  const sr = audioCtx ? audioCtx.sampleRate : 44100;
  const fftSize = analyser.fftSize;
  const n = analyser.frequencyBinCount;          // = fftSize / 2
  const freq = new Uint8Array(n);
  const wave = new Uint8Array(analyser.fftSize);

  // Log-spaced band edges from 20 Hz to 15 kHz across 32 bands.
  const loHz = 20;
  const hiHz = 15000;
  const edges = [];
  for (let b = 0; b <= 32; b++) {
    edges.push(Math.pow(hiHz / loHz, b / 32) * loHz);
  }
  // Bin index for a frequency: bin = f * fftSize / sampleRate
  const bins = edges.map(f =>
    Math.max(1, Math.min(n - 1, Math.floor(f * fftSize / sr)))
  );

  const getBands = () => {
    analyser.getByteFrequencyData(freq);
    const out = new Float32Array(32);
    for (let b = 0; b < 32; b++) {
      let sum = 0, count = 0;
      for (let i = bins[b]; i <= bins[b + 1] && i < n; i++) {
        sum += freq[i] / 255;
        count++;
      }
      out[b] = count ? sum / count : 0;
    }
    return out;
  };

  const getWave = () => {
    analyser.getByteTimeDomainData(wave);
    return wave;
  };

  // Convenience band groupings (true musical ranges).
  const bandAvgFrom = (bands, b0, b1) => {
    let sum = 0;
    for (let i = b0; i <= b1 && i < 32; i++) sum += bands[i];
    return sum / (Math.min(b1, 31) - b0 + 1);
  };
  const getBass = () => bandAvgFrom(getBands(), 0, 6);     // ~20–260 Hz
  const getMid = () => bandAvgFrom(getBands(), 7, 20);     // ~260 Hz–2 kHz
  const getTreble = () => bandAvgFrom(getBands(), 21, 31); // ~2 kHz–15 kHz

  // Overall energy from waveform RMS.
  const getEnergy = () => {
    analyser.getByteTimeDomainData(wave);
    let sum = 0;
    for (let i = 0; i < wave.length; i++) {
      const v = (wave[i] - 128) / 128;
      sum += v * v;
    }
    return Math.min(1, Math.sqrt(sum / wave.length) * 3);
  };

  // Beat detection: bass energy threshold with hysteresis decay.
  let beatState = false;
  let beatDecay = 0;
  const getBeat = (bass) => {
    const b = bass !== undefined ? bass : getBass();
    beatDecay = Math.max(beatDecay * 0.92, b - 0.02);
    const hit = b > 0.5 && b > beatDecay + 0.12;
    if (hit) { beatState = true; beatDecay = b; }
    else if (beatState && b < 0.3) beatState = false;
    return beatState;
  };

  const state = () => {
    const b = getBands();
    const bass = bandAvgFrom(b, 0, 6);
    const mid = bandAvgFrom(b, 7, 20);
    const treble = bandAvgFrom(b, 21, 31);
    const energy = getEnergy();
    const beat = getBeat(bass);
    return { bands: Array.from(b), bass, mid, treble, energy, beat };
  };

  return { analyser, ctx: audioCtx, fftSize, sampleRate: sr, getBands, getWave, getBass, getMid, getTreble, getEnergy, getBeat, state };
}