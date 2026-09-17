// Neural generation uses the loopback bridge; device fallback permits localService voices only.
export const VOICE_PRESETS = ['af_heart','am_michael','af_bella','am_fenrir','af_nicole','am_eric','af_sarah','am_liam','af_sky','am_onyx','af_jessica','am_echo','af_nova','am_puck','af_river','am_adam','af_alloy','bm_george','af_aoede','bm_daniel','af_kore','bf_emma','bf_alice','bf_isabella'];
export function voiceFor(local) {
  const index = Number(String(local.id).match(/\d+$/)?.[0] ?? 0);
  return { voice: local.persona?.voice ?? VOICE_PRESETS[index % VOICE_PRESETS.length], speed: 0.96 + (index % 4) * 0.025 };
}

// Generation counters fence all asynchronous audio, including responses arriving after mute/close.
export function createSpeechQueue({ generate, play, stop, onStatus = () => {} }) {
  let generation = 0, controller = null, enabled = false;
  const cancel = () => { generation++; controller?.abort(); controller = null; stop(); };
  return {
    cancel,
    setEnabled(value) { enabled = Boolean(value); cancel(); onStatus(enabled ? 'Ready' : 'Muted'); },
    async speak(local, text) {
      cancel();
      if (!enabled || typeof text !== 'string' || !text.trim()) return false;
      const current = generation;
      const abort = new AbortController(); controller = abort;
      onStatus('Preparing local voice…');
      try {
        const audio = await generate(local, text.slice(0, 480), abort.signal);
        if (current !== generation || !enabled) return false;
        onStatus('Speaking locally');
        await play(audio, local);
        if (current !== generation) return false;
        onStatus('Ready'); return true;
      } catch (error) {
        if (current === generation) onStatus(error?.name === 'NotAllowedError' ? 'Press Replay to hear this line' : 'Local voice unavailable · try device voices');
        return false;
      } finally { if (controller === abort) controller = null; }
    },
  };
}

export function createLocalSpeech(onStatus = () => {}) {
  let mode = 'off', audio = null, url = null, utterance = null, speakingId = null, finish = null;
  const stop = () => {
    if (audio) { audio.pause(); audio.src = ''; audio = null; }
    if (url) { URL.revokeObjectURL(url); url = null; }
    if (utterance) { window.speechSynthesis?.cancel(); utterance = null; }
    speakingId = null; finish?.(); finish = null;
  };
  const queue = createSpeechQueue({
    stop, onStatus,
    async generate(local, text, signal) {
      if (mode === 'device') {
        const voices = window.speechSynthesis?.getVoices().filter(voice => voice.localService && /^en[-_]/i.test(voice.lang)) ?? [];
        if (!voices.length) throw new Error('No installed local English voices');
        const index = Number(local.id.match(/\d+$/)?.[0] ?? 0);
        return { text, deviceVoice: voices[index % voices.length], speed: voiceFor(local).speed };
      }
      const response = await fetch('/v1/voice', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text,...voiceFor(local)}), signal:AbortSignal.any([signal,AbortSignal.timeout(22000)]) });
      if (!response.ok || !response.headers.get('content-type')?.includes('audio/wav')) throw new Error('Voice unavailable');
      const blob = await response.blob();
      if (blob.size > 3*1024*1024) throw new Error('Audio exceeds playback budget');
      return blob;
    },
    play(payload, local) {
      speakingId = local.id;
      return new Promise((resolve, reject) => {
        finish = resolve;
        const done = () => { speakingId = null; finish = null; resolve(); };
        if (payload.deviceVoice) {
          utterance = new SpeechSynthesisUtterance(payload.text); utterance.voice = payload.deviceVoice; utterance.rate = payload.speed; utterance.onend = done; utterance.onerror = event => { speakingId = null; finish = null; reject(new Error(event.error)); };
          window.speechSynthesis.speak(utterance);
        } else {
          url = URL.createObjectURL(payload); audio = new Audio(url); audio.onended = done; audio.onerror = () => { speakingId = null; finish = null; reject(new Error('Audio playback failed')); };
          audio.play().catch(reject);
        }
      });
    },
  });
  window.addEventListener('blur', () => queue.cancel());
  document.addEventListener('visibilitychange', () => { if (document.hidden) queue.cancel(); });
  return {
    get mode() { return mode; },
    get speakingId() { return speakingId; },
    setMode(value) { mode = ['kokoro','device'].includes(value) ? value : 'off'; queue.setEnabled(mode !== 'off'); },
    speak: queue.speak,
    cancel: queue.cancel,
  };
}
