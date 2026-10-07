// Real loopback town and authenticated test identities for browser acceptance.
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
async function freePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => { socket.once('error', reject); socket.listen(0, '127.0.0.1', resolve); });
  const port = socket.address().port;
  await new Promise(resolve => socket.close(resolve));
  return port;
}
export async function startBrowserFixture() {
  const web = await freePort();
  let town = await freePort();
  while (town === web) town = await freePort();
  const child = spawn(process.execPath, ['server/tests/browser-fixture.js'], {
    cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RIVER_OAKS_TEST_CREATOR: '1', RIVER_OAKS_DEV_TOWN: 'off', RIVER_OAKS_TEST_WEB_PORT: String(web), RIVER_OAKS_DEV_TOWN_PORT: String(town) },
  });
  const close = async () => {
    if (child.exitCode !== null || child.signalCode !== null) return;
    const exited = once(child, 'exit');
    const timer = setTimeout(() => child.kill('SIGKILL'), 5000);
    child.kill('SIGTERM');
    try { await exited; } finally { clearTimeout(timer); }
  };
  try {
    await new Promise((resolve, reject) => {
      let output = '';
      const timer = setTimeout(() => finish(new Error(`Browser fixture startup timed out: ${output}`)), 30000);
      const finish = error => { clearTimeout(timer); error ? reject(error) : resolve(); };
      child.once('error', finish);
      child.once('exit', code => finish(new Error(`Browser fixture exited ${code}: ${output}`)));
      for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
        output = (output + chunk).slice(-4000);
        if (output.includes('Multiplayer browser fixture:')) finish();
      });
    });
    return { origin: `http://127.0.0.1:${web}`, close };
  } catch (error) { await close(); throw error; }
}
