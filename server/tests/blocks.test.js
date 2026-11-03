import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import Redis from 'ioredis';
import { BLOCK_LIMIT, createMemoryBlocks, createRedisBlocks, grantedPeer, loadHidden } from '../blocks.js';

// Both twins: a block counts both ways, keeps the name for the list, holds a limit,
// and account erasure removes the account from every list it is on.
const redisUrl = process.env.REDIS_URL;
const pat = { userId: 'pat', name: 'Pat' }, erin = { userId: 'erin', name: 'Erin' }, third = { userId: 'third', name: 'Third' };
function twins(name, check) {
  test(`${name} (memory)`, async () => check(createMemoryBlocks()));
  test(`${name} (Redis)`, { skip: !redisUrl }, async t => {
    const redis = new Redis(redisUrl), prefix = `{blocks-test:${randomUUID()}}`;redis.on('error', () => {});
    t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
    await check(createRedisBlocks({ redis, prefix }));
  });
}

twins('a block hides both residents from each other until it is removed', async blocks => {
  assert.equal((await blocks.add('erin', pat)).ok, true);
  assert.equal((await blocks.add('erin', { ...pat, name: '  Pat again ' })).ok, true);
  assert.deepEqual(await blocks.list('erin'), [{ id: 'pat', name: 'Pat again' }]);
  assert.deepEqual(await blocks.list('pat'), []);
  assert.equal(await blocks.between('erin', 'pat'), true);
  assert.equal(await blocks.between('pat', 'erin'), true);
  assert.equal(await blocks.between('pat', 'third'), false);
  assert.deepEqual([...await blocks.hidden('pat')], ['erin']);
  assert.deepEqual([...await blocks.hidden('erin')], ['pat']);
  assert.equal((await blocks.remove('erin', 'pat')).ok, true);
  assert.equal(await blocks.between('pat', 'erin'), false);
  assert.deepEqual([...await blocks.hidden('pat')], []);
  // Only the one who blocked can lift it.
  await blocks.add('erin', pat);await blocks.remove('pat', 'erin');
  assert.equal(await blocks.between('erin', 'pat'), true);
});

twins('blocks refuse oneself, bad ids and a full list', async blocks => {
  assert.deepEqual(await blocks.add('erin', erin), { ok: false, reason: 'invalid' });
  assert.deepEqual(await blocks.add('erin', { userId: '', name: 'Nobody' }), { ok: false, reason: 'invalid' });
  assert.deepEqual(await blocks.add('erin', { userId: 'x'.repeat(161), name: 'Long' }), { ok: false, reason: 'invalid' });
  assert.deepEqual(await blocks.add('erin', null), { ok: false, reason: 'invalid' });
  for (let i = 0; i < BLOCK_LIMIT; i++) assert.equal((await blocks.add('erin', { userId: `peer-${i}`, name: `Peer ${i}` })).ok, true);
  assert.deepEqual(await blocks.add('erin', { userId: 'one-more', name: 'One more' }), { ok: false, reason: 'limit' });
  assert.equal((await blocks.add('erin', { userId: 'peer-0', name: 'Peer 0' })).ok, true);
  assert.equal((await blocks.list('erin')).length, BLOCK_LIMIT);
});

twins('erasing an account removes its list and its place on everyone else’s', async blocks => {
  await blocks.add('erin', pat);await blocks.add('third', erin);await blocks.add('pat', third);
  await blocks.eraseUser('erin');
  assert.deepEqual(await blocks.list('erin'), []);
  assert.deepEqual(await blocks.list('third'), []);
  assert.deepEqual([...await blocks.hidden('pat')], ['third']);
  assert.equal(await blocks.between('erin', 'pat'), false);
  await blocks.eraseUser('erin');
  assert.deepEqual(await blocks.list('pat'), [{ id: 'third', name: 'Third' }]);
});

test('the standalone town’s block file outlasts a restart, keeps erasure, and refuses a damaged file', async t => {
  const { mkdtemp, rm, readFile, writeFile, stat } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');const { join } = await import('node:path');
  const { createFileBlocks } = await import('../blocks.js');
  const folder = await mkdtemp(join(tmpdir(), 'river-oaks-block-file-'));t.after(() => rm(folder, { recursive: true, force: true }));
  const path = join(folder, 'private', 'blocks.json');
  const first = await createFileBlocks(path);
  assert.equal((await first.add('erin', { userId: 'pat', name: 'Pat' })).ok, true);
  assert.equal((await first.add('kim', { userId: 'erin', name: 'Erin' })).ok, true);
  assert.equal((await stat(path)).mode & 0o777, 0o600);
  const again = await createFileBlocks(path);
  assert.deepEqual(await again.list('erin'), [{ id: 'pat', name: 'Pat' }]);
  assert.equal(await again.between('pat', 'erin'), true);
  assert.deepEqual([...await again.hidden('erin')].sort(), ['kim', 'pat']);
  await again.eraseUser('erin');
  assert.equal((await readFile(path, 'utf8')).includes('erin'), false);
  assert.deepEqual(await (await createFileBlocks(path)).list('kim'), []);
  // A change that alters nothing writes nothing.
  const quiet = join(folder, 'quiet', 'blocks.json'), untouched = await createFileBlocks(quiet);
  await untouched.eraseUser('nobody');await untouched.remove('kim', 'nobody');
  await assert.rejects(stat(quiet), { code: 'ENOENT' });
  // A write that fails changes nothing, here or in the file.
  const { chmod } = await import('node:fs/promises');
  const locked = await createFileBlocks(path);
  await chmod(join(folder, 'private'), 0o500);
  try {
    await assert.rejects(locked.add('kim', { userId: 'pat', name: 'Pat' }));
    assert.deepEqual(await locked.list('kim'), []);assert.equal(await locked.between('kim', 'pat'), false);
  } finally { await chmod(join(folder, 'private'), 0o700); }
  assert.equal((await locked.add('kim', { userId: 'pat', name: 'Pat' })).ok, true, 'it works again once the folder can be written');
  assert.deepEqual(await (await createFileBlocks(path)).list('kim'), [{ id: 'pat', name: 'Pat' }]);
  await writeFile(path, '{"version":2,"blocks":[]}');
  await assert.rejects(createFileBlocks(path), /Invalid block store/);
});

twins('an account’s block version changes whenever what is hidden from it may have', async blocks => {
  const versions = async () => Promise.all(['erin', 'pat', 'third'].map(id => blocks.version(id)));
  const [erin0, pat0, third0] = await versions();
  await blocks.add('erin', pat);
  const [erin1, pat1, third1] = await versions();
  assert.ok(erin1 !== erin0 && pat1 !== pat0, 'both sides');assert.equal(third1, third0, 'nobody else');
  await blocks.remove('erin', 'pat');
  const [erin2, pat2] = await versions();assert.ok(erin2 !== erin1 && pat2 !== pat1);
  await blocks.add('third', erin);await blocks.add('erin', pat);
  const [, pat3, third3] = await versions();
  await blocks.eraseUser('erin');
  const [, pat4, third4] = await versions();
  assert.ok(pat4 !== pat3 && third4 !== third3, 'erasure reaches both kinds of peer');
  assert.deepEqual([...await blocks.hidden('pat')], []);
});

test('a hidden set loads only when the version moves, and an earlier read never replaces a later one', async () => {
  const blocks = createMemoryBlocks(), holder = { hidden: new Set() };
  let reads = 0;const counting = { version: id => blocks.version(id), hidden: async id => { reads++;return blocks.hidden(id); } };
  await loadHidden(counting, holder, 'erin');await loadHidden(counting, holder, 'erin');
  assert.equal(reads, 1, 'an unchanged version reads nothing more');
  await blocks.add('erin', pat);await loadHidden(counting, holder, 'erin');
  assert.deepEqual([...holder.hidden], ['pat']);assert.equal(reads, 2);
  // A slow read from before an unblock finishes after the read that follows it.
  let release;const slow = { version: id => blocks.version(id), hidden: id => new Promise(resolve => { release = () => resolve(new Set(['pat'])); }) };
  holder.hiddenVersion = -1;const earlier = loadHidden(slow, holder, 'erin');
  await new Promise(resolve => setImmediate(resolve));
  await blocks.remove('erin', 'pat');await loadHidden(counting, holder, 'erin');
  release();await earlier;
  assert.deepEqual([...holder.hidden], [], 'the later, empty set stands');
});

twins('removing someone who is not blocked changes no version', async blocks => {
  const versions = () => Promise.all(['erin', 'stranger'].map(id => blocks.version(id)));
  const before = await versions();
  assert.deepEqual(await blocks.remove('erin', 'stranger'), { ok: true });
  assert.deepEqual(await versions(), before);
});

test('every command that gives another account access is recognised, and nothing else', () => {
  for (const command of [{ type: 'campus', action: 'grant', peerId: 'pat' }, { type: 'office', action: 'invite', peerId: 'pat' }, { type: 'homeAccess', action: 'grant', peerId: 'pat' }])
    assert.equal(grantedPeer(command), 'pat', JSON.stringify(command));
  for (const command of [{ type: 'campus', action: 'ungrant', peerId: 'pat' }, { type: 'office', action: 'remove', peerId: 'pat' }, { type: 'interaction', action: 'invite', peerId: 'pat' },
    { type: 'campus', action: 'grant' }, { type: 'campus', action: 'grant', peerId: 7 }, null])
    assert.equal(grantedPeer(command), null, JSON.stringify(command));
});

test('Redis: removing a block also clears a reverse index entry left without its list entry', { skip: !redisUrl }, async t => {
  const redis = new Redis(redisUrl), prefix = `{blocks-test:${randomUUID()}}`;redis.on('error', () => {});
  t.after(async () => { const keys = await redis.keys(`${prefix}*`); if (keys.length) await redis.del(...keys); await redis.quit(); });
  const blocks = createRedisBlocks({ redis, prefix }), hash = id => createHash('sha256').update(id).digest('hex');
  await redis.sadd(`${prefix}:blocks:v1:by:${hash('stranger')}`, 'erin');
  assert.deepEqual([...await blocks.hidden('stranger')], ['erin'], 'the leftover hides them');
  const before = await Promise.all(['erin', 'stranger'].map(id => blocks.version(id)));
  assert.deepEqual(await blocks.remove('erin', 'stranger'), { ok: true });
  assert.deepEqual([...await blocks.hidden('stranger')], []);
  assert.deepEqual(await Promise.all(['erin', 'stranger'].map(id => blocks.version(id))), before.map(version => version + 1), 'and sockets reload');
});
