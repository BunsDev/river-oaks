import { spawn } from 'node:child_process';

// Only the host supplies executable/argv/env. Renderer input never selects commands.
export function runStudioCommand(executable, args, { cwd, env = process.env, signal, timeout = 120000, maxBytes = 512 * 1024, onStdout = null } = {}) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Design request canceled.'));
    const child = spawn(executable, args, { cwd, env, shell: false, windowsHide: true, detached: process.platform !== 'win32', stdio: ['ignore','pipe','pipe'] });
    let output = '', size = 0, failure = null, killTimer;
    const kill = () => { try { if (process.platform === 'win32') child.kill('SIGTERM'); else process.kill(-child.pid, 'SIGTERM'); } catch { /* Child already exited. */ } };
    const stop = message => {
      failure ??= new Error(message); kill();
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
    child.once('error', () => { cleanup(); reject(new Error('Designer executable could not start. Configure it in desktop host settings.')); });
    child.once('close', code => { cleanup(); if (failure) reject(failure); else if (code !== 0) reject(new Error('Designer runtime failed. Check its sign-in and configuration on this device.')); else resolve(output); });
  });
}

export function parseDesignerStream(text) {
  let answer = '', initialized = false, completed = false;
  for (const line of text.split('\n').filter(line => line.trim())) {
    const event = JSON.parse(line);
    if (event.type === 'system' && event.subtype === 'init') {
      if (event.permission !== 'read-only') throw Error('Runtime did not confirm read-only mode.');
      initialized = true;
    }
    if (event.type === 'assistant') {
      const content = event.message?.content;
      if (Array.isArray(content)) answer = content.filter(block => block.type === 'text').map(block => block.text).join('\n');
    }
    if (event.type === 'result') { if (event.is_error) throw Error('Designer runtime reported failure.'); completed = true; }
  }
  if (!initialized || !completed || !answer) throw Error('Designer returned an incomplete response.');
  // Strict JSON only. No code blocks, executable snippets or permissive extraction.
  return JSON.parse(answer);
}
