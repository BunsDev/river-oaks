// Standalone asset fixture: no town server, account, or app auth configuration.
// Run through scripts/browser-lock.mjs like other local browser checks.
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { ANIMATION_CLIP_GROUPS } from '../src/animation-clip-assets.js';

const output = resolve('.runtime/quaternius-phase2/browser-check.json');
const envDir = await mkdtemp(join(tmpdir(), 'quaternius-clip-env-'));
let server, browser;
const errors = [];
try {
  const allowed = new Set(Object.values(ANIMATION_CLIP_GROUPS).map(entry => entry.url));
  server = await createServer({
    configFile: false, envDir, publicDir: false, root: process.cwd(),
    server: { host: '127.0.0.1', port: 0 }, logLevel: 'error',
    plugins: [{ name: 'quaternius-clip-fixture', configureServer(vite) {
      vite.middlewares.use(async (req, res, next) => {
        try {
          if (allowed.has(req.url)) {
            res.setHeader('Content-Type', 'model/gltf-binary');
            res.end(await readFile(resolve(`preview/public${req.url}`)));
          } else if (req.url === '/__quaternius-fixture') {
            res.setHeader('Content-Type', 'text/html');
            res.end(await vite.transformIndexHtml(req.url, `<!doctype html><title>Quaternius clip acceptance</title>
<script type="module">
import { AnimationMixer } from 'three';
import { ANIMATION_CLIP_GROUPS, createAnimationClipLibrary } from '/preview/src/animation-clips.js';
window.clipCheck = (async () => {
  const library = createAnimationClipLibrary();
  let rejected = false;
  try { await library.load('ambient-idle', { family: 'makehuman-game-v1' }); }
  catch (error) { rejected = /family/.test(error.message); }
  if (!rejected) throw new Error('Unsupported family was not rejected');
  const groups = [];
  for (const [group, entry] of Object.entries(ANIMATION_CLIP_GROUPS)) {
    const { scene, animations } = await library.load(group, { family: 'quaternius-ual-v1' });
    const root = scene.getObjectByName('root');
    const original = root.position.toArray();
    const mixer = new AnimationMixer(scene);
    for (const clip of animations) {
      mixer.stopAllAction(); mixer.clipAction(clip).play();
      for (const fraction of [0, .25, .5, .75]) {
        mixer.setTime(clip.duration * fraction);
        if (root.position.toArray().some((v, i) => v !== original[i])) throw new Error('Root drift');
        for (const name of entry.joints) {
          const node = scene.getObjectByName(name);
          if (!node || ![...node.position.toArray(), ...node.quaternion.toArray(), ...node.scale.toArray()].every(Number.isFinite)) throw new Error('Invalid joint');
        }
      }
    }
    mixer.stopAllAction(); mixer.uncacheRoot(scene);
    groups.push({ group, clips: animations.map(clip => clip.name), sha256: entry.sha256 });
  }
  library.clear();
  return { groups, rejectedUnsupportedFamily: rejected };
})();
</script>`));
          } else next();
        } catch (error) { next(error); }
      });
    } }],
  });
  await server.listen();
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', error => errors.push(error.message));
  const address = server.httpServer.address();
  await page.goto(`http://127.0.0.1:${address.port}/__quaternius-fixture`);
  await page.waitForFunction(() => Boolean(window.clipCheck));
  const result = await page.evaluate(() => window.clipCheck);
  assert.equal(result.groups.length, 5);
  assert.equal(result.groups.reduce((sum, group) => sum + group.clips.length, 0), 39);
  assert.deepEqual(errors, []);
  await mkdir(resolve('.runtime/quaternius-phase2'), { recursive: true });
  await writeFile(output, JSON.stringify({ status: 'passed', browser: browser.version(), ...result, errors }, null, 2) + '\n');
  console.log(`Passed: browser loaded five pinned groups and played 39 clips; report ${output}`);
} finally {
  await browser?.close();
  await server?.close();
  await rm(envDir, { recursive: true, force: true });
}
