import test from 'node:test';
import assert from 'node:assert/strict';
import { createVisitorReactions } from '../src/visitor-persona.js';

const pose = { position: [0, 0, 0], ground: 0, roomId: null };
const resident = (id, x = 2) => ({ id, position: [x, 0, 0], life: { speed: 1, heading: 1, action: 'continue', route: [[20, 0]] } });

test('only the closest passerby briefly acknowledges the visitor without changing a routine', () => {
  const reactions = createVisitorReactions(), farther = resident('farther', 3), nearest = resident('nearest');
  const routine = structuredClone(nearest.life);
  assert.deepEqual(reactions.update([farther, nearest], pose, 'jevica', 0), [nearest]);
  assert.deepEqual(nearest.visitorReaction, { form: 'jevica', action: 'acknowledge', passive: true });
  assert.deepEqual(nearest.life, routine);
  assert.deepEqual(reactions.update([farther, nearest], pose, 'jevica', 1000), []);
  assert.equal(nearest.visitorReaction, undefined);
  assert.deepEqual(reactions.update([farther, nearest], pose, 'jevica', 11000), []);
  assert.deepEqual(reactions.update([farther, nearest], pose, 'jevica', 12000), [farther]);
});

test('remaining nearby never restarts a reaction, even after the cooldown', () => {
  const reactions = createVisitorReactions(), local = resident('local');
  reactions.update([local], pose, 'jevica', 0);
  for (const now of [1000, 28001, 90001, 300000]) {
    assert.deepEqual(reactions.update([local], pose, 'jevica', now), []);
  }
  local.position[0] = 12;
  reactions.update([local], pose, 'jevica', 300001);
  local.position[0] = 2;
  assert.deepEqual(reactions.update([local], pose, 'jevica', 300002), [local]);
});

test('leaving and returning quickly does not bypass recognition cooldown', () => {
  const reactions = createVisitorReactions(), local = resident('local');
  reactions.update([local], pose, 'jevica', 0);
  local.position[0] = 12;
  reactions.update([local], pose, 'jevica', 1000);
  local.position[0] = 2;
  assert.deepEqual(reactions.update([local], pose, 'jevica', 12000), []);
  assert.deepEqual(reactions.update([local], pose, 'jevica', 90000), [local]);
});

test('workers, helpers, conversations and distant or unseen people keep their activities', () => {
  const locals = [
    { ...resident('worker'), indoor: true },
    { ...resident('helper'), life: { visitId: 'visit' } },
    { ...resident('chatting'), life: { status: 'chatting' } },
    { ...resident('sheltering'), life: { action: 'seek_shelter' } },
    { ...resident('abducted'), abducted: true },
    resident('distant', 6),
    { ...resident('other-room'), storeId: 'shop' },
    { ...resident('above'), position: [2, 0, 4] },
    resident('hidden'),
  ];
  assert.deepEqual(createVisitorReactions().update(locals, pose, 'jevica', 0, () => false), []);
  assert.deepEqual(createVisitorReactions().update(locals.slice(0, -1), pose, 'jevica', 0), []);
});

test('a lost visitor pose clears an active nod and a reset permits a fresh scene', () => {
  const reactions = createVisitorReactions(), local = resident('local');
  reactions.update([local], pose, 'jevica', 0);
  assert.deepEqual(reactions.update([local], null, 'jevica', 100), []);
  assert.equal(local.visitorReaction, undefined);
  reactions.reset();
  assert.deepEqual(reactions.update([local], pose, 'jevica', 200), [local]);
});
