// Neural generation uses the loopback bridge; device fallback permits localService voices only.
export const VOICE_PRESETS = ['af_heart','bm_fable','bf_emma','am_fenrir','af_kore','am_eric','af_sarah','am_liam','af_sky','am_onyx','af_jessica','am_echo','af_nova','am_puck','af_river','am_adam','af_alloy','bm_george','af_aoede','bm_daniel','bf_isabella','af_nicole','am_michael','af_bella'];
export function voiceFor(local) {
  const index = Number(String(local.id).match(/\d+$/)?.[0] ?? 0);
  return { voice: local.persona?.voice ?? VOICE_PRESETS[index % VOICE_PRESETS.length], speed: 0.96 + (index % 4) * 0.025 };
}

function waitForVoice(ms, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const finish = () => { signal.removeEventListener('abort', abort); resolve(); };
    const timer = setTimeout(finish, ms);
    const abort = () => { clearTimeout(timer); reject(signal.reason); };
    signal.addEventListener('abort', abort, { once:true });
  });
}

export async function requestLocalVoice(local, text, signal, { fetcher = fetch, wait = waitForVoice, onWaiting = () => {} } = {}) {
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(22000)]);
  // A cancelled browser request cannot interrupt CPU synthesis already in progress.
  // Retry only explicit worker contention, within the original total time budget.
  for (let attempt = 0; attempt <= 20; attempt++) {
    deadline.throwIfAborted();
    const response = await fetcher('/v1/voice', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({text,...voiceFor(local)}), signal:deadline });
    deadline.throwIfAborted();
    if (response.status === 503 && response.headers.get('retry-after') === '1' && attempt < 20) {
      await response.body?.cancel();
      deadline.throwIfAborted();
      onWaiting();
      await wait(1000, deadline);
      continue;
    }
    if (!response.ok || !response.headers.get('content-type')?.includes('audio/wav')) throw new Error('Voice unavailable');
    const blob = await response.blob();
    if (blob.size > 3*1024*1024) throw new Error('Audio exceeds playback budget');
    return blob;
  }
}

// Generation counters fence all asynchronous audio, including responses arriving after mute/close.
export function createSpeechQueue({ generate, play, stop, onStatus = () => {} }) {
  let generation = 0, controller = null, enabled = false;
  const cancel = () => { generation++; controller?.abort(); controller = null; stop(); onStatus(enabled ? 'Ready' : 'Muted'); };
  return {
    cancel,
    setEnabled(value) { enabled = Boolean(value); cancel(); },
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
  let mode = 'off', speakingId = null, playback = null;
  const stop = () => { playback?.cancel(); speakingId = null; };
  const queue = createSpeechQueue({
    stop, onStatus,
    async generate(local, text, signal) {
      if (mode === 'device') {
        const voices = window.speechSynthesis?.getVoices().filter(voice => voice.localService && /^en[-_]/i.test(voice.lang)) ?? [];
        if (!voices.length) throw new Error('No installed local English voices');
        const index = Number(local.id.match(/\d+$/)?.[0] ?? 0);
        return { text, deviceVoice: voices[index % voices.length], speed: voiceFor(local).speed };
      }
      return requestLocalVoice(local, text, signal, { onWaiting: () => onStatus('Waiting for local voice…') });
    },
    play(payload, local) {
      speakingId = local.id;
      return new Promise((resolve, reject) => {
        let audio = null, url = null, utterance = null, settled = false;
        const done = (error) => {
          if (settled) return;
          settled = true;
          if (audio) { audio.onended = audio.onerror = null; audio.pause(); audio.src = ''; }
          if (url) URL.revokeObjectURL(url);
          if (utterance) { utterance.onend = utterance.onerror = null; window.speechSynthesis.cancel(); }
          if (playback === current) { playback = null; speakingId = null; }
          if (error) reject(error); else resolve();
        };
        const current = { cancel: () => done() }; playback = current;
        try {
          if (payload.deviceVoice) {
            utterance = new SpeechSynthesisUtterance(payload.text); utterance.voice = payload.deviceVoice; utterance.rate = payload.speed;
            utterance.onend = () => done(); utterance.onerror = event => done(new Error(event.error));
            window.speechSynthesis.speak(utterance);
          } else {
            url = URL.createObjectURL(payload); audio = new Audio(url);
            audio.onended = () => done(); audio.onerror = () => done(new Error('Audio playback failed'));
            audio.play().catch(done);
          }
        } catch (error) { done(error); }
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
