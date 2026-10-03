// How the preview joins the shared town:
//  off      single player only.
//  choice   players choose single player or the shared town.
//  auto     join when the town server answers with a
//           session (local development identities need no WorkOS), otherwise
//           keep playing solo without blocking anything.
//  required the town's sign-in gate locks the app until the player joins.
export const MULTIPLAYER_MODES = ['off', 'choice', 'auto', 'required'];
export const PLAY_MODE_KEY = 'river-oaks-play-mode';

export function resolveMultiplayerMode(env = {}) {
  if (MULTIPLAYER_MODES.includes(env.VITE_MULTIPLAYER)) return env.VITE_MULTIPLAYER;
  if (env.VITE_SINGLE_PLAYER === 'true') return 'off';
  return 'choice';
}

export function selectedPlayMode(storage) {
  try { return storage?.getItem(PLAY_MODE_KEY) === 'multiplayer' ? 'multiplayer' : 'solo'; }
  catch { return 'solo'; }
}

export function savePlayMode(storage, mode) {
  if (!['solo', 'multiplayer'].includes(mode)) return false;
  try { storage?.setItem(PLAY_MODE_KEY, mode); return Boolean(storage); }
  catch { return false; }
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
