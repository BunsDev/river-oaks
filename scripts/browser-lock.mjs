#!/usr/bin/env node
// Local browser journeys take turns across every session on this machine. Run
// at once they starve each other: on 2026-10-11 load averages of 285–384 made
// journeys fail with dropped town connections and timeouts that looked like code
// bugs. Hosted CI skips the lock, because each runner is its own machine.
//
//   node scripts/browser-lock.mjs <name> -- <command> [args…]   # wrap a command
//   await holdBrowserLock(name)                                 # inside a runner
import { execFileSync, spawn } from 'node:child_process';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createQueue } from './local-queue.mjs';

const commonDir = () => resolve(execFileSync('git', ['rev-parse', '--git-common-dir'], { encoding: 'utf8' }).trim());

// Resolves when it is this run's turn and returns the function that ends the turn.
// A run started by a run that already holds the lock (marked in its environment)
// goes straight through, so a wrapped runner never waits on its own wrapper.
export async function holdBrowserLock(name, {
  env = process.env, dir = env.RIVER_OAKS_BROWSER_LOCK_DIR || commonDir(), pid = process.pid, host, alive,
  sleep = ms => new Promise(done => setTimeout(done, ms)), poll = Number(env.RIVER_OAKS_BROWSER_LOCK_POLL) || 5000,
  log = line => process.stderr.write(`${line}\n`), signal,
} = {}) {
  if (env.CI === 'true' || env.RIVER_OAKS_BROWSER_LOCK === 'off' || env.RIVER_OAKS_BROWSER_LOCK_HELD) return () => {};
  const queue = createQueue({ file: join(dir, 'river-oaks-browser-runs.json'), lock: join(dir, 'river-oaks-browser-runs.lock'), pid, ...(host ? { host } : {}), ...(alive ? { alive } : {}) });
  const id = `${name}:${pid}:${Date.now()}`;
  let released = false;
  const release = () => {
    if (released) return;
    released = true; process.removeListener('exit', release);
    // A queue directory that has gone (a removed worktree's) holds nothing to release.
    try { queue.dequeue(id); } catch (error) { if (error.code !== 'ENOENT') throw error; }
  };
  queue.enqueue(id, `${name} (pid ${pid})`);
  process.once('exit', release);
  try {
    for (let ahead; (ahead = queue.position(id)) > 0;) {
      signal?.throwIfAborted();
      const holder = queue.list()[0];
      log(`Waiting for ${ahead} local browser run${ahead === 1 ? '' : 's'} to finish (running: ${holder.owner}, since ${holder.queuedAt}). Set RIVER_OAKS_BROWSER_LOCK=off to skip.`);
      await sleep(poll);
    }
  } catch (error) { release(); throw error; }
  env.RIVER_OAKS_BROWSER_LOCK_HELD = id;
  return release;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), split = args.indexOf('--');
  if (split !== 1 || split === args.length - 1) { process.stderr.write('Usage: node scripts/browser-lock.mjs <name> -- <command> [args…]\n'); process.exit(2); }
  const [command, ...rest] = args.slice(split + 1);
  const release = await holdBrowserLock(args[0]);
  const child = spawn(command, rest, { stdio: 'inherit', env: process.env });
  for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => child.kill(signal));
  child.on('error', error => { release(); process.stderr.write(`browser-lock: ${error.message}\n`); process.exit(1); });
  child.on('close', (code, signal) => { release(); process.exit(code ?? (signal ? 1 : 0)); });
}
