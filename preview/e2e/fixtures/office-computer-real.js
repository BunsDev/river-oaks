// A real TypeSafe Computer checkout for the office-computer-real journey (#487): its own
// server.js on a separate loopback origin, with TSC_AUTH=off dev users and in-memory account
// sync, and TSC_PLACE_ORIGINS naming the Place fixture. Not hosted WorkOS sign-in, Upstash or a
// real origin pair; it proves the Place desk against Computer's actual embed child.
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';

const freePort = () => new Promise((done, fail) => {
  const probe = createServer();probe.once('error', fail);
  probe.listen(0, '127.0.0.1', () => { const { port } = probe.address(); probe.close(() => done(port)); });
});
const git = (checkout, ...args) => execFileSync('git', ['-C', checkout, ...args], { encoding: 'utf8' }).trim();

/** The origin is fixed first, so Place can be built with it; the server starts once Place's origin is known. */
export async function startRealComputer({ checkout = process.env.RIVER_OAKS_COMPUTER_CHECKOUT } = {}) {
  if (!checkout) throw new Error('Set RIVER_OAKS_COMPUTER_CHECKOUT to a TypeSafe Computer checkout with embed mode.');
  const root = resolve(checkout);
  if (!existsSync(join(root, 'server.js')) || !existsSync(join(root, 'src/server/embed.js'))) throw new Error(`${root} is not a TypeSafe Computer checkout with embed mode (src/server/embed.js).`);
  if (!existsSync(join(root, 'out/renderer/index.html'))) throw new Error(`Build Computer first: npm run build:renderer in ${root}.`);
  const port = await freePort(), origin = `http://127.0.0.1:${port}`;
  const revision = { head: git(root, 'rev-parse', 'HEAD'), branch: git(root, 'rev-parse', '--abbrev-ref', 'HEAD'), dirty: git(root, 'status', '--porcelain') !== '' };
  let child = null, parent = null;
  // Starts server.js on the fixed port with these Place origins, and waits until /api/embed lists them.
  const start = async (placeOrigins) => {
    child = spawn(process.execPath, ['server.js'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, HOME: process.env.HOME, PORT: String(port), TSC_AUTH: 'off', TSC_PLACE_ORIGINS: placeOrigins, TYPESAFE_API_KEY: '' } });
    const output = [];child.stdout.on('data', d => output.push(String(d)));child.stderr.on('data', d => output.push(String(d)));
    for (let tries = 0; tries < 100; tries++) {
      if (child.exitCode !== null) throw new Error(`Computer server.js exited: ${output.join('').slice(-500)}`);
      const ready = await fetch(`${origin}/api/embed`).then(r => r.ok ? r.json() : null).catch(() => null);
      if (ready?.placeOrigins?.join(',') === placeOrigins) return;
      await new Promise(r => setTimeout(r, 100));
    }
    throw new Error(`Computer server.js did not start on ${origin}: ${output.join('').slice(-500)}`);
  };
  const stop = async () => {
    if (!child || child.exitCode !== null) return;
    const exited = new Promise(r => child.once('exit', r));child.kill('SIGTERM');await exited;
  };
  return {
    origin, revision,
    async setParentOrigin(parentOrigin) { parent = parentOrigin;await start(parentOrigin); },
    // Denied framing: the same Computer restarted with another Place origin on its list, so its own
    // frame-ancestors refuses this Place. Account sync is in memory, so this restart forgets it.
    async refuseFraming() { await stop();await start('https://other-place.example.test'); },
    async allowFraming() { await stop();await start(parent); },
    close: stop,
  };
}
