import { execFileSync } from 'node:child_process';

// This identifies the harness checkout, never a separately launched binary or
// the hosted renderer. Missing provenance stays unknown rather than using CI env.
export function harnessSource(root) {
  try {
    const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', timeout: 2000, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    return { status: 'observed', revision: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']), dirty: git(['status', '--porcelain']) !== '' };
  } catch {
    return { status: 'unavailable', reason: 'harness-git-checkout-unavailable' };
  }
}

// Playwright serializes these observers into separate Electron/renderer realms.
// Keep them closure-free and collect only identity fields, never account data.
export function applicationIdentity({ app }) {
  return { status: 'observed', version: app.getVersion(), isPackaged: app.isPackaged,
    platform: process.platform, arch: process.arch,
    runtime: { electron: process.versions.electron, chrome: process.versions.chrome, node: process.versions.node },
    sourceRevision: { status: 'unavailable', reason: 'application-does-not-expose-source-revision' } };
}

export function rendererRevisions() {
  const field = (value, key) => value && Object.hasOwn(value, key) && value[key] !== undefined
    ? { status: 'observed', value: value[key] }
    : { status: 'unavailable', reason: 'field-not-exposed' };
  let style, content;
  try {
    const finish = window.__riverSpatialStream?.()?.finish;
    style = finish ? { status: 'observed', preference: field(finish, 'preference'),
      // Null means this component is unattached, not that it uses the preference.
      components: Object.fromEntries(['commons', 'heights', 'campus', 'ribbon', 'fiveRooms', 'fiveRoomsLandscape'].map(key => [key, field(finish, key)])) }
      : { status: 'unavailable', reason: 'renderer-finish-observer-unavailable' };
  } catch {
    style = { status: 'unavailable', reason: 'renderer-finish-observation-failed' };
  }
  try {
    const town = window.__riverMultiplayer?.(), snapshot = town?.snapshot;
    content = snapshot ? { status: 'observed', source: 'accepted-multiplayer-snapshot', connected: Boolean(town.connected),
      worldId: field(snapshot, 'worldId'), protocolVersion: field(snapshot, 'protocolVersion'),
      districtRevision: field(snapshot, 'districtRevision'), regionSha256: field(snapshot, 'regionSha256'), snapshotRevision: field(snapshot, 'revision') }
      : { status: 'unavailable', reason: 'accepted-world-snapshot-unavailable' };
  } catch {
    content = { status: 'unavailable', reason: 'accepted-world-observation-failed' };
  }
  return { capturedAt: new Date().toISOString(), sourceRevision: { status: 'unavailable', reason: 'renderer-does-not-expose-source-revision' }, style, content };
}

async function boundedObservation(evaluate, kind, timeoutMs) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(evaluate), new Promise(resolve => {
      timer = setTimeout(() => resolve({ status: 'unavailable', reason: `${kind}-observation-timed-out` }), timeoutMs);
    })]);
  } catch { return { status: 'unavailable', reason: `${kind}-observation-failed` }; }
  finally { clearTimeout(timer); }
}

export function observeApplication(app, timeoutMs = 2000) {
  return boundedObservation(() => app.evaluate(applicationIdentity), 'application', timeoutMs);
}

export function observeRenderer(page, timeoutMs = 2000) {
  return boundedObservation(() => page.evaluate(rendererRevisions), 'renderer', timeoutMs);
}
