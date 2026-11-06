// CT Club audio frequency analyser — 32 log-spaced bands from 20 Hz to 15 kHz.
// Wraps the audio engine's AnalyserNode and returns band levels (0..1) plus
// bass/mid/treble convenience readings, overall energy, and beat detection.
export function createAudioAnalyzer({ analyser, sampleRate = 44100 } = {}) {
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
  const fftSize = analyser.fftSize;
  const n = analyser.frequencyBinCount;          // = fftSize / 2
  const sr = sampleRate || (ctx ? ctx.sampleRate : 44100);
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
  const bandAvg = (b0, b1) => {
    const bands = getBands();
    let sum = 0;
    for (let i = b0; i <= b1 && i < 32; i++) sum += bands[i];
    return sum / (Math.min(b1, 31) - b0 + 1);
  };
  const getBass = () => bandAvg(0, 6);     // ~20–260 Hz
  const getMid = () => bandAvg(7, 20);     // ~260 Hz–2 kHz
  const getTreble = () => bandAvg(21, 31); // ~2 kHz–15 kHz

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
  let beat = false;
  let decay = 0;
  const getBeat = () => {
    const bass = getBass();
    decay = Math.max(decay * 0.92, bass - 0.02);
    const hit = bass > 0.5 && bass > decay + 0.12;
    if (hit) { beat = true; decay = bass; }
    else if (beat && bass < 0.3) beat = false;
    return beat;
  };

  const state = () => ({
    bands: Array.from(getBands()),
    bass: getBass(),
    mid: getMid(),
    treble: getTreble(),
    energy: getEnergy(),
    beat: getBeat(),
  });

  return { analyser, ctx, fftSize, sampleRate: sr, getBands, getWave, getBass, getMid, getTreble, getEnergy, getBeat, state };
}