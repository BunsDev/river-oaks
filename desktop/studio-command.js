import { spawn } from 'node:child_process';
import { HostError } from './host-error.js';

// Only the host supplies executable/argv/env. Renderer input never selects commands.
// Prompts go in `input`, written to stdin: Windows caps a whole command line at
// 32,767 characters and Linux caps one argument at 128 KiB, and a prompt with scene
// context or installed skills can pass both. Without input, stdin stays closed.
export function runStudioCommand(executable, args, { cwd, env = process.env, signal, timeout = 120000, maxBytes = 512 * 1024, onStdout = null, input = null } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new HostError('Design request canceled.'));
    const child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: [input === null ? 'ignore' : 'pipe','pipe','pipe'] });
    if (input !== null) {
      // A child that exits before reading everything closes the pipe (EPIPE); its exit
      // status, not the write, decides the result.
      child.stdin.on('error', () => {});
      child.stdin.end(input);
    }
    let output = '', size = 0, failure = null, killTimer;
    const kill = () => { try { if (process.platform === 'win32') child.kill('SIGTERM'); else process.kill(-child.pid, 'SIGTERM'); } catch { /* Child already exited. */ } };
    const stop = message => {
      failure ??= new HostError(message); kill();
      killTimer ??= setTimeout(() => { try { if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch { /* Gone. */ } }, 1500);
    };
    const abort = () => stop('Design request canceled.');
    signal?.addEventListener('abort', abort, { once: true });
    const timer = setTimeout(() => stop('Designer runtime timed out.'), timeout);
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', data => { size += Buffer.byteLength(data); if (size > maxBytes) stop('Designer output exceeded its limit.'); else { output += data; onStdout?.(data); } });
    // Count but do not return stderr: runtime diagnostics can contain private host data.
    child.stderr.on('data', data => { size += data.length; if (size > maxBytes) stop('Designer output exceeded its limit.'); });
    const cleanup = () => { clearTimeout(timer); clearTimeout(killTimer); signal?.removeEventListener('abort', abort); };
    child.once('error', () => { cleanup(); reject(new HostError('Designer executable could not start. Configure it in desktop host settings.')); });
    child.once('close', code => { cleanup(); if (failure) reject(failure); else if (code !== 0) reject(new HostError('Designer runtime failed. Check its sign-in and configuration on this device.')); else resolve(output); });
  });
}
