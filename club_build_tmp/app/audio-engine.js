// CT Club audio engine (temporary scratch tool, Val 2026-11-06).
// Upload one or more tracks (multi-select = playlist), decode them, play them back
// continuously (each track auto-advances to the next, wrapping), and expose an
// AnalyserNode so lights/screens can react to the music (equalizer, waveform,
// frequency-reactive colour).
export function createAudioEngine() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  const ctx = new AC();
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  analyser.smoothingTimeConstant = 0.82;
  const freq = new Uint8Array(analyser.frequencyBinCount);
  const wave = new Uint8Array(analyser.fftSize);
  const gain = ctx.createGain();
  gain.connect(analyser);
  analyser.connect(ctx.destination);
  // Decode audio through an OfflineAudioContext so it never hangs on a suspended
  // (autoplay-blocked) AudioContext; the resulting AudioBuffer plays on the main ctx.
  const offline = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, 1, 44100);

  const tracks = [];            // { id, name, buffer }
  let index = -1;
  let source = null;            // current BufferSource
  let playing = false;
  let volume = 0.9;
  let lastPlayedAt = 0;         // ctx.currentTime when the current track started
  let pauseAt = 0;              // offset (s) into the current track when paused

  const state = () => ({
    playing, index, volume,
    tracks: tracks.map(t => t.name),
    current: index >= 0 ? tracks[index].name : null,
    time: index >= 0 && source ? Math.max(0, ctx.currentTime - lastPlayedAt) : 0,
    duration: index >= 0 ? tracks[index].buffer.duration : 0,
  });
  const emit = () => window.dispatchEvent(new CustomEvent('ct-audio', { detail: state() }));

  const stop = () => {
    if (source) { try { source.onended = null; source.stop(); } catch { } source = null; }
  };

  const playIndex = (i, { autoplay = true } = {}) => {
    if (i < 0 || i >= tracks.length) return;
    stop();
    index = i;
    const track = tracks[i];
    source = ctx.createBufferSource();
    source.buffer = track.buffer;
    source.connect(gain);
    source.onended = () => {
      // Continuous playback: when a track ends, advance to the next (wrapping).
      if (index === i && playing) playIndex((i + 1) % tracks.length);
    };
    lastPlayedAt = ctx.currentTime;
    pauseAt = 0;
    if (autoplay) { playing = true; source.start(); }
    emit();
  };

  const decode = async files => {
    const added = [];
    for (const f of [...files]) {
      if (!f.type.startsWith('audio/')) continue;
      try {
        const audioBuf = await offline.decodeAudioData(await f.arrayBuffer());
        const id = 'track-' + (tracks.length + 1);
        tracks.push({ id, name: f.name.replace(/\.[^.]+$/, ''), buffer: buf });
        added.push(tracks[tracks.length - 1]);
      } catch { /* skip undecodable files */ }
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => { });   // fire-and-forget
    if (added.length && index < 0) playIndex(0);
    emit();
    return added;
  };

  // Load a track from a URL (e.g. the bundled tracks in the project's public/audio
  // folder) and append it to the playlist. Returns the track, or null on failure.
  const addUrl = async (url, name) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const buf = await res.arrayBuffer();
      const audioBuf = await offline.decodeAudioData(buf);
      const id = 'track-' + (tracks.length + 1);
      const track = { id, name: name || decodeURIComponent(url.split('/').pop().replace(/\.[^.]+$/, '')), buffer: audioBuf };
      tracks.push(track);
      if (ctx.state === 'suspended') ctx.resume().catch(() => { });   // fire-and-forget (never blocks decode)
      if (index < 0) playIndex(0);
      emit();
      return track;
    } catch { return null; }
  };

  const toggle = () => {
    if (index < 0 && tracks.length) { playIndex(0); return; }
    if (playing) { pauseAt = Math.max(0, ctx.currentTime - lastPlayedAt); playing = false; stop(); }
    else if (index >= 0) {
      // Resume: rebuild the source and start from where we paused (a BufferSource
      // can't be resumed after stop(), so we recreate it at the saved offset).
      playing = true;
      lastPlayedAt = ctx.currentTime - pauseAt;
      source = ctx.createBufferSource();
      source.buffer = tracks[index].buffer;
      source.connect(gain);
      source.onended = () => { if (index >= 0 && playing) playIndex((index + 1) % tracks.length); };
      source.start(0, pauseAt);
    }
    emit();
  };

  const next = () => { if (tracks.length) playIndex((index + 1) % tracks.length); };
  const prev = () => { if (tracks.length) playIndex((index - 1 + tracks.length) % tracks.length); };

  const seek = frac => {
    if (index < 0 || !tracks[index]) return;
    const t = Math.max(0, Math.min(1, frac)) * tracks[index].buffer.duration;
    stop();
    source = ctx.createBufferSource();
    source.buffer = tracks[index].buffer;
    source.connect(gain);
    source.onended = () => { if (index >= 0 && playing) playIndex((index + 1) % tracks.length); };
    lastPlayedAt = ctx.currentTime - t;
    if (playing) source.start(0, t);
    emit();
  };

  const setVolume = v => { volume = Math.max(0, Math.min(1, v)); gain.gain.value = volume; emit(); };

  const getFreq = () => { analyser.getByteFrequencyData(freq); return freq; };
  const getWave = () => { analyser.getByteTimeDomainData(wave); return wave; };

  // Real-time band analysis: split the spectrum into `count` (default 16) log-spaced
  // bands and return their average energy as 0..1 levels — a proper equalizer readout.
  const getBands = (count = 16) => {
    getFreq();
    const n = freq.length;
    const lo = Math.max(1, Math.floor(n * 0.02));
    const hi = Math.min(n - 1, Math.floor(n * 0.92));
    const out = [];
    for (let b = 0; b < count; b++) {
      const f0 = Math.pow(hi / lo, b / count) * lo;
      const f1 = Math.pow(hi / lo, (b + 1) / count) * lo;
      const i0 = Math.max(1, Math.floor(f0));
      const i1 = Math.min(n - 1, Math.max(i0 + 1, Math.floor(f1)));
      let sum = 0, c = 0;
      for (let i = i0; i <= i1; i++) { sum += freq[i] / 255; c++; }
      out.push(c ? sum / c : 0);
    }
    return out;
  };

  // Map a band to a 0..1 level. 'all' uses the whole spectrum average.
  const bandRange = band => {
    const n = freq.length;
    if (band === 'bass') return [0, Math.max(1, Math.floor(n * 0.06))];
    if (band === 'mid') return [Math.floor(n * 0.08), Math.max(2, Math.floor(n * 0.30))];
    if (band === 'treble') return [Math.floor(n * 0.32), Math.max(3, Math.floor(n * 0.90))];
    return [0, n - 1];
  };
  const energy = (band = 'all') => {
    if (!playing) return 0;
    getFreq();
    const [lo, hi] = bandRange(band);
    let sum = 0, count = 0;
    for (let i = lo; i <= hi && i < freq.length; i++) { sum += freq[i] / 255; count++; }
    return count ? sum / count : 0;
  };
  const level = () => {
    getWave();
    let sum = 0;
    for (let i = 0; i < wave.length; i++) { const v = (wave[i] - 128) / 128; sum += v * v; }
    return Math.min(1, Math.sqrt(sum / wave.length) * 3);
  };

  gain.gain.value = volume;
  return { ctx, analyser, tracks, decode, addUrl, toggle, next, prev, seek, setVolume, getFreq, getWave, getBands, energy, level, state, playIndex };
}
