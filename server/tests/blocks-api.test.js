import test from 'node:test';
import assert from 'node:assert/strict';
import { createMemoryBlocks } from '../blocks.js';
import { blockAction } from '../blocks-api.js';
import { socialAction } from '../social-api.js';
import { profileAction } from '../profile-api.js';
import { groupAction } from '../groups-api.js';
import { createMemorySocial } from '../social.js';
import { createMemoryProfiles } from '../profiles.js';
import { createMemoryGroups } from '../groups.js';

// The route rules shared by both transports. A blocked resident is answered exactly as
// one who is not here, so the refusal never tells them they were blocked.
const erin = { userId: 'erin', name: 'Erin', sessionId: 'erin-s' }, pat = { userId: 'pat', name: 'Pat', sessionId: 'pat-s' };
const gone = { userId: 'gone', name: 'Gone', sessionId: 'gone-s' };
function setup() {
  const blocks = createMemoryBlocks(), social = createMemorySocial(), profiles = createMemoryProfiles(), groups = createMemoryGroups();
  const here = new Map([erin, pat, gone].map(person => [person.userId, { id: person.userId, name: person.name }]));
  const visiblePlayer = async (_user, peerId) => here.get(peerId) ?? null;
  const common = { social, readBody: null, visiblePlayer, allowWrite: async () => true };
  const call = (fn, action, identity, data, more = {}) => fn({ ...common, ...more, action, identity, readBody: async () => data, blocks });
  return { blocks, social, profiles, groups, here, call };
}

test('blocking needs a resident you can see or a contact, never yourself, and holds the write limit', async () => {
  const { call, here } = setup();
  assert.equal((await call(blockAction, 'add', erin, { peerId: 'erin' })).status, 400);
  assert.equal((await call(blockAction, 'add', erin, { peerId: 'stranger' })).status, 404);
  assert.equal((await call(blockAction, 'add', erin, { peerId: 'pat', extra: 1 })).status, 400);
  assert.equal((await call(blockAction, 'add', erin, { peerId: 'pat' }, { allowWrite: async () => false })).status, 429);
  const separated = [];
  assert.equal((await call(blockAction, 'add', erin, { peerId: 'pat' }, { separated: async (...args) => separated.push(args) })).status, 200);
  assert.deepEqual(separated, [['erin', 'pat', true]]);
  here.delete('pat');
  assert.deepEqual((await call(blockAction, 'list', erin)).value, { blocked: [{ id: 'pat', name: 'Pat' }] });
  assert.equal((await call(blockAction, 'remove', erin, { peerId: 'pat' }, { separated: async (...args) => separated.push(args) })).status, 200);
  assert.deepEqual(separated.at(-1), ['erin', 'pat', false]);
  assert.deepEqual((await call(blockAction, 'list', erin)).value, { blocked: [] });
  assert.equal((await call(blockAction, 'add', erin, { peerId: 'pat' })).status, 404, 'once out of sight and not a contact, not blockable');
});

test('a block ends the contact, and every contact action answers as for a resident who is not here', async () => {
  const { call, social, here } = setup();
  assert.equal((await call(socialAction, 'request', pat, { peerId: 'erin' })).status, 200);
  assert.equal((await call(socialAction, 'accept', erin, { peerId: 'pat' })).status, 200);
  assert.equal((await call(socialAction, 'send', pat, { peerId: 'erin', text: 'hello' })).status, 200);
  assert.equal((await call(blockAction, 'add', erin, { peerId: 'pat' })).status, 200);
  assert.deepEqual(await social.list('erin'), []);
  assert.deepEqual(await social.list('pat'), []);
  here.delete('gone');
  // Pat, blocked, and the same calls aimed at someone who has left: well formed or
  // crafted, with or without a world or place to invite into.
  const variants = [['request', {}], ['accept', {}], ['send', { text: 'hi' }], ['send', {}], ['send', { text: '' }], ['messages', {}],
    ['invite-world', {}], ['invite-world', { extra: 1 }], ['invite-place', { placeId: 'arrival' }], ['invite-place', { placeId: 'not a place' }], ['invite-place', {}]];
  const settings = [
    { inviteWorld: async () => ({ id: 'w', title: 'W' }), invitePlace: async () => ({ world: { id: 'w', title: 'W' }, place: { id: 'arrival', name: 'Arrival' } }) },
    { inviteWorld: async () => null, invitePlace: async () => null }];
  for (const more of settings) for (const [action, data] of variants) {
    const blocked = await call(socialAction, action, pat, { peerId: 'erin', ...data }, more);
    const absent = await call(socialAction, action, pat, { peerId: 'gone', ...data }, more);
    assert.deepEqual(blocked, absent, JSON.stringify([action, data, Boolean(await more.inviteWorld())]));
  }
  // Erin, who blocked, is refused the same way.
  assert.deepEqual(await call(socialAction, 'request', erin, { peerId: 'pat' }), await call(socialAction, 'request', erin, { peerId: 'gone' }));
  assert.deepEqual((await call(socialAction, 'list', pat)).value.contacts, []);
});

test('a blocked profile reads as one that is not here, and shared groups drop their messages', async () => {
  const { call, profiles, groups, social } = setup();
  await profiles.save('erin', { tagline: 'erin', bio: '', pronouns: '', interests: [], expectedVersion: 0 });
  assert.equal((await call(profileAction, 'view', pat, { peerId: 'erin' }, { profiles })).status, 200);
  const group = (await groups.create(pat, { name: 'Pat circle' })).group;
  await social.request(pat, erin);await social.accept('erin', 'pat');
  await groups.invite(pat, group.id, erin);await groups.accept('erin', group.id);
  await groups.send(erin, group.id, 'erin words');await groups.send(pat, group.id, 'pat words');
  await call(blockAction, 'add', pat, { peerId: 'erin' });
  const blocked = await call(profileAction, 'view', pat, { peerId: 'erin' }, { profiles });
  const absent = await call(profileAction, 'view', pat, { peerId: 'nobody' }, { profiles, visiblePlayer: async () => null });
  assert.deepEqual(blocked, absent);
  const read = await call(groupAction, 'read', pat, { groupId: group.id }, { groups });
  assert.deepEqual(read.value.group.messages.map(item => item.text), ['pat words']);
  const erinRead = await call(groupAction, 'read', erin, { groupId: group.id }, { groups });
  assert.deepEqual(erinRead.value.group.messages.map(item => item.text), ['erin words']);
  const listed = await call(groupAction, 'list', pat, null, { groups });
  assert.equal(listed.value.groups[0].latest?.text ?? null, 'pat words');
  // Unblocking restores what was hidden; the contact itself does not come back.
  await call(blockAction, 'remove', pat, { peerId: 'erin' });
  assert.equal((await call(profileAction, 'view', pat, { peerId: 'erin' }, { profiles })).status, 200);
  assert.equal((await call(groupAction, 'read', pat, { groupId: group.id }, { groups })).value.group.messages.length, 2);
});

test('a contact request racing a block does not leave a contact behind', async () => {
  const { call, social, blocks } = setup();
  // Erin blocks Pat while Pat's request is being written.
  const racing = { ...social, async request(...args) { const result = await social.request(...args);
    await blocks.add('erin', { userId: 'pat', name: 'Pat' });await social.remove('erin', 'pat');return result; } };
  const answer = await call(socialAction, 'request', pat, { peerId: 'erin' }, { social: racing });
  assert.deepEqual(answer, { status: 409, value: { error: 'Meet this resident in the same world first.' } });
  assert.deepEqual(await social.list('pat'), []);assert.deepEqual(await social.list('erin'), []);
  await blocks.remove('erin', 'pat');
  assert.deepEqual(await social.list('pat'), [], 'nothing comes back on unblock');
});

test('an Unblock with no block of one’s own leaves a contact alone', async () => {
  const { call, social } = setup();
  assert.equal((await call(socialAction, 'request', pat, { peerId: 'erin' })).status, 200);
  assert.equal((await call(socialAction, 'accept', erin, { peerId: 'pat' })).status, 200);
  assert.equal((await call(blockAction, 'remove', erin, { peerId: 'pat' })).status, 200, 'a stale click from another tab');
  assert.equal((await social.list('erin')).length, 1);
});
