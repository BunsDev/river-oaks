import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import Redis from 'ioredis';

// Only ever starts an owned loopback process with synthetic data. No REDIS_URL,
// provider configuration, existing database or user-supplied directory is used.
export async function officeRedis() {
  const directory = await mkdtemp(join(tmpdir(), 'river-office-redis-'));
  const reservation = createServer();
  reservation.listen(0, '127.0.0.1');
  await once(reservation, 'listening');
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  let process, client;
  async function start({ aof = true } = {}) {
    process = spawn('redis-server', ['--bind', '127.0.0.1', '--port', String(port),
      '--dir', directory, '--save', '', '--appendonly', aof ? 'yes' : 'no',
      '--appendfsync', 'always', '--protected-mode', 'yes'], { stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Owned Redis startup timed out')), 10000);
      const finish = error => { clearTimeout(timer); error ? reject(error) : resolve(); };
      process.once('error', finish);
      process.once('exit', code => finish(Error(`Owned Redis exited during startup: ${code}`)));
      process.stdout.on('data', chunk => { if (chunk.toString().includes('Ready to accept connections')) finish(); });
    });
    client = new Redis(port, '127.0.0.1', { retryStrategy: null });
    client.on('error', () => {});
    await client.ping();
    return client;
  }
  async function stop({ crash = false } = {}) {
    client?.disconnect();
    if (process && process.exitCode === null && process.signalCode === null) {
      const exited = once(process, 'exit');
      process.kill(crash ? 'SIGKILL' : 'SIGTERM');
      await exited;
    }
  }
  return { directory, port, start, stop, async close() { await stop(); await rm(directory, { recursive: true, force: true }); } };
}
