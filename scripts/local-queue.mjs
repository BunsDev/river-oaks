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

export function createQueue({ file, lock, pid = process.pid, host = hostname(), alive = isAlive, now = () => new Date().toISOString(), watchDirectory = watch, recheckMs = 1000 }) {
  const every = Number.isFinite(recheckMs) && recheckMs > 0 ? recheckMs : 1000;
  const withLock = action => {
    for (let tries = 0; ; tries++) {
      try { mkdirSync(lock); break; } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        // The lock guards a few milliseconds of work; one older than 30 s was abandoned.
        try { if (Date.now() - statSync(lock).mtimeMs > 30000) { rmdirSync(lock); continue; } } catch { continue; }
        if (tries > 400) throw Object.assign(new Error(`The queue lock is held: ${lock}`), { code: 'QUEUE_LOCK_HELD' });
        pause(25);
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
        let watcher, recheck;
        const finish = error => { clearTimeout(timer); clearInterval(recheck); watcher?.close(); error ? reject(error) : resolve(); };
        const check = ({ expired = false, tick = false } = {}) => {
          try {
            const position = queue.list().findIndex(entry => mine(entry, id));
            if (position < 0) finish(new Error(`${id} is no longer queued by this session.`));
            else if (position === 0 || expired) finish();
          } catch (error) {
            // A lock left behind is cleared after 30 s; a recheck that meets it waits for the next tick.
            if (!(tick && lockHeld(error))) finish(error);
          }
        };
        const timer = setTimeout(() => check({ expired: true }), timeoutMs);
        recheck = setInterval(() => check({ tick: true }), every);
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
