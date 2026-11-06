import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
const publicDir = join(root, 'public') + sep;
// The studio's starter templates still import region JSON from preview/public; they
// are named here so any new public import fails until it moves under preview/src.
const knownPublicImports = new Set(['src/studio/templates.js']);

// Vite serves preview/public at "/" and logs "Assets in public directory cannot be
// imported from JavaScript" for every page load that requests a module under /public/.
// Run the dev server's import analysis over each client module and report any import
// that resolves into the public directory.
test('client modules import nothing from preview/public, so dev page loads log no public-asset warning', async () => {
  const server = await createServer({
    configFile: false, root, logLevel: 'silent', appType: 'custom',
    server: { middlewareMode: true, hmr: false, ws: false },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  try {
    const client = server.environments.client;
    const modules = readdirSync(join(root, 'src'), { recursive: true }).filter(file => file.endsWith('.js')).map(file => `src/${file.split(sep).join('/')}`);
    assert.ok(modules.includes('src/heights-stream.js'), 'the walk found the client modules');
    const offenders = {};
    for (const file of modules) {
      await client.transformRequest(`/${file}`);
      const node = await client.moduleGraph.getModuleByUrl(`/${file}`);
      const fromPublic = [...node.importedModules].map(imported => imported.file).filter(path => path?.startsWith(publicDir));
      if (fromPublic.length && !knownPublicImports.has(file)) offenders[file] = fromPublic.map(path => relative(root, path));
    }
    assert.deepEqual(offenders, {});
  } finally {
    await server.close();
  }
});
