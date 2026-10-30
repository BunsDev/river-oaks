// A first-come queue shared by every session and worktree on this machine: a JSON
// file in the common Git directory, changed only under a short lock. Landing
// (land-pr.mjs) and local browser runs (browser-lock.mjs) take turns through it.
import { mkdirSync, readFileSync, renameSync, rmdirSync, statSync, watch, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { basename, dirname } from 'node:path';

const isAlive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// Landing queues written before 2026-10-12 keyed entries by "pr".
const key = entry => entry.id ?? entry.pr;
const lockHeld = error => error?.code === 'QUEUE_LOCK_HELD';

// The lock guards a few milliseconds of work; one older than this was abandoned.
const STALE_LOCK_MS = 30000;

export function createQueue({ file, lock, pid = process.pid, host = hostname(), alive = isAlive, now = () => new Date().toISOString(), watchDirectory = watch, recheckMs = 1000, lockWaitMs = STALE_LOCK_MS + 5000 }) {
  const every = Number.isFinite(recheckMs) && recheckMs > 0 ? recheckMs : 1000;
  const withLock = action => {
    // mkdir is not a fair lock: under load, every waiter woken by the same queue
    // write contends at once and one can lose many rounds in a row. Wait past the
    // stale threshold, so a busy lock delays a caller and only a lock that keeps
    // being taken fails it.
    const start = Date.now();
    for (;;) {
      try { mkdirSync(lock); break; } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        try { if (Date.now() - statSync(lock).mtimeMs > STALE_LOCK_MS) { rmdirSync(lock); continue; } } catch { continue; }
        if (Date.now() - start > lockWaitMs) throw Object.assign(new Error(`The queue lock is held: ${lock}`), { code: 'QUEUE_LOCK_HELD' });
        pause(10 + Math.floor(Math.random() * 30));
      }
    }
    try { return action(); } finally { rmdirSync(lock); }
  };
  const read = () => { try { return JSON.parse(readFileSync(file, 'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } };
  const write = entries => { const temporary = `${file}.${pid}`; writeFileSync(temporary, JSON.stringify(entries, null, 2) + '\n'); renameSync(temporary, file); };
  // An entry whose process has died would block everyone behind it.
  const live = entries => entries.filter(entry => entry.host !== host || alive(entry.pid));
  const mine = (entry, id) => key(entry) === id && entry.pid === pid && entry.host === host;
  const queue = {
    enqueue(id, owner = `pid ${pid}`) {
      withLock(() => {
        const entries = live(read()), queued = entries.find(entry => key(entry) === id);
        if (queued && !mine(queued, id)) throw new Error(`${id} is already queued by ${queued.owner} (pid ${queued.pid}).`);
        // A landing entry also carries "pr" so the lander from #272, which reads only that
        // key, still sees it while checkouts change over.
        if (!queued) entries.push({ id, ...(Number.isInteger(id) ? { pr: id } : {}), pid, host, owner, queuedAt: now() });
        write(entries);
      });
    },
    position(id) { return withLock(() => { const entries = live(read()); write(entries); return entries.findIndex(entry => mine(entry, id)); }); },
    dequeue(id) { withLock(() => write(live(read()).filter(entry => !mine(entry, id)))); },
    list() { return withLock(() => live(read()).map(entry => ({ ...entry, id: key(entry) }))); },
    // Watch the directory because writes replace the queue file atomically.
    // Notifications and the recheck only prompt a fresh ownership/position check;
    // they never grant a turn. On macOS a directory watch starts its FSEvents
    // stream asynchronously, so a release made before the stream is live is never
    // reported (a load-dependent window); the short recheck bounds that wake, and
    // the timer returns control to the caller at its own interval.
    waitForTurn(id, timeoutMs) {
      return new Promise((resolve, reject) => {
        let watcher, recheck, expiredWhileHeld = false;
        const finish = error => { clearTimeout(timer); clearInterval(recheck); watcher?.close(); error ? reject(error) : resolve(); };
        const check = ({ expired = false } = {}) => {
          try {
            const position = queue.list().findIndex(entry => mine(entry, id));
            if (position < 0) finish(new Error(`${id} is no longer queued by this session.`));
            else if (position === 0 || expired || expiredWhileHeld) finish();
          } catch (error) {
            // A held lock is contention, not a lost turn: whatever woke this check
            // (a notification, the recheck or the timer), the next recheck tries again.
            if (!lockHeld(error)) finish(error);
            else if (expired) expiredWhileHeld = true;
          }
        };
        const timer = setTimeout(() => check({ expired: true }), timeoutMs);
        recheck = setInterval(() => check(), every);
        try {
          watcher = watchDirectory(dirname(file), (_event, name) => { if (name === null || String(name) === basename(file)) check(); });
          watcher.on('error', () => watcher.close()); // Keep the recheck and timer.
        } catch { /* Watching is an optimization; the recheck and timer remain. */ }
        check(); // A release before the watch was attached.
      });
    },
  };
  return queue;
}
