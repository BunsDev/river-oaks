// How the town ends a socket, shared by server/app.js and server/distributed-app.js and read
// by the page (preview/src/connection-policy.js).
// An update replaces the server: 1012 is the WebSocket "service restart" code, and the page
// says the world is improving rather than that the player was disconnected. A planned move
// to a fresh socket (the host's request limit) closes with 4010 after a rotate notice.
export const UPDATE_CLOSE = Object.freeze({ code: 1012, reason: 'River Oaks is updating.' });
export const MOVE_CLOSE = Object.freeze({ code: 4010, reason: 'Moving to a fresh connection.' });
export const ROTATE_NOTICE_MS = 15_000;
const OPEN = 1;

// Retires a socket before the host would cut it: first the notice, so the page can move to a
// fresh socket without dropping anything, then the close. Returns the cancel for its close handler.
export function retireAfter(ws, lifetimeMs, { noticeMs = ROTATE_NOTICE_MS, notify }) {
  if (!Number.isFinite(lifetimeMs) || lifetimeMs <= 0) return () => {};
  const notice = setTimeout(notify, Math.max(0, lifetimeMs - noticeMs));
  const close = setTimeout(() => { if (ws.readyState === OPEN) ws.close(MOVE_CLOSE.code, MOVE_CLOSE.reason); }, lifetimeMs);
  notice.unref?.(); close.unref?.();
  return () => { clearTimeout(notice); clearTimeout(close); };
}

// The rotate notice a page receives: how long it has before this socket closes, and the
// connection it is leaving, which the fresh socket presents (`continues`) so voice can follow.
export const rotateNotice = (lifetimeMs, noticeMs = ROTATE_NOTICE_MS, connectionId = null) => ({ type: 'rotate', closeInMs: Math.min(noticeMs, lifetimeMs), ...(connectionId ? { connectionId } : {}) });
// A `continues` value from the upgrade URL, or null.
export const continuedConnection = value => typeof value === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(value) ? value : null;

// Tells every page the world is updating, waits briefly for the close handshakes, then makes
// sure no socket outlives the shutdown.
export async function closeForUpdate(sockets, { waitMs = 500 } = {}) {
  const all = [...sockets], open = all.filter(ws => ws.readyState === OPEN);
  for (const ws of open) { try { ws.close(UPDATE_CLOSE.code, UPDATE_CLOSE.reason); } catch { /* already closing */ } }
  await Promise.race([
    Promise.all(open.map(ws => new Promise(resolve => ws.once('close', resolve)))),
    new Promise(resolve => { const timer = setTimeout(resolve, waitMs); timer.unref?.(); }),
  ]);
  for (const ws of all) ws.terminate();
}
