// Jev's ElevenLabs voices. The bridge accepts any voice ID; these are the
// named choices offered in Settings, in the order they appear. The first is
// the default and must match JEV_VOICE_ID in src/river_oaks/elevenlabs_voice.py.
export const JEV_VOICES = [
  { id: 's3TPKV1kjDlVtZbl4Ksh', name: 'Adam', note: 'Warm, natural narrator' },
  { id: 'OQkHNgFcqzRY82loyxsc', name: 'New voice', note: 'OQkHNgFcqzRY82loyxsc' },
  { id: 'GVERRoGD1VgvkBmxamFb', name: 'Original Jev', note: 'The voice before Adam' },
];
export const DEFAULT_JEV_VOICE = JEV_VOICES[0].id;
export const VOICE_ID_PATTERN = /^[A-Za-z0-9]{1,64}$/;
export const isVoiceId = value => typeof value === 'string' && VOICE_ID_PATTERN.test(value);

// Map a bridge-reported ID to the matching named voice, or a custom entry for an
// ID that is valid but not in the list, or null for anything else.
export function resolveJevVoice(id) {
  if (!isVoiceId(id)) return null;
  return JEV_VOICES.find(voice => voice.id === id) ?? { id, name: 'Custom voice ID', custom: true };
}
