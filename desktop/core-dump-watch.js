import { readFile } from 'node:fs/promises';

// Linux only (#370). Where the kernel pipes core dumps to systemd-coredump, a
// crashed game renderer stays alive, its IPC channel open, until the collector
// has read the whole core: about five minutes for the game's renderer on the CI
// runner. Electron reports render-process-gone only after that, so the window
// shows the dead game and the automatic recovery waits. While the kernel writes
// a core, /proc/<pid>/status reads "CoreDumping: 1" (Linux 4.15+). A fatal
// signal interrupts the dump, the process exits, render-process-gone fires and
// the normal recovery in main.js runs. That crash's core dump is lost.
export function coreDumping(status) {
  return /^CoreDumping:\s*1\s*$/m.test(status ?? '');
}

// Polls the renderer named by `pid()` while the window lives; returns stop().
// Each renderer is ended once: after SIGKILL it can still read as dumping for a
// moment before it exits, and its PID must never be signalled again.
export function watchCoreDumps({ pid, readStatus = id => readFile(`/proc/${id}/status`, 'utf8'), kill = id => process.kill(id, 'SIGKILL'),
  onEnd = () => {}, intervalMs = 1000, timers = globalThis } = {}) {
  let busy = false, ended = 0;
  const timer = timers.setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const id = pid();
      if (!(id > 0) || id === ended || !coreDumping(await readStatus(id).catch(() => null))) return;
      ended = id;
      try { kill(id); } catch (error) { if (error.code !== 'ESRCH') throw error; return; }
      onEnd(id);
    } catch (error) { console.error('Core dump watch failed:', error.message); }
    finally { busy = false; }
  }, intervalMs);
  timer.unref?.();
  return () => timers.clearInterval(timer);
}
