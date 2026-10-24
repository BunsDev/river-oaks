// Adds a separate authenticated game entry without changing the normal entry or
// moving generated game chunks outside /assets (the existing auth boundary).
import { readFile, readdir, writeFile, mkdir, realpath, lstat } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
const hash = data => createHash('sha256').update(data).digest('hex');
export function diagnosticConfig(config) {
  return { ...config, buildCommand: 'corepack pnpm run build && corepack pnpm exec vite build --config preview/vite.config.js --mode ios-probe --outDir ../.runtime/ios-probe/diagnostic-build && node experiments/ios-probe/package-hosted-diagnostic.mjs' };
}
export async function packageDiagnostic({ normal = 'dist/preview', diagnostic = '.runtime/ios-probe/diagnostic-build' } = {}) {
  normal = await realpath(normal); diagnostic = await realpath(diagnostic);
  if (normal === diagnostic || normal.startsWith(diagnostic + '/') || diagnostic.startsWith(normal + '/')) throw new Error('Build roots must be separate');
  for (const directory of ['assets', 'ios-probe']) {
    try {
      if (!(await lstat(join(normal, directory))).isDirectory()) throw new Error('Invalid destination directory: ' + directory);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
  const entry = await readFile(join(diagnostic, 'index.html'));
  const files = [{ path: 'ios-probe/index.html', data: entry }];
  for (const item of await readdir(join(diagnostic, 'assets'), { withFileTypes: true })) {
    if (!item.isFile() || !/^[A-Za-z0-9_-]+-[A-Za-z0-9_-]{8}\.(?:js|css)$/.test(item.name)) continue;
    files.push({ path: 'assets/' + item.name, data: await readFile(join(diagnostic, 'assets', item.name)) });
  }
  if (!files.some(file => /^assets\/index-.*\.js$/.test(file.path))) throw new Error('Missing diagnostic entry bundle');
  // Check every collision before adding anything. Never overwrite normal assets.
  const added = [];
  for (const file of files) {
    const target = join(normal, file.path);
    try {
      if (!(await lstat(target)).isFile() || hash(await readFile(target)) !== hash(file.data)) throw new Error('Diagnostic filename collision: ' + file.path);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      added.push(file);
    }
  }
  for (const file of added) {
    await mkdir(resolve(normal, file.path, '..'), { recursive: true });
    await writeFile(join(normal, file.path), file.data, { flag: 'wx' });
  }
  return { entry: '/ios-probe/', added: added.map(file => file.path), files: files.map(file => ({ path: file.path, sha256: hash(file.data) })) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mkdir('.runtime/ios-probe', { recursive: true });
  if (process.argv.length === 3 && process.argv[2] === '--config') {
    const config = diagnosticConfig(JSON.parse(await readFile('vercel.json', 'utf8')));
    await writeFile('.runtime/ios-probe/vercel-diagnostic.json', JSON.stringify(config, null, 2) + '\n');
    console.log('Prepared local alternate config; no deployment performed.');
  } else if (process.argv.length === 2) {
    const receipt = await packageDiagnostic();
    await writeFile('.runtime/ios-probe/hosted-diagnostic-package.json', JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({ entry: receipt.entry, added: receipt.added.length }));
  } else throw new Error('Usage: node experiments/ios-probe/package-hosted-diagnostic.mjs [--config]');
}
