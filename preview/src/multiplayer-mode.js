// How the preview joins the shared town:
//  off      single player only.
//  choice   players choose single player or the shared town.
//  auto     join when the town server answers with a
//           session (local development identities need no WorkOS), otherwise
//           keep playing solo without blocking anything.
//  required the town's sign-in gate locks the app until the player joins.
export const MULTIPLAYER_MODES = ['off', 'choice', 'auto', 'required'];
export const PLAY_MODES = ['solo', 'multiplayer'];
export const PLAY_MODE_KEY = 'river-oaks-play-mode';
// A switch the browser refused to store travels in the reload URL instead.
export const PLAY_MODE_PARAM = 'play';

export function resolveMultiplayerMode(env = {}) {
  if (MULTIPLAYER_MODES.includes(env.VITE_MULTIPLAYER)) return env.VITE_MULTIPLAYER;
  if (env.VITE_SINGLE_PLAYER === 'true') return 'off';
  return 'choice';
}

// The remembered choice. Unreadable storage means single player.
export function selectedPlayMode(storage) {
  try { return storage?.getItem(PLAY_MODE_KEY) === 'multiplayer' ? 'multiplayer' : 'solo'; }
  catch { return 'solo'; }
}

// This page load's mode, decided once. A choice carried in the URL wins over
// the remembered one; `remembered` says whether the browser kept it.
export function activePlayMode(storage, search = '') {
  const visit = new URLSearchParams(search).get(PLAY_MODE_PARAM);
  return PLAY_MODES.includes(visit) ? { mode: visit, remembered: false } : { mode: selectedPlayMode(storage), remembered: true };
}

// Remember a choice, and report whether the next page load will read it back:
// a write that throws, or one that silently does not stick, is a failure.
export function savePlayMode(storage, mode) {
  if (!PLAY_MODES.includes(mode) || !storage) return false;
  try { storage.setItem(PLAY_MODE_KEY, mode); }
  catch {
    // Single player is also the absence of a choice, which a full store can
    // still record by forgetting the old one.
    if (mode !== 'solo') return false;
    try { storage.removeItem(PLAY_MODE_KEY); } catch { return false; }
  }
  return selectedPlayMode(storage) === mode;
}

// Where to load the page for a new mode. When the browser will not store the
// choice, the URL carries it for this visit, so the switch still happens
// instead of reopening the old mode.
export function playModeReload(storage, mode, href) {
  const url = new URL(href), saved = savePlayMode(storage, mode);
  if (saved) url.searchParams.delete(PLAY_MODE_PARAM);
  else url.searchParams.set(PLAY_MODE_PARAM, mode);
  return { saved, url: url.href };
}

// Load this tab in a new mode, remembering the choice when the browser allows.
export function switchPlayMode(storage, mode, place = globalThis.location) {
  const { url } = playModeReload(storage, mode, place.href);
  if (url === place.href) place.reload();
  else place.replace(url);
}

// Asks the town for a session. Resolves { join, signIn, reason } and never
// rejects: an absent server, a proxy error or a non-JSON page all mean solo.
export async function probeTown({ fetch = globalThis.fetch, timeout = 2500 } = {}) {
  try {
    const response = await fetch('/auth/session', { credentials: 'same-origin', cache: 'no-store', signal: AbortSignal.timeout(timeout) });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) return { join: false, signIn: false, reason: 'unavailable' };
    const session = await response.json();
    if (session.authenticated) return { join: true, signIn: false, reason: session.development ? 'development' : 'signed-in' };
    return { join: false, signIn: true, reason: 'signed-out' };
  } catch {
    return { join: false, signIn: false, reason: 'unavailable' };
  }
}

// Vite begins listening before its in-process town finishes starting. Retry
// only an unavailable probe, so a valid signed-out session still plays solo.
export async function waitForTown({ attempts = 6, interval = 500, ...probeOptions } = {}) {
  let town;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    town = await probeTown(probeOptions);
    if (town.reason !== 'unavailable') return town;
    if (attempt + 1 < attempts) await new Promise(resolve => setTimeout(resolve, interval));
  }
  return town;
}
