import { createServer } from 'vite';
import { spawn } from 'node:child_process';
import { watch } from 'node:fs';
import { fileURLToPath } from 'node:url';
import electron from 'electron';

const root = fileURLToPath(new URL('../', import.meta.url));
const vite = await createServer({ configFile: fileURLToPath(new URL('../preview/vite.config.js', import.meta.url)), server: { host: '127.0.0.1', port: 5174, strictPort: false, open: false } });
let child, stopping = false, restarting = false, timer;
await vite.listen();
const address = vite.httpServer.address();
const url = `http://127.0.0.1:${address.port}/`;
console.log(`River Oaks desktop development: ${url}`);
function launch() {
  const env = { ...process.env, RIVER_OAKS_DEV_URL: url };
  delete env.ELECTRON_RUN_AS_NODE;
  child = spawn(electron, [root], { cwd: root, env, stdio: 'inherit' });
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
  await vite.close();
  process.exitCode = code;
}
process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
launch();
