// Per-browser voice preferences. Nothing here grants anything: the server
// decides who may talk where, and the microphone is requested only when the
// resident asks for it. Storage can be missing or blocked; defaults then apply.
const KEY = 'river-oaks-voice';
const DEFAULTS = Object.freeze({ deviceId: null, pushToTalk: false, autoUnmute: false, muted: [] });
const MAX_MUTED = 256;

function sanitize(value) {
  const result = { ...DEFAULTS, muted: [] };
  if (!value || typeof value !== 'object') return result;
  if (typeof value.deviceId === 'string' && value.deviceId.length > 0 && value.deviceId.length <= 200) result.deviceId = value.deviceId;
  result.pushToTalk = value.pushToTalk === true;
  result.autoUnmute = value.autoUnmute === true;
  if (Array.isArray(value.muted)) result.muted = [...new Set(value.muted.filter(id => typeof id === 'string' && id.length > 0 && id.length <= 160))].slice(0, MAX_MUTED);
  return result;
}

// One store per page, so Settings and the town client see each other's changes.
let shared = null;
export const sharedVoicePreferences = () => shared ??= createVoicePreferences();

export function createVoicePreferences({ storage = (() => { try { return globalThis.localStorage; } catch { return null; } })() } = {}) {
  const listeners = new Set();
  let current = null;
  const read = () => {
    if (current) return current;
    let raw = null;
    try { raw = storage?.getItem(KEY) ?? null; } catch { raw = null; }
    try { current = sanitize(raw ? JSON.parse(raw) : null); } catch { current = sanitize(null); }
    return current;
  };
  const write = () => { try { storage?.setItem(KEY, JSON.stringify(current)); } catch { /* Preferences stay in memory for this page. */ } };
  return {
    get() { return { ...read(), muted: [...read().muted] }; },
    set(patch) {
      current = sanitize({ ...read(), ...patch });
      write();
      for (const listener of listeners) listener(this.get());
    },
    isMuted(playerId) { return read().muted.includes(playerId); },
    setMuted(playerId, muted) {
      const list = read().muted.filter(id => id !== playerId);
      this.set({ muted: muted ? [...list, playerId] : list });
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}
