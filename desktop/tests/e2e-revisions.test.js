import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { harnessSource, observeApplication, observeRenderer, revisionFixtureURL } from '../e2e-revisions.js';

// Match Playwright's cross-process serialization, including its lack of closures.
const evaluated = (observer, realm, args = []) => JSON.parse(JSON.stringify(runInNewContext(`(${observer.toString()})(...args)`, { ...realm, args })));
const page = window => ({ evaluate: observer => evaluated(observer, { window }) });

test('the local fixture address enables its existing snapshot observer while retaining its route and query', () => {
  const url = new URL(revisionFixtureURL('http://127.0.0.1:12345/play?world=fixture-world&finish=classic'));
  assert.equal(url.origin, 'http://127.0.0.1:12345');
  assert.equal(url.pathname, '/play');
  assert.equal(url.searchParams.get('world'), 'fixture-world');
  assert.equal(url.searchParams.get('finish'), 'classic');
  assert.equal(url.searchParams.get('motion-debug'), '1');
  assert.equal(revisionFixtureURL(url.href), url.href);
});

test('harness provenance observes real clean/dirty Git state and leaves a missing checkout unknown', async t => {
  const root = await mkdtemp(join(tmpdir(), 'desktop-revision-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(harnessSource(root), { status: 'unavailable', reason: 'harness-git-checkout-unavailable' });
  const git = args => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']);
  // A synthetic test repository, never the product branch or published history.
  git(['-c', 'user.name=Receipt Fixture', '-c', 'user.email=receipt@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '-qm', 'fixture', '--allow-empty']);
  assert.deepEqual(harnessSource(root), { status: 'observed', revision: git(['rev-parse', 'HEAD']), tree: git(['rev-parse', 'HEAD^{tree}']), dirty: false });
  await writeFile(join(root, 'untracked-fixture.txt'), 'dirty\n');
  assert.equal(harnessSource(root).dirty, true);
});

test('launched app identity comes from its own process and does not invent source provenance', async () => {
  const app = { evaluate: observer => evaluated(observer, { process: { platform: 'win32', arch: 'x64', versions: { electron: 'fixture-electron', chrome: 'fixture-chrome', node: 'fixture-node' }, env: { PRIVATE: 'do-not-copy' } } }, [{ app: { getVersion: () => '99.1.2', isPackaged: true } }]) };
  const result = await observeApplication(app);
  assert.deepEqual(result, { status: 'observed', version: '99.1.2', isPackaged: true, platform: 'win32', arch: 'x64', runtime: { electron: 'fixture-electron', chrome: 'fixture-chrome', node: 'fixture-node' }, sourceRevision: { status: 'unavailable', reason: 'application-does-not-expose-source-revision' } });
  assert.ok(!JSON.stringify(result).includes('do-not-copy'));
});

test('renderer receipts separate the preferred finish, attached components and accepted snapshot facts', async () => {
  const result = await observeRenderer(page({
    __riverSpatialStream: () => ({ finish: { preference: 'pink-jet-age', commons: 'classic', heights: ['classic', 'pink-jet-age'], campus: null,
      ribbon: { id: 'fixture-ribbon', hash: 'fixture-ribbon-hash', finish: 'classic', stats: { private: 'do-not-copy' } },
      fiveRooms: { version: 'fixture-v2', finish: 'pink-jet-age', interiors: false, venues: [{ private: 'do-not-copy' }] },
      fiveRoomsLandscape: { version: 'fixture-v2', hash: 'fixture-landscape', pending: ['do-not-copy'] } }, inventory: { private: 'do-not-copy' } }),
    __riverMultiplayer: () => ({ connected: false, selfId: 'do-not-copy', snapshot: { worldId: 'fixture-world', protocolVersion: 8, districtRevision: null, revision: 0, players: [{ name: 'do-not-copy' }], regionSha256: 'fixture-region' } }),
  }));
  assert.equal(result.style.preference.value, 'pink-jet-age');
  assert.deepEqual(result.style.components.commons, { status: 'observed', value: 'classic' });
  assert.deepEqual(result.style.components.heights.value, ['classic', 'pink-jet-age']);
  assert.deepEqual(result.style.components.campus, { status: 'observed', value: null });
  assert.equal(result.style.components.ribbon.value.finish.value, 'classic');
  assert.equal(result.style.components.fiveRooms.value.version.value, 'fixture-v2');
  assert.equal(result.style.components.fiveRooms.value.interiors.value, false);
  assert.equal(result.style.components.fiveRoomsLandscape.value.hash.value, 'fixture-landscape');
  assert.deepEqual(result.style.components.fiveRoomsLandscape.value.finish, { status: 'unavailable', reason: 'field-not-exposed' });
  assert.equal(result.content.source, 'accepted-multiplayer-snapshot');
  assert.equal(result.content.connected, false);
  assert.deepEqual(result.content.districtRevision, { status: 'observed', value: null });
  assert.deepEqual(result.content.snapshotRevision, { status: 'observed', value: 0 });
  assert.equal(result.content.regionSha256.value, 'fixture-region');
  assert.equal(result.sourceRevision.status, 'unavailable');
  assert.match(result.capturedAt, /^\d{4}-\d\d-\d\dT/);
  assert.ok(!JSON.stringify(result).includes('do-not-copy'));
});

test('absent observers and absent snapshot fields remain explicitly unknown', async () => {
  const absent = await observeRenderer(page({}));
  assert.equal(absent.style.status, 'unavailable');
  assert.equal(absent.content.status, 'unavailable');
  const partial = await observeRenderer(page({ __riverMultiplayer: () => ({ connected: true, snapshot: { worldId: 'fixture' } }) }));
  assert.equal(partial.content.worldId.value, 'fixture');
  assert.deepEqual(partial.content.districtRevision, { status: 'unavailable', reason: 'field-not-exposed' });
  assert.equal(partial.content.snapshotRevision.status, 'unavailable');
  assert.equal(partial.content.regionSha256.status, 'unavailable');
});

test('failing observers are additive and an unavailable renderer cannot replace the original test error', async () => {
  const original = new Error('original behavioral failure'), report = { error: original.stack };
  report.revisions = await observeRenderer({ evaluate() { throw new Error('renderer unavailable'); } });
  assert.equal(report.error, original.stack);
  assert.deepEqual(report.revisions, { status: 'unavailable', reason: 'renderer-observation-failed' });
  assert.deepEqual(await observeApplication({ evaluate: async () => { throw new Error('app gone'); } }), { status: 'unavailable', reason: 'application-observation-failed' });
  const internal = await observeRenderer(page({ __riverSpatialStream() { throw new Error('finish gone'); }, __riverMultiplayer() { throw new Error('town gone'); } }));
  assert.equal(internal.style.reason, 'renderer-finish-observation-failed');
  assert.equal(internal.content.reason, 'accepted-world-observation-failed');
});

test('stalled cross-process observations time out without needing the stalled call to settle', async () => {
  const stalled = { evaluate: () => new Promise(() => {}) };
  assert.deepEqual(await observeRenderer(stalled, 10), { status: 'unavailable', reason: 'renderer-observation-timed-out' });
  assert.deepEqual(await observeApplication(stalled, 10), { status: 'unavailable', reason: 'application-observation-timed-out' });
});
