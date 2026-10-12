// A first-come queue shared by every session and worktree on this machine: a JSON
// file in the common Git directory, changed only under a short lock. Landing
// (land-pr.mjs) and local browser runs (browser-lock.mjs) take turns through it.
import { mkdirSync, readFileSync, renameSync, rmdirSync, statSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';

const isAlive = pid => { try { process.kill(pid, 0); return true; } catch (error) { return error.code === 'EPERM'; } };
const pause = ms => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
// Landing queues written before 2026-10-12 keyed entries by "pr".
const key = entry => entry.id ?? entry.pr;

export function createQueue({ file, lock, pid = process.pid, host = hostname(), alive = isAlive, now = () => new Date().toISOString() }) {
  const withLock = action => {
    for (let tries = 0; ; tries++) {
      try { mkdirSync(lock); break; } catch (error) {
        if (error.code !== 'EEXIST') throw error;
        // The lock guards a few milliseconds of work; one older than 30 s was abandoned.
        try { if (Date.now() - statSync(lock).mtimeMs > 30000) { rmdirSync(lock); continue; } } catch { continue; }
        if (tries > 400) throw new Error(`The queue lock is held: ${lock}`);
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
  return {
    enqueue(id, owner = `pid ${pid}`) {
      withLock(() => {
        const entries = live(read()), queued = entries.find(entry => key(entry) === id);
        if (queued && !mine(queued, id)) throw new Error(`${id} is already queued by ${queued.owner} (pid ${queued.pid}).`);
        if (!queued) entries.push({ id, pid, host, owner, queuedAt: now() });
        write(entries);
      });
    },
    position(id) { return withLock(() => { const entries = live(read()); write(entries); return entries.findIndex(entry => mine(entry, id)); }); },
    dequeue(id) { withLock(() => write(live(read()).filter(entry => !mine(entry, id)))); },
    list() { return withLock(() => live(read()).map(entry => ({ ...entry, id: key(entry) }))); },
  };
}
