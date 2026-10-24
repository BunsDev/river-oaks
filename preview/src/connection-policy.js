// How the town connection recovers (multiplayer-client.js): retry timing, when a quiet
// socket counts as dead, and what the page says after each kind of close. Pure, so the
// policy is tested without a browser.

// Retries back off to 30 s. Each delay is drawn from the upper half of its step, so a town
// whose server restarted does not hear from every page at the same instant.
export function retryDelay(attempt, random = Math.random) {
  const ceiling = Math.min(30_000, 1000 * 2 ** Math.min(Math.max(0, attempt), 5));
  return Math.round(ceiling / 2 + random() * ceiling / 2);
}

// The town sends a snapshot every 200 ms. A visible page that has heard nothing for this
// long holds a dead socket: a Wi-Fi switch, a laptop that slept, a router's idle timeout.
export const STALE_SNAPSHOT_MS = 8_000;
// The watchdog also wants several checks of its own since the last snapshot. A page frozen
// for a while (a long frame, sleep, a hidden tab) has had no chance to read its socket, and
// one late check is no verdict; a page whose every check runs late still gets one.
export const QUIET_CHECKS = 5;
// When the browser itself reports no network, the silence needs no further proof: a socket
// that has missed several snapshots is gone. A socket the loss did not reach (a local
// server) keeps delivering and stays.
export const OFFLINE_STALE_MS = 750;

export function createStalenessWatch({ staleMs = STALE_SNAPSHOT_MS, checks = QUIET_CHECKS, offlineMs = OFFLINE_STALE_MS, online = () => globalThis.navigator?.onLine !== false } = {}) {
  let last = 0, quiet = 0;
  return {
    heard(now) { last = now; quiet = 0; },
    // Back in view or online: count the checks afresh.
    resume() { quiet = 0; },
    // True when the socket should be treated as dead at this check.
    stale(now) { quiet++; return online() ? now - last > staleMs && quiet >= checks : now - last > offlineMs; },
  };
}

const WELCOME = { title: 'Your district is just ahead', description: 'Connecting you to your people and places.' };
export const CONNECTING = Object.freeze({ kind: 'connecting', ...WELCOME, status: 'Connecting to the town…', terminal: false });
// An update is a better world on its way, not a lost connection.
export const UPDATING = Object.freeze({ kind: 'updating', title: 'River Oaks is improving', description: 'An update is arriving. You will be back in the world in a moment.', status: 'Updating the world…', terminal: false });
export const IMPROVED = Object.freeze({ kind: 'improved', title: 'River Oaks has been improved', description: 'A new version of the world is ready for you.', status: 'Refresh to join the improved world.', terminal: true, refresh: true });

// Close codes the town and the page use (server/app.js, server/distributed-app.js):
// 1012 the server is being replaced by an update; 4010 a planned move to a fresh socket;
// 4000 the world or client version changed; 4003 the account may not join; 4009 the
// account joined from another tab or world. 426 is the ticket's "newer client" answer.
export function closeNotice(code, reason = '') {
  if (code === 1012) return UPDATING;
  if (code === 4000 || code === 426) return IMPROVED;
  if (code === 4003) return Object.freeze({ kind: 'denied', ...WELCOME, status: 'This account cannot join the town.', terminal: true });
  if (code === 4009) return Object.freeze({ kind: 'elsewhere', ...WELCOME, status: 'Your account joined from another tab.', terminal: true });
  if (code === 4010) return Object.freeze({ kind: 'moving', ...WELCOME, status: 'Reconnecting to the town…', terminal: false });
  return Object.freeze({ kind: 'lost', ...WELCOME, status: reason === 'No town updates.' ? 'The town went quiet. Rejoining…' : 'Connection lost. Rejoining the town…', terminal: false });
}
