import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import electron from 'electron';
import { bridgeCommand, bridgeReady, waitForBridge, BRIDGE_PORT } from './runtime.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({ configFile: fileURLToPath(new URL('../preview/vite.config.js', import.meta.url)), server: { host: '127.0.0.1', port: 5174, strictPort: false, open: false } });
let child, bridge = null, stopping = false, restarting = false, timer;
// Start the Python bridge unless one is already serving. Voices (local Kokoro
// and Jev's ElevenLabs) and Jev decisions need it; without uv the game still
// runs, with device voices and local rules.
async function startBridge() {
  if (await bridgeReady(fetch)) { console.log(`  ➜  Bridge: reusing the one on 127.0.0.1:${BRIDGE_PORT}`); return; }
  const { command, args } = bridgeCommand();
  bridge = spawn(command, args, { cwd: root, env: process.env, stdio: ['ignore', 'inherit', 'inherit'] });
  bridge.once('error', error => { bridge = null; console.warn(`  ➜  Bridge not started (${error.code === 'ENOENT' ? 'uv is not installed' : error.message}); device voices and local rules only.`); });
  bridge.once('exit', code => { if (bridge && !stopping) console.warn(`  ➜  Bridge exited with code ${code}; device voices and local rules only.`); bridge = null; });
  if (await waitForBridge(fetch)) console.log(`  ➜  Bridge: decisions and local voices on 127.0.0.1:${BRIDGE_PORT}`);
  else if (bridge) console.warn('  ➜  Bridge is still starting; voices become available once it answers /health.');
}
await vite.listen();
const address = vite.httpServer.address();
const url = `http://127.0.0.1:${address.port}/`;
console.log(`River Oaks desktop development: ${url}`);
await startBridge();
function launch() {
  const env = { ...process.env, RIVER_OAKS_DEV_URL: url };
  delete env.ELECTRON_RUN_AS_NODE;
  // RIVER_OAKS_PROFILE runs a second development window beside another (its own
  // window state and single-instance lock), e.g. while the main one stays open.
  const profile = process.env.RIVER_OAKS_PROFILE ? [`--user-data-dir=${process.env.RIVER_OAKS_PROFILE}`] : [];
  child = spawn(electron, [root, ...profile], { cwd: root, env, stdio: 'inherit' });
  child.once('error', error => { console.error(error); void stop(1); });
  child.once('exit', code => {
    if (restarting && !stopping) { restarting = false; launch(); }
    else void stop(code ?? 0);
  });
}
const watcher = watch(fileURLToPath(new URL('.', import.meta.url)), (_event, filename) => {
  if (!['main.js', 'runtime.js'].includes(filename) || stopping) return;
  clearTimeout(timer);
  timer = setTimeout(() => { if (child && !restarting) { restarting = true; child.kill('SIGTERM'); } }, 200);
});
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearTimeout(timer);
  watcher.close();
  child?.kill('SIGTERM');
  bridge?.kill('SIGTERM');
  await vite.close();
  process.exitCode = code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
launch();
