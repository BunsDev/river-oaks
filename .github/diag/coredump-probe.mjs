// Diagnostic only (#370): how long does a crashing process take to exit while
// systemd-coredump reads its core, and does SIGKILL end that wait?
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const status = pid => { try { return readFileSync(`/proc/${pid}/status`, 'utf8'); } catch { return null; } };
const field = (text, name) => text?.match(new RegExp(`^${name}:\\s*(.*)$`, 'm'))?.[1] ?? null;

async function crash({ label, kill, megabytes }) {
  // The child fills incompressible memory, reports ready, then aborts (SIGABRT dumps core).
  const child = spawn(process.execPath, ['-e', `
    const { randomFillSync } = require('node:crypto');
    const chunks = [];
    for (let i = 0; i < ${megabytes} / 64; i++) chunks.push(randomFillSync(Buffer.allocUnsafe(64 * 1024 * 1024)));
    process.stdout.write('ready ' + chunks.length + '\\n');
    setTimeout(() => process.abort(), 200);
  `], { stdio: ['ignore', 'pipe', 'inherit'] });
  await new Promise(resolve => child.stdout.once('data', resolve));
  const rss = field(status(child.pid), 'VmRSS');
  const started = performance.now();
  let dumping = null, killed = null, state = null;
  const exited = new Promise(resolve => child.once('exit', (code, signal) => resolve({ code, signal, ms: Math.round(performance.now() - started) })));
  const poll = setInterval(() => {
    const text = status(child.pid);
    state = field(text, 'State') ?? state;
    if (dumping === null && field(text, 'CoreDumping') === '1') {
      dumping = Math.round(performance.now() - started);
      if (kill) { process.kill(child.pid, 'SIGKILL'); killed = Math.round(performance.now() - started); }
    }
  }, 20);
  const timeout = new Promise(resolve => setTimeout(() => resolve({ timedOut: true, ms: 600_000 }), 600_000));
  const result = await Promise.race([exited, timeout]);
  clearInterval(poll);
  const line = { label, megabytes, rss, coreDumpingSeenMs: dumping, sigkillMs: killed, lastState: state, ...result };
  console.log(JSON.stringify(line));
  return line;
}

console.log('core_pattern', readFileSync('/proc/sys/kernel/core_pattern', 'utf8').trim());
console.log('suid_dumpable', readFileSync('/proc/sys/fs/suid_dumpable', 'utf8').trim());
console.log('kernel', execFileSync('uname', ['-r'], { encoding: 'utf8' }).trim());
const results = [];
for (const megabytes of [1216]) {
  results.push(await crash({ label: 'left alone', kill: false, megabytes }));
  results.push(await crash({ label: 'SIGKILL when CoreDumping: 1', kill: true, megabytes }));
}
try { console.log(execFileSync('coredumpctl', ['list', '--no-pager'], { encoding: 'utf8' })); } catch (error) { console.log('coredumpctl:', error.message); }
