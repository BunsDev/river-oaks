import { WebSocket } from 'ws';

// World snapshots are complete and each supersedes the last (about 110 kB at
// 5 Hz). A browser that stalls for a second, loading its scene or on a slow
// link, used to cross a 512 kB buffer and be disconnected. Snapshots are now
// skipped while its buffer drains; command results are never skipped. Only a
// buffer that keeps growing past the hard limit closes the socket, and dead
// peers are still caught by the heartbeat.
export const SNAPSHOT_SKIP_BYTES = 256 * 1024;
export const SLOW_CLOSE_BYTES = 4 * 1024 * 1024;

export function sendFrame(ws, value, { snapshot = false } = {}) {
  if (ws.readyState !== WebSocket.OPEN) return 'closed';
  if (ws.bufferedAmount > SLOW_CLOSE_BYTES) { ws.close(1013, 'Connection too slow'); return 'closed'; }
  if (snapshot && ws.bufferedAmount > SNAPSHOT_SKIP_BYTES) return 'skipped';
  ws.send(typeof value === 'string' ? value : JSON.stringify(value));
  return 'sent';
}
